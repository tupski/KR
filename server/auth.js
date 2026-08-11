// Auth: bcrypt (bcryptjs), JWT (jsonwebtoken), httpOnly cookie, CSRF guard, middleware.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const COST = 12;

export const hashPassword = (plain) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

export const signToken = ({ userId, role }, secret, ttl = '7d') =>
  jwt.sign({ sub: String(userId), role }, secret, { expiresIn: ttl });

export const verifyToken = (token, secret) => jwt.verify(token, secret);

export function cookieOpts({ req, secure }) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function requireAuth(secret) {
  return (req, res, next) => {
    const token = req.cookies?.kr_session;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      req.user = verifyToken(token, secret);
      return next();
    } catch {
      return res.status(401).json({ error: 'Session expired' });
    }
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'CSRF' });
  }
  return next();
}

export function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}