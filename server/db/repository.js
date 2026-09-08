/* eslint-env node */
/**
 * server/db/repository.js
 *
 * Policy-enforcing query builder. Translates a restricted, allowlisted
 * operation set into PARAMETERIZED SQL ($1, $2, ...).
 *
 * Hard guarantees:
 *  - Unknown table            -> PolicyError
 *  - Unknown column           -> PolicyError
 *  - Unknown operator         -> PolicyError
 *  - Role not allowed for op  -> PolicyError
 *  - Password-ish columns     -> never selectable/writable (global blocklist;
 *    also absent from policy map)
 *  - Owner-scoped tables      -> an extra user_id = <actor> predicate is ALWAYS
 *    injected (IDOR prevention): client filters can only narrow, never widen.
 *  - No user input is ever string-interpolated into SQL. Identifiers come only
 *    from the static policy map; values only via bind parameters.
 *
 * Supported ops:
 *   select  { columns?, filters?, order?, limit?, offset?, count? }
 *   insert  { values }                    (single object or array of objects)
 *   update  { values, filters }           (update-by-pk: filters MUST cover pk)
 *   delete  { filters }                   (delete-by-pk: filters MUST cover pk)
 *   upsert  { values, onConflict }
 *   rpc     { fn, params }
 *
 * Filters: { column, op, value } where op is one of FILTER_OPS below.
 * Logical grouping is expressed via { or: [filter, ...] }.
 */

import { getTablePolicy, getRpcPolicy } from './policy.js';

export class PolicyError extends Error {
  constructor(message, code = 'POLICY_DENIED') {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
  }
}

/** Any column matching these patterns is never exposed, whatever the policy says. */
const DENY_COLUMN_PATTERNS = [/password/i, /secret/i, /token_hash/i];

export const FILTER_OPS = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'IN',
  'is-null': 'IS NULL',
  like: 'LIKE',
  ilike: 'ILIKE',
};

const ORDER_DIRECTIONS = new Set(['asc', 'desc']);

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

/** actor = { userId: string, role: 'karyawan'|'admin'|'super_admin' } */
function assertActor(actor) {
  if (!actor || !actor.userId || !actor.role) {
    throw new PolicyError('Actor without userId/role.', 'UNAUTHENTICATED');
  }
}

function ident(name) {
  // Only ever called with names taken from the static policy map.
  return `"${name}"`;
}

function isDeniedColumn(col) {
  return DENY_COLUMN_PATTERNS.some((re) => re.test(col));
}

function assertColumnsAllowed(policy, requested, { writes = false } = {}) {
  for (const col of requested) {
    if (typeof col !== 'string' || !policy.columns.includes(col)) {
      throw new PolicyError(`Unknown or disallowed column: ${String(col)}`, 'UNKNOWN_COLUMN');
    }
    if (isDeniedColumn(col)) {
      throw new PolicyError(`Column permanently blocked: ${col}`, 'DENIED_COLUMN');
    }
    if (writes && policy.readOnlyColumns?.includes(col)) {
      throw new PolicyError(`Column is read-only (generated): ${col}`, 'READONLY_COLUMN');
    }
  }
}

function assertRole(policy, op, actor) {
  const allowed = policy.roles[op];
  if (!Array.isArray(allowed) || !allowed.includes(actor.role)) {
    throw new PolicyError(
      `Role '${actor.role}' may not ${op} on this table.`,
      'ROLE_DENIED'
    );
  }
}

/**
 * Scope predicate builder. Returns SQL fragment + params appended to `params`.
 * Owner-scoping is injected server-side from the verified JWT actor — never
 * from request input — so user A cannot read/write user B's protected rows
 * even by supplying user_id filters (those can only AND-narrow further).
 */
function applyScope(scope, actor, policy, op, params) {
  if (!scope) return null;
  switch (scope.kind) {
    case 'owner':
      params.push(actor.userId);
      return `${ident(scope.column)} = $${params.length}`;
    case 'ownerUnlessAdmin':
      if (scope.adminRoles.includes(actor.role)) return null;
      params.push(actor.userId);
      return `${ident(scope.column)} = $${params.length}`;
    case 'selfOrSuperAdmin':
      if (actor.role === 'super_admin') return null;
      params.push(actor.userId);
      return `${ident(scope.column)} = $${params.length}`;
    case 'audience': {
      // notifications: audience_user_id = me OR audience_role='all' OR audience_role = my role
      params.push(actor.userId, 'all', actor.role);
      const n = params.length;
      return `("audience_user_id" = $${n - 2} OR "audience_role" = $${n - 1} OR ("audience_role" IS NOT NULL AND "audience_role" = $${n}))`;
    }
    default:
      throw new PolicyError(`Unknown scope kind: ${scope.kind}`, 'POLICY_BUG');
  }
}

function normalizeFilters(rawFilters, policy) {
  if (rawFilters == null) return [];
  if (!Array.isArray(rawFilters)) {
    throw new PolicyError('filters must be an array.', 'BAD_REQUEST');
  }
  return rawFilters.map((f) => {
    if (f && Array.isArray(f.or)) {
      return { or: normalizeFilters(f.or, policy) };
    }
    if (f && Array.isArray(f.and)) {
      return { and: normalizeFilters(f.and, policy) };
    }
    if (!f || typeof f.column !== 'string' || typeof f.op !== 'string') {
      throw new PolicyError('Filter must be { column, op, value } or { or: [...] }.', 'BAD_REQUEST');
    }
    if (!policy.columns.includes(f.column) || isDeniedColumn(f.column)) {
      throw new PolicyError(`Unknown or disallowed filter column: ${f.column}`, 'UNKNOWN_COLUMN');
    }
    if (!Object.prototype.hasOwnProperty.call(FILTER_OPS, f.op)) {
      throw new PolicyError(`Unknown filter operator: ${f.op}`, 'UNKNOWN_OPERATOR');
    }
    if (f.op === 'in') {
      if (!Array.isArray(f.value) || f.value.length === 0 || f.value.length > 500) {
        throw new PolicyError("'in' requires a non-empty array (max 500 items).", 'BAD_REQUEST');
      }
      f.value.forEach((v) => {
        if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) {
          throw new PolicyError("'in' values must be scalars.", 'BAD_REQUEST');
        }
      });
    } else if (f.op === 'is-null') {
      // no value needed
    } else if (f.value === undefined) {
      throw new PolicyError(`Filter on ${f.column} requires a value.`, 'BAD_REQUEST');
    } else if (
      f.value !== null &&
      !['string', 'number', 'boolean'].includes(typeof f.value)
    ) {
      throw new PolicyError('Filter values must be scalars or null.', 'BAD_REQUEST');
    }
    return f;
  });
}

/**
 * Compile a filter list into a parenthesized SQL fragment.
 * join = 'AND' | 'OR' — how the TOP-LEVEL members of this list combine:
 *   - implicit top-level filter arrays   -> AND
 *   - { or:  [...] } group members       -> OR  (postgrest or() semantics)
 *   - { and: [...] } group members       -> AND
 */
function compileFilters(filters, params, join = 'AND') {
  const parts = [];
  for (const f of filters) {
    if (f.or) {
      const inner = compileFilters(f.or, params, 'OR');
      if (inner) parts.push(`(${inner})`);
      continue;
    }
    if (f.and) {
      const inner = compileFilters(f.and, params, 'AND');
      if (inner) parts.push(`(${inner})`);
      continue;
    }
    const col = ident(f.column);
    switch (f.op) {
      case 'is-null':
        parts.push(`${col} IS NULL`);
        break;
      case 'in': {
        const placeholders = f.value.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        parts.push(`${col} IN (${placeholders.join(', ')})`);
        break;
      }
      default: {
        params.push(f.value);
        parts.push(`${col} ${FILTER_OPS[f.op]} $${params.length}`);
      }
    }
  }
  return parts.join(` ${join} `);
}

function assertPkCovered(filters, policy, op) {
  const eqCols = new Set();
  const collect = (list) => {
    for (const f of list) {
      if (Array.isArray(f?.or)) collect(f.or);
      else if (Array.isArray(f?.and)) collect(f.and);
      else if (f?.op === 'eq' && typeof f.column === 'string') eqCols.add(f.column);
    }
  };
  collect(filters);
  const missing = policy.pk.filter((k) => !eqCols.has(k));
  if (missing.length > 0) {
    throw new PolicyError(
      `${op} requires equality filters on primary key (${policy.pk.join(', ')}); missing: ${missing.join(', ')}`,
      'PK_REQUIRED'
    );
  }
}

function compileOrder(order, policy, params) {
  if (order == null) return '';
  const list = Array.isArray(order) ? order : [order];
  const parts = [];
  for (const o of list) {
    if (!o || typeof o.column !== 'string') {
      throw new PolicyError('order must be { column, direction? }.', 'BAD_REQUEST');
    }
    if (!policy.columns.includes(o.column) || isDeniedColumn(o.column)) {
      throw new PolicyError(`Unknown or disallowed order column: ${o.column}`, 'UNKNOWN_COLUMN');
    }
    const dir = String(o.direction || 'asc').toLowerCase();
    if (!ORDER_DIRECTIONS.has(dir)) {
      throw new PolicyError(`Invalid order direction: ${dir}`, 'BAD_REQUEST');
    }
    parts.push(`${ident(o.column)} ${dir.toUpperCase()}`);
  }
  return parts.length ? ` ORDER BY ${parts.join(', ')}` : '';
}

function normalizeRows(values, policy) {
  const rows = Array.isArray(values) ? values : [values];
  if (rows.length === 0 || rows.length > 500) {
    throw new PolicyError('insert/upsert accepts 1..500 rows.', 'BAD_REQUEST');
  }
  const keySets = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new PolicyError('Row values must be plain objects.', 'BAD_REQUEST');
    }
    const cols = Object.keys(row);
    if (cols.length === 0) throw new PolicyError('Empty row.', 'BAD_REQUEST');
    assertColumnsAllowed(policy, cols, { writes: true });
    for (const [k, v] of Object.entries(row)) {
      if (v !== null && !['string', 'number', 'boolean'].includes(typeof v) && !(v instanceof Date)) {
        // Allow plain JSON via stringified JSONB from caller; reject functions/symbols silently coerced.
        try { JSON.stringify(v); } catch (_e) {
          throw new PolicyError(`Value for ${k} is not serializable.`, 'BAD_REQUEST');
        }
      }
    }
    keySets.add(cols.slice().sort().join(','));
  }
  if (keySets.size !== 1) {
    throw new PolicyError('All rows must have identical column sets.', 'BAD_REQUEST');
  }
  return rows;
}

// =====================================================================
// Operation builders — each returns { text, params } (pure; no DB access)
// =====================================================================

export function buildSelect({ table, columns, filters, order, limit, offset, count }, actor) {
  assertActor(actor);
  const policy = getTablePolicy(table);
  if (!policy) throw new PolicyError(`Unknown table: ${String(table)}`, 'UNKNOWN_TABLE');
  assertRole(policy, 'select', actor);

  const selectCols = columns && columns.length ? columns : policy.columns;
  if (columns && columns.includes('*')) {
    throw new PolicyError("'*' is not an allowed column specifier.", 'UNKNOWN_COLUMN');
  }
  assertColumnsAllowed(policy, selectCols);

  const params = [];
  const scopeSql = applyScope(policy.scope.select, actor, policy, 'select', params);
  const normFilters = normalizeFilters(filters, policy);
  const filterSql = compileFilters(normFilters, params);

  const where = [scopeSql, filterSql].filter(Boolean).join(' AND ');
  const whereSql = where ? ` WHERE ${where}` : '';

  if (count === true) {
    return {
      text: `SELECT COUNT(*) AS count FROM ${ident(table)}${whereSql}`,
      params,
      resultShape: 'count',
    };
  }

  let lim = Number.isInteger(limit) ? limit : DEFAULT_LIMIT;
  if (!Number.isInteger(lim) || lim < 1) lim = DEFAULT_LIMIT;
  lim = Math.min(lim, MAX_LIMIT);
  let off = Number.isInteger(offset) && offset >= 0 ? offset : 0;

  const orderParams = [];
  const orderSql = compileOrder(order, policy, orderParams);
  // ORDER BY direction is whitelisted (asc/desc), never a bind param.
  params.push(lim, off);

  return {
    text:
      `SELECT ${selectCols.map(ident).join(', ')} FROM ${ident(table)}` +
      `${whereSql}${orderSql} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
    resultShape: 'rows',
  };
}

export function buildInsert({ table, values }, actor) {
  assertActor(actor);
  const policy = getTablePolicy(table);
  if (!policy) throw new PolicyError(`Unknown table: ${String(table)}`, 'UNKNOWN_TABLE');
  assertRole(policy, 'insert', actor);

  const rows = normalizeRows(values, policy);
  const cols = Object.keys(rows[0]);

  const params = [];
  const scope = policy.scope.insert;
  let ownerCol = null;
  if (scope && scope.kind === 'owner') {
    ownerCol = scope.column;
    if (!cols.includes(ownerCol)) {
      // Force the owner column to the actor id (server-controlled).
      cols.push(ownerCol);
    }
  } else if (scope && (scope.kind === 'selfOrSuperAdmin')) {
    if (actor.role !== 'super_admin') {
      ownerCol = scope.column;
      if (!cols.includes(ownerCol)) cols.push(ownerCol);
    }
  }

  const valueRows = rows.map((row) => {
    const placeholders = cols.map((c) => {
      let v;
      if (c === ownerCol) {
        v = actor.userId; // server-enforced; client value ignored
      } else {
        v = row[c];
      }
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) v = JSON.stringify(v);
      params.push(v === undefined ? null : v);
      return `$${params.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  return {
    text:
      `INSERT INTO ${ident(table)} (${cols.map(ident).join(', ')}) ` +
      `VALUES ${valueRows.join(', ')} RETURNING ${policy.columns.map(ident).join(', ')}`,
    params,
    resultShape: 'rows',
  };
}

export function buildUpdate({ table, values, filters }, actor) {
  assertActor(actor);
  const policy = getTablePolicy(table);
  if (!policy) throw new PolicyError(`Unknown table: ${String(table)}`, 'UNKNOWN_TABLE');
  assertRole(policy, 'update', actor);

  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new PolicyError('update requires a values object.', 'BAD_REQUEST');
  }
  const cols = Object.keys(values);
  if (cols.length === 0) throw new PolicyError('update values must not be empty.', 'BAD_REQUEST');
  assertColumnsAllowed(policy, cols, { writes: true });

  const normFilters = normalizeFilters(filters, policy);
  assertPkCovered(normFilters, policy, 'update');

  const params = [];
  const setSql = cols.map((c) => {
    let v = values[c];
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) v = JSON.stringify(v);
    params.push(v);
    return `${ident(c)} = $${params.length}`;
  });

  const scopeSql = applyScope(policy.scope.update, actor, policy, 'update', params);
  const filterSql = compileFilters(normFilters, params);
  const where = [scopeSql, filterSql].filter(Boolean).join(' AND ');

  return {
    text:
      `UPDATE ${ident(table)} SET ${setSql.join(', ')} WHERE ${where} ` +
      `RETURNING ${policy.columns.map(ident).join(', ')}`,
    params,
    resultShape: 'rows',
  };
}

export function buildDelete({ table, filters }, actor) {
  assertActor(actor);
  const policy = getTablePolicy(table);
  if (!policy) throw new PolicyError(`Unknown table: ${String(table)}`, 'UNKNOWN_TABLE');
  assertRole(policy, 'delete', actor);

  const normFilters = normalizeFilters(filters, policy);
  assertPkCovered(normFilters, policy, 'delete');

  const params = [];
  const scopeSql = applyScope(policy.scope.delete, actor, policy, 'delete', params);
  const filterSql = compileFilters(normFilters, params);
  const where = [scopeSql, filterSql].filter(Boolean).join(' AND ');

  return {
    text: `DELETE FROM ${ident(table)} WHERE ${where} RETURNING ${policy.columns.map(ident).join(', ')}`,
    params,
    resultShape: 'rows',
  };
}

export function buildUpsert({ table, values, onConflict }, actor) {
  assertActor(actor);
  const policy = getTablePolicy(table);
  if (!policy) throw new PolicyError(`Unknown table: ${String(table)}`, 'UNKNOWN_TABLE');
  // upsert = insert permission (the conflict target must be the declared PK or a unique col list from the policy)
  assertRole(policy, 'insert', actor);

  const conflictCols = Array.isArray(onConflict) ? onConflict : onConflict ? [onConflict] : policy.pk;
  assertColumnsAllowed(policy, conflictCols);

  const base = buildInsert({ table, values }, actor);
  // Parse the exact column list the insert builder used (it may have force-added
  // the owner column). Identifiers here all originate from the policy map.
  const fullCols = base.text
    .match(/INSERT INTO "[^"]+" \(([^)]*)\) VALUES/)[1]
    .split(',')
    .map((s) => s.trim().replace(/"/g, ''));
  const updateCols = fullCols.filter((c) => !conflictCols.includes(c));
  const setSql = updateCols.length
    ? updateCols.map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(', ')
    : `${ident(conflictCols[0])} = EXCLUDED.${ident(conflictCols[0])}`;

  return {
    text: base.text.replace(
      ' RETURNING ',
      ` ON CONFLICT (${conflictCols.map(ident).join(', ')}) DO UPDATE SET ${setSql} RETURNING `
    ),
    params: base.params,
    resultShape: 'rows',
  };
}

export function buildRpc({ fn, params: fnParams }, actor) {
  assertActor(actor);
  if (typeof fn !== 'string') throw new PolicyError('rpc requires a function name.', 'BAD_REQUEST');
  const rpcPolicy = getRpcPolicy(fn);
  if (!rpcPolicy) throw new PolicyError(`Unknown or non-whitelisted RPC: ${fn}`, 'UNKNOWN_RPC');
  if (!rpcPolicy.roles.includes(actor.role)) {
    throw new PolicyError(`Role '${actor.role}' may not call RPC ${fn}.`, 'ROLE_DENIED');
  }

  const allowed = rpcPolicy.params;
  const given = fnParams && typeof fnParams === 'object' ? fnParams : {};
  for (const key of Object.keys(given)) {
    if (!allowed.includes(key)) {
      throw new PolicyError(`RPC ${fn}: unknown parameter '${key}'. Allowed: ${allowed.join(', ') || '(none)'}`, 'UNKNOWN_PARAM');
    }
  }

  const params = [];
  const args = allowed.map((p) => {
    const v = given[p];
    if (v === undefined) {
      params.push(null);
    } else if (v !== null && typeof v === 'object') {
      params.push(JSON.stringify(v));
    } else {
      params.push(v);
    }
    return `$${params.length}`;
  });

  return {
    text: `SELECT * FROM ${ident(fn)}(${args.join(', ')})`,
    params,
    resultShape: 'rows',
  };
}

// =====================================================================
// Executor
// =====================================================================

const BUILDERS = {
  select: buildSelect,
  insert: buildInsert,
  update: buildUpdate,
  delete: buildDelete,
  upsert: buildUpsert,
  rpc: buildRpc,
};

/**
 * createRepository(queryFn, runAsActorFn?)
 * queryFn:  (text, params) => Promise<{ rows, rowCount }>  (pg-compatible)
 * runAsActorFn: (actor, fn) => Promise — when provided, executes `fn` inside a
 *   transaction with request.jwt.* GUCs set for the actor (required for RPCs
 *   whose SECURITY DEFINER body calls auth.uid()/auth.role() internally).
 */
export function createRepository(queryFn, runAsActorFn) {
  if (typeof queryFn !== 'function') {
    throw new Error('createRepository requires a query function.');
  }

  async function execute(op, body, actor) {
    const builder = BUILDERS[op];
    if (!builder) {
      throw new PolicyError(`Unknown op: ${String(op)}. Allowed: ${Object.keys(BUILDERS).join(', ')}`, 'UNKNOWN_OP');
    }
    const built = builder(body, actor);

    const run = runAsActorFn
      ? (fn) => runAsActorFn(actor, fn)
      : (fn) => fn(queryFn);
    const res = await run(async (exec) => {
      const q = typeof exec === 'function' ? exec : queryFn;
      return await q(built.text, built.params);
    });

    if (built.resultShape === 'count') {
      return { data: res.rows, count: Number(res.rows[0]?.count ?? res.rowCount ?? 0) };
    }
    return { data: res.rows ?? [], count: res.rowCount ?? (res.rows ? res.rows.length : 0) };
  }

  return { execute };
}
