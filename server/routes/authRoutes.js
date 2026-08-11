// Auth routes: POST /api/auth/login, /logout, GET /api/auth/me.
import { Router } from 'express';
import { verifyPassword, signToken, cookieOpts, publicUser, requireAuth } from '../auth.js';

export default function authRoutes({ pool, cfg }) {
  const router = Router();

  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'email & password required' });

      const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
      const user = rows[0];
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return res.status(401).json({ error: 'Email atau password salah' });
      }

      const { rows: roleRows } = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = $1', [user.id]
      );
      const role = roleRows[0]?.role || 'karyawan';

      const token = signToken({ userId: user.id, role }, cfg.jwtSecret, cfg.sessionTtl);
      res.cookie('kr_session', token, cookieOpts({ secure: cfg.cookieSecure }));
      res.json({ user: publicUser(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie('kr_session', cookieOpts({ secure: cfg.cookieSecure }));
    res.json({ ok: true });
  });

  router.get('/me', requireAuth(cfg.jwtSecret), async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.sub]);
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ user: publicUser(user) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}