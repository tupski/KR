// Self-host API adapter. Mirrors supabase-js surface ({ data, error }) over
// the Express backend: /api/db, /api/rpc, /api/auth, /api/storage.
// VITE_API_BASE_URL optional; '' = same-origin. Session via kr_session cookie.
const API = import.meta.env.VITE_API_BASE_URL || '';

export function getCsrfToken() {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|; )csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function http(method, path, body, extraHeaders = {}) {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    };
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;

    const res = await fetch(`${API}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { data: null, error: { message: json.error || `HTTP ${res.status}`, code: res.status, details: json.details } };
    }
    return { data: json.data ?? json, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message, code: 'NETWORK' } };
  }
}

const stringify = (path, q) => {
  const params = new URLSearchParams();
  if (q.select) params.set('select', q.select);
  if (q.filters.length) params.set('filter', JSON.stringify(q.filters));
  if (q.order) { params.set('order', q.order); params.set('asc', String(q.ascending)); }
  if (q.range) params.set('range', q.range.join(','));
  if (q.count) params.set('count', q.count);
  if (q.head) params.set('head', '1');
  if (q.limit) params.set('limit', String(q.limit));
  const s = params.toString();
  return s ? `${path}?${s}` : path;
};

// --- RPC ---
export function rpc(name, params) {
  return http('POST', `/api/rpc/${name}`, params || {});
}

// --- Query builder: .from(table).select().eq()... (await via thenable) ---
export function from(table) {
  const q = { table, select: '*', filters: [], order: null, ascending: false, range: null, count: null, head: false, limit: null, single: false };

  const builder = {
    select(cols, opts = {}) {
      q.select = cols || '*';
      q.count = opts.count || null;
      q.head = !!opts.head;
      return builder;
    },
    eq(col, v) { q.filters.push({ col, op: 'eq', value: v }); return builder; },
    gt(col, v) { q.filters.push({ col, op: 'gt', value: v }); return builder; },
    gte(col, v) { q.filters.push({ col, op: 'gte', value: v }); return builder; },
    lt(col, v) { q.filters.push({ col, op: 'lt', value: v }); return builder; },
    lte(col, v) { q.filters.push({ col, op: 'lte', value: v }); return builder; },
    in(col, arr) { q.filters.push({ col, op: 'in', value: arr }); return builder; },
    is(col, v) { q.filters.push({ col, op: 'is', value: v === null ? null : v }); return builder; },
    not(col, op, v) { q.filters.push({ col, op: `not_${op}`, value: v }); return builder; },
    or(str) { q.filters.push({ col: '__or', op: 'or', value: str }); return builder; },
    order(col, { ascending = false } = {}) { q.order = col; q.ascending = ascending; return builder; },
    range(a, b) { q.range = [a, b]; return builder; },
    limit(n) { q.limit = n; return builder; },
    maybeSingle() { q.single = true; return builder; },
    single() { q.single = true; return builder; },

    async then(resolve, reject) {
      try {
        resolve(await execute(q));
      } catch (e) {
        reject(e);
      }
    },

    insert(rows) {
      const single = !Array.isArray(rows);
      const chain = {
        async then(resolve, reject) {
          try {
            resolve(await this._run());
          } catch (e) { reject(e); }
        },
        async _run() {
          const r = await http('POST', `/api/db/${table}`, single ? rows : { _rows: rows });
          if (r.error) return r;
          const d = single ? r.data : (r.data?._rows ?? r.data) || [];
          return { data: d, error: null };
        },
        select(_cols) { return chain; },
        maybeSingle() { return chain; },
        single() { return chain; }, // POST returns single row already
        eq() { return chain; },
      };
      return chain;
    },
    upsert(rows, _opts = {}) {
      return this.insert(rows);
    },
    update(patch, _opts) {
      // Backend supports PATCH /api/db/:table/:id only → must chain .eq('id', v)
      const chain = {
        eq(col, v) { q.filters.push({ col, op: 'eq', value: v }); return chain; },
        async then(resolve, reject) {
          try { resolve(await chain._run()); } catch (e) { reject(e); }
        },
        async _run() {
          const idFilter = q.filters.find((f) => f.col === 'id' && f.op === 'eq');
          if (!idFilter) return { data: null, error: { message: 'update requires .eq("id", value)', code: 'PATCH' } };
          return http('PATCH', `/api/db/${table}/${encodeURIComponent(String(idFilter.value))}`, patch);
        },
      };
      return chain;
    },
    delete() {
      const chain = {
        eq(col, v) { q.filters.push({ col, op: 'eq', value: v }); return chain; },
        async then(resolve, reject) {
          try { resolve(await chain._run()); } catch (e) { reject(e); }
        },
        async _run() {
          const idFilter = q.filters.find((f) => f.col === 'id' && f.op === 'eq');
          if (!idFilter) return { data: null, error: { message: 'delete requires .eq("id", value)', code: 'DELETE' } };
          return http('DELETE', `/api/db/${table}/${encodeURIComponent(String(idFilter.value))}`);
        },
      };
      return chain;
    },
  };
  return builder;
}

async function execute(q) {
  const path = stringify(`/api/db/${q.table}`, q);
  let r = await http('GET', path);
  if (r.error) return r;
  let data = r.data ?? [];
  const totalCount = r.totalCount ?? data.length;
  if (q.head) return { data: null, error: null, count: totalCount };
  if (q.single) return { data: Array.isArray(data) ? (data[0] ?? null) : data, error: null, count: totalCount };
  return { data, error: null, count: totalCount };
}

// --- Storage ---
export async function upload(path, file, folder) {
  if (typeof file === 'string') file = new Blob([file], { type: 'application/octet-stream' });
  const safeName = `${Date.now()}-${String(path.split('/').pop() || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const res = await fetch(`${API}/api/storage/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': file.type || 'application/octet-stream',
      'x-file-name': safeName,
      'x-folder': folder || 'uploads',
    },
    body: file,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: json.error || `HTTP ${res.status}`, code: res.status } };
  // url = full opaque proxy URL (sudah /api/storage/proxy?ref=...); key = ref mentah.
  return { data: json.url || json.key, error: null, key: json.key, url: json.url };
}

// Realtime stand-in (K3): polling callback setiap interval.
// .channel(name).on('postgres_changes', {...}, cb).subscribe() pada komponen lama
// → di self-host dipetakan ke polling tanpa perubahan komponen.
let channels = new Map();
export function channel(name) {
  if (channels.has(name)) return channels.get(name);
  const handlers = [];
  const obj = {
    on(_event, _filter, cb) { handlers.push(cb); return obj; },
    subscribe() { return obj; },
    unsubscribe() { cleanupChannel(name); return obj; },
    _handlers: handlers,
  };
  channels.set(name, obj);
  return obj;
}

export function removeChannel(ch) {
  const name = ch?.name || [...channels.entries()].find(([, v]) => v === ch)?.[0];
  if (name) cleanupChannel(name);
}

function cleanupChannel(name) { channels.delete(name); }

// Mulai polling semua channel aktif (dipanggil app boot). cb = (channelName) => void
export function startChannelPolling({ intervalSec = 15, onTick } = {}) {
  return setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    channels.forEach((ch, name) => {
      ch._handlers?.forEach((cb) => { onTick?.(name); cb?.(); });
    });
  }, intervalSec * 1000);
}

// storage.from(bucket) surface (ManajemenDeposit)
export function storage() {
  return {
    from(_bucket) {
      return {
        upload(filePath, file, _opts) {
          const parts = String(filePath).split('/');
          const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'uploads';
          return upload(filePath, file, folder);
        },
      };
    },
  };
}

const authListeners = new Set();

function emitAuth(event, session) {
  authListeners.forEach((cb) => cb(event, session));
}

export const auth = {
  async getSession() {
    const r = await http('GET', '/api/auth/me');
    if (r.error) {
      return { data: { session: null }, error: null };
    }
    const user = r.data.user || null;
    if (typeof window !== 'undefined') window.__kr_user = user;
    return { data: { session: user ? { user } : null }, error: null };
  },
  async signInWithPassword({ email, password }) {
    const r = await http('POST', '/api/auth/login', { email, password });
    if (r.error) return { data: null, error: r.error };
    const user = r.data.user || null;
    if (typeof window !== 'undefined') window.__kr_user = user;
    const session = user ? { user } : null;
    emitAuth(user ? 'SIGNED_IN' : 'SIGNED_OUT', session);
    return { data: { session }, error: null };
  },
  async signUp(payload) {
    const r = await http('POST', '/api/auth/register', payload);
    if (!r.error) emitAuth('SIGNED_IN', r.data?.session ?? null);
    return { data: r.data, error: r.error };
  },
  async signOut() {
    const r = await http('POST', '/api/auth/logout');
    if (typeof window !== 'undefined') window.__kr_user = null;
    emitAuth('SIGNED_OUT', null);
    return { data: r.data, error: r.error };
  },
  async updateUser(patch) {
    // Backend has no PATCH /api/auth/me endpoint yet (phase_02).
    // Self-host: profile updates go through .from('user_profiles').update().
    const user = (typeof window !== 'undefined' && window.__kr_user) || {};
    const meta = { ...(user.user_metadata || {}), ...(patch?.data || {}) };
    if (typeof window !== 'undefined') window.__kr_user = { ...user, user_metadata: meta };
    emitAuth('USER_UPDATED', { user: window.__kr_user || null });
    return { data: { user: window.__kr_user || null }, error: null };
  },
  onAuthStateChange(cb) {
    authListeners.add(cb);
    let last = null;
    const timer = setInterval(async () => {
      const { data } = await auth.getSession();
      const has = Boolean(data.session);
      if (has !== last) {
        last = has;
        cb(has ? 'SIGNED_IN' : 'SIGNED_OUT', data.session);
      }
    }, 60_000);
    cb('INITIAL_SESSION', null); // supabase fires INITIAL_SESSION on subscribe
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            clearInterval(timer);
            authListeners.delete(cb);
          },
        },
      },
    };
  },
  _listeners: authListeners,
};

const api = {
  http, rpc, from, storage, auth, upload, channel, removeChannel, startChannelPolling, getCsrfToken,
};
export default api;