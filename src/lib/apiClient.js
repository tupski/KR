/**
 * src/lib/apiClient.js
 *
 * Supabase-JS-compatible frontend client for the self-hosted generic data API
 * (server/routes/data.js). Drop-in replacement so components can migrate from
 * `@supabase/supabase-js` with minimal edits.
 *
 * Usage:
 *   import { createApiClient } from '@/lib/apiClient';
 *   const supabase = createApiClient();           // same call shape as before
 *   const { data, error } = await supabase
 *     .from('transactions')
 *     .select('id, customer_name')
 *     .eq('apartment_location', 'X')
 *     .order('created_at', { ascending: false })
 *     .range(0, 19);
 *   const { data } = await supabase.rpc('get_category_summary', { p_lokasi: 'X' });
 *
 * Every query resolves to the supabase-js shape: { data, error, count }.
 * Errors never throw — they come back in `error` (message/details/hint/code).
 *
 * postgrestCompat — what this shim does NOT support (vs supabase-js):
 *   - Realtime channels: .channel(), .on('postgres_changes'), presence,
 *     broadcast — NO realtime. Poll or refresh manually.
 *   - supabase.auth.* — auth goes through /api/auth/* with httpOnly cookies.
 *   - supabase.storage.* — use the existing storage abstraction/upload routes.
 *   - Embedded resources / joins: select('*, other_table(*)') and
 *     .eq('other_table.col', v) / order(col, { foreignTable }) are NOT
 *     supported (server allowlist is single-table only).
 *   - Head/count options: { head: true } and { count: 'exact'|'planned' }
 *     are accepted but count is best-effort (server COUNT(*) only for head).
 *   - Filters beyond the allowlist: only eq/neq/gt/gte/lt/lte/in/is/like/
 *     ilike/or/order/range/limit. No fts, cs, cd, ov, sl, sr, not.*, match.
 *   - Scalar-returning RPCs come back as rows [{ fn_name: value }] — the
 *     server cannot distinguish scalar vs set-returning functions. Check
 *     `error` only for functions like sign_out_own_devices().
 *   - .csv() / .geojson() response formats, .abortSignal() passthrough,
 *     upsert `ignoreDuplicates` (server always DO UPDATE), .select() after
 *     mutation (mutations always return the affected rows).
 *   - Real supabase PostgREST URL syntax is NOT used; requests are POST JSON
 *     to /api/data/query and /api/data/rpc with credentials:'include'.
 */

const DEFAULT_BASE_URL = '';

const FILTER_METHODS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];

/**
 * Parse a PostgREST-style `.or()` string: "col.eq.val,col2.ilike.%x%,d.in.(a,b)"
 * into [{ column, op, value }] filters (nested `or` groups `.or(a,b)` become
 * { or: [...] }).
 */
export function parseOrString(str) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === '(' ) depth += 1;
    if (ch === ')' ) depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);

  return parts.map((p) => {
    const trimmed = p.trim();
    // Nested groups: "or(a.eq.1,b.eq.2)" and "and(a.gte.x,b.is.null)" —
    // postgrest-style boolean groups. Kept as structured groups so the server
    // can compile correct boolean semantics (timestamps contain dots, so the
    // group MUST be recognized before naive dot-splitting).
    const nestedOr = trimmed.match(/^or\((.*)\)$/s);
    if (nestedOr) return { or: parseOrString(nestedOr[1]) };
    const nestedAnd = trimmed.match(/^and\((.*)\)$/s);
    if (nestedAnd) return { and: parseOrString(nestedAnd[1]) };

    const firstDot = trimmed.indexOf('.');
    if (firstDot < 0) throw new Error(`Invalid or() filter: ${trimmed}`);
    const column = trimmed.slice(0, firstDot);
    const rest = trimmed.slice(firstDot + 1);
    const secondDot = rest.indexOf('.');
    if (secondDot < 0) throw new Error(`Invalid or() filter: ${trimmed}`);
    const op = rest.slice(0, secondDot);
    let value = rest.slice(secondDot + 1);

    if (op === 'is') {
      return { column, op: 'is-null', value: null };
    }
    if (op === 'in') {
      const m = value.match(/^\((.*)\)$/s);
      const inner = m ? m[1] : value;
      return {
        column,
        op: 'in',
        value: inner.split(',').map((v) => unquote(v.trim())).filter((v) => v !== ''),
      };
    }
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    return { column, op, value };
  });
}

function unquote(v) {
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return v.slice(1, -1);
  return v;
}

function makeError(message, code, status) {
  return {
    message,
    details: '',
    hint: null,
    code: code || String(status || 'ERROR'),
    status,
  };
}

class QueryBuilder {
  constructor(client, table) {
    this._client = client;
    this._table = table;
    this._op = null;          // 'select' | 'insert' | 'update' | 'delete' | 'upsert'
    this._columns = undefined;
    this._filters = [];
    this._order = [];
    this._limit = undefined;
    this._offset = undefined;
    this._values = undefined;
    this._onConflict = undefined;
    this._head = false;
    this._single = false;
    this._maybeSingle = false;
    this._promise = null;
    this._clientError = null;
  }

  // ---- terminal-ish setters ------------------------------------------------
  select(columns = '*', options = {}) {
    this._op = 'select';
    this._columns =
      columns === '*' || columns == null
        ? undefined
        : String(columns).split(',').map((c) => c.trim()).filter(Boolean);
    if (options.head) this._head = true;
    return this;
  }

  insert(values, _options = {}) {
    this._op = 'insert';
    this._values = values;
    return this;
  }

  update(values, _options = {}) {
    this._op = 'update';
    this._values = values;
    return this;
  }

  upsert(values, options = {}) {
    this._op = 'upsert';
    this._values = values;
    if (options.onConflict) {
      this._onConflict = String(options.onConflict)
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    }
    return this;
  }

  delete(_options = {}) {
    this._op = 'delete';
    return this;
  }

  // ---- filters --------------------------------------------------------------
  eq(column, value) { return this._filter(column, 'eq', value); }
  neq(column, value) { return this._filter(column, 'neq', value); }
  gt(column, value) { return this._filter(column, 'gt', value); }
  gte(column, value) { return this._filter(column, 'gte', value); }
  lt(column, value) { return this._filter(column, 'lt', value); }
  lte(column, value) { return this._filter(column, 'lte', value); }

  in(column, values) {
    return this._filter(column, 'in', values);
  }

  is(column, value) {
    if (value === null) return this._filter(column, 'is-null', null);
    return this._filter(column, 'eq', value);
  }

  like(column, pattern) { return this._filter(column, 'like', pattern); }
  ilike(column, pattern) { return this._filter(column, 'ilike', pattern); }

  or(filtersString, _options = {}) {
    try {
      const parsed = parseOrString(String(filtersString));
      if (parsed.length === 1) this._filters.push(parsed[0]);
      else this._filters.push({ or: parsed });
    } catch (e) {
      this._clientError = makeError(e.message, 'BAD_OR_FILTER');
    }
    return this;
  }

  _filter(column, op, value) {
    this._filters.push({ column: String(column), op, value });
    return this;
  }

  // ---- modifiers --------------------------------------------------------------
  order(column, options = {}) {
    this._order.push({
      column: String(column),
      direction: options.ascending === false ? 'desc' : 'asc',
    });
    return this;
  }

  range(from, to) {
    this._offset = from;
    this._limit = to - from + 1;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  single() { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }

  // ---- execution --------------------------------------------------------------
  _body() {
    if (this._op === 'select') {
      const body = { table: this._table, op: 'select' };
      if (this._columns) body.columns = this._columns;
      if (this._filters.length) body.filters = this._filters;
      if (this._order.length) body.order = this._order;
      if (this._limit !== undefined) body.limit = this._limit;
      if (this._offset !== undefined) body.offset = this._offset;
      if (this._head) body.count = true;
      return body;
    }
    if (this._op === 'insert' || this._op === 'upsert') {
      const body = { table: this._table, op: this._op, values: this._values };
      if (this._op === 'upsert' && this._onConflict) body.onConflict = this._onConflict;
      return body;
    }
    if (this._op === 'update') {
      return { table: this._table, op: 'update', values: this._values, filters: this._filters };
    }
    if (this._op === 'delete') {
      return { table: this._table, op: 'delete', filters: this._filters };
    }
    throw new Error('QueryBuilder: no operation set. Call .select()/.insert()/.update()/.delete()/.upsert() first.');
  }

  _execute() {
    if (this._clientError) {
      return Promise.resolve({ data: null, error: this._clientError, count: null });
    }
    if (!this._op) {
      return Promise.resolve({
        data: null,
        error: makeError('No operation set on query builder.', 'NO_OPERATION'),
        count: null,
      });
    }
    return this._client
      ._post('/api/data/query', this._body())
      .then(({ data, error, count }) => {
        if (error) return { data: null, error, count: null };
        if (this._single) {
          if (Array.isArray(data) && data.length === 1) return { data: data[0], error: null, count };
          if (Array.isArray(data) && data.length === 0) {
            return {
              data: null,
              error: makeError(
                'JSON object requested, multiple (or no) rows returned',
                'PGRST116',
                406
              ),
              count,
            };
          }
          if (Array.isArray(data)) {
            return {
              data: null,
              error: makeError(
                'JSON object requested, multiple (or no) rows returned',
                'PGRST116',
                406
              ),
              count,
            };
          }
          return { data, error: null, count };
        }
        if (this._maybeSingle) {
          if (Array.isArray(data) && data.length === 0) return { data: null, error: null, count };
          if (Array.isArray(data) && data.length === 1) return { data: data[0], error: null, count };
          if (Array.isArray(data) && data.length > 1) {
            return {
              data: null,
              error: makeError(
                'JSON object requested, multiple (or no) rows returned',
                'PGRST116',
                406
              ),
              count,
            };
          }
        }
        return { data, error: null, count };
      });
  }

  // supabase-js builders are thenable: `await supabase.from(x).select()` works.
  then(onFulfilled, onRejected) {
    if (!this._promise) this._promise = this._execute();
    return this._promise.then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    if (!this._promise) this._promise = this._execute();
    return this._promise.catch(onRejected);
  }

  finally(onFinally) {
    if (!this._promise) this._promise = this._execute();
    return this._promise.finally(onFinally);
  }
}

/**
 * createApiClient(options?)
 * options: { baseUrl?: string, fetchImpl?: Function }
 * Returns a supabase-js-like object: .from(table) chainable builder + .rpc().
 */
export function createApiClient(options = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));

  async function post(endpoint, body) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // httpOnly JWT cookie
        body: JSON.stringify(body),
      });
    } catch (e) {
      return {
        data: null,
        error: makeError(`Network error: ${e.message}`, 'NETWORK_ERROR'),
        count: null,
      };
    }

    const isJson = response.headers?.get?.('content-type')?.includes('application/json');
    let payload = null;
    try {
      payload = isJson === false ? await response.text() : await response.json();
    } catch (_e) {
      payload = null;
    }

    if (!response.ok) {
      const message =
        (payload && (payload.error || payload.message)) ||
        `HTTP ${response.status} Error`;
      const code = (payload && payload.code) || String(response.status);
      return { data: null, error: makeError(message, code, response.status), count: null };
    }

    return {
      data: payload?.data ?? payload ?? null,
      error: null,
      count: payload?.count ?? null,
    };
  }

  return {
    from(table) {
      return new QueryBuilder({ _post: post }, table);
    },

    rpc(fn, params = {}) {
      return {
        then: (onFulfilled, onRejected) =>
          post('/api/data/rpc', { fn, params })
            .then(({ data, error, count }) => ({ data, error, count }))
            .then(onFulfilled, onRejected),
      };
    },
  };
}

// Default singleton — mirrors how components used the old supabase client.
export const apiClient = createApiClient();

export default createApiClient;
