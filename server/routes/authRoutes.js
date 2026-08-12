// Auth routes: login (rate-limited), logout (revoke jti), me, register, update profile, change-password.
import { Router } from 'express';
import {
  verifyPassword, hashPassword, signToken, verifyToken, cookieOpts, publicUser, requireAuth, requireRole,
} from '../auth.js';
import { sendError } from '../errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['super_admin', 'admin', 'karyawan']);
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// T4: rate-limit login in-memory per IP (single process).
export function createLoginLimiter({ maxFails = MAX_FAILS, windowMs = WINDOW_MS } = {}) {
  const map = new Map();
  const cleanup = () => {
    const now = Date.now();
    for (const [ip, e] of map) if (e.resetAt <= now) map.delete(ip);
  };
  const hit = (ip) => {
    cleanup();
    const now = Date.now();
    const e = map.get(ip);
    if (!e || e.resetAt <= now) {
      map.set(ip, { count: 1, resetAt: now + windowMs });
      return { count: 1 };
    }
    e.count += 1;
    return e;
  };
  const reset = (ip) => map.delete(ip);
  return { hit, reset };
}

export default function authRoutes({ pool, cfg }) {
  const router = Router();
  const auth = requireAuth(cfg.jwtSecret, pool);
  const limiter = cfg?.loginLimiter || createLoginLimiter();

  const rateLimit = (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const e = limiter.hit(ip);
    if (e.count > MAX_FAILS) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
    }
    req._loginIp = ip;
    return next();
  };

  router.post('/login', rateLimit, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'email & password required' });

      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
      const user = rows[0];
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return res.status(401).json({ error: 'Email atau password salah' });
      }
      limiter.reset(req._loginIp);

      const { rows: roleRows } = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = $1', [user.id]
      );
      const role = roleRows[0]?.role || 'karyawan';

      const token = signToken({ userId: user.id, role }, cfg.jwtSecret, cfg.sessionTtl);
      res.cookie('kr_session', token, cookieOpts({ secure: cfg.cookieSecure }));
      res.json({ user: publicUser(user) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/logout', auth, async (req, res) => {
    try {
      if (req.user?.jti && pool) {
        await pool.query(
          'INSERT INTO token_blacklist (jti, expires_at) VALUES ($1, NOW() + $2::interval) ON CONFLICT DO NOTHING',
          [req.user.jti, '7 days']
        );
      }
    } catch (err) {
      console.error('logout blacklist failed:', err.message);
    }
    res.clearCookie('kr_session', cookieOpts({ secure: cfg.cookieSecure }));
    res.json({ ok: true });
  });

  router.get('/me', auth, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.sub]);
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { rows: roleRows } = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [user.id]);
      res.json({ user: { ...publicUser(user), role: roleRows[0]?.role || 'karyawan' } });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/register', auth, requireRole('super_admin'), async (req, res) => {
    try {
      const { email, password, full_name, phone, role } = req.body || {};
      if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ error: 'email tidak valid' });
      if (!password || String(password).length < 8) return res.status(400).json({ error: 'password minimal 8 karakter' });
      const finalRole = ROLES.has(role) ? role : 'karyawan';
      const passwordHash = await hashPassword(String(password));
      let client;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO users (email, password_hash, full_name, phone) VALUES ($1, $2, $3, $4) RETURNING id`,
          [String(email).toLowerCase(), passwordHash, full_name || null, phone || null]
        );
        const userId = rows[0].id;
        await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, finalRole]);
        await client.query(
          `INSERT INTO user_profiles (id, email, full_name, phone, role) VALUES ($1, $2, $3, $4, $5)`,
          [userId, String(email).toLowerCase(), full_name || null, phone || null, finalRole]
        );
        await client.query('COMMIT');
        res.json({ data: { id: userId } });
      } catch (e) {
        if (client) { try { await client.query('ROLLBACK'); } catch { /* dead conn */ } }
        if (/duplicate|unique/i.test(e.message)) {
          return res.status(400).json({ error: 'email sudah terdaftar' });
        }
        throw e;
      } finally {
        client?.release();
      }
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch('/me', auth, async (req, res) => {
    try {
      const { full_name, phone, avatar_url } = req.body || {};
      const sets = [];
      const vals = [];
      if (full_name !== undefined) { sets.push('full_name = $' + (vals.length + 1)); vals.push(full_name); }
      if (phone !== undefined) { sets.push('phone = $' + (vals.length + 1)); vals.push(phone); }
      if (avatar_url !== undefined) { sets.push('avatar_url = $' + (vals.length + 1)); vals.push(avatar_url); }
      if (!sets.length) return res.status(400).json({ error: 'no fields to update' });
      sets.push('updated_at = NOW()');
      vals.push(req.user.sub);
      await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);

      const pSets = [];
      const pVals = [];
      if (full_name !== undefined) { pSets.push('full_name = $' + (pVals.length + 1)); pVals.push(full_name); }
      if (phone !== undefined) { pSets.push('phone = $' + (pVals.length + 1)); pVals.push(phone); }
      if (avatar_url !== undefined) { pSets.push('avatar_url = $' + (pVals.length + 1)); pVals.push(avatar_url); }
      if (pSets.length) {
        pSets.push('updated_at = NOW()');
        const idIdx = pVals.length + 1;
        await pool.query(
          `INSERT INTO user_profiles (id, email, updated_at)
           VALUES ($${idIdx}, (SELECT email FROM users WHERE id = $${idIdx}), NOW())
           ON CONFLICT (id) DO UPDATE SET ${pSets.join(', ')}`,
          [...pVals, req.user.sub]
        );
      }
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.sub]);
      res.json({ user: publicUser(rows[0]) });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/change-password', auth, async (req, res) => {
    try {
      const { old_password, new_password } = req.body || {};
      if (!old_password || !new_password) return res.status(400).json({ error: 'old_password & new_password required' });
      if (String(new_password).length < 8) return res.status(400).json({ error: 'password minimal 8 karakter' });
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.sub]);
      const user = rows[0];
      if (!user || !(await verifyPassword(String(old_password), user.password_hash))) {
        return res.status(400).json({ error: 'password lama salah' });
      }
      const passwordHash = await hashPassword(String(new_password));
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, req.user.sub]);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
