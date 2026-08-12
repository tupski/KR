// RPC bridge: whitelist fungsi, argumen p_user_id dari JWT, tanpa SECURITY DEFINER.
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { sendError } from '../errors.js';

export const ALLOWED_RPC = new Set([
  'get_category_summary',
  'log_activity',
  'pay_tagihan_bulanan',
  'pay_fee_items',
  'delete_transaction_cascade',
  'admin_create_user',
  'admin_update_user',
  'admin_delete_user',
]);

const ARG_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Fungsi yang memakai auth.uid() di SQL asli → argumen p_user_id disuntik dari JWT.
const NEEDS_USER_ID = new Set(['log_activity', 'pay_fee_items', 'pay_tagihan_bulanan', 'delete_transaction_cascade']);

export default function rpcBridge({ pool, cfg }) {
  const router = Router();
  const auth = requireAuth(cfg.jwtSecret, pool);

  router.post('/:name', auth, async (req, res) => {
    const name = req.params.name;
    if (!ALLOWED_RPC.has(name)) {
      return res.status(400).json({ error: `rpc ${name} not allowed` });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const args = { ...body };
      if (NEEDS_USER_ID.has(name) && args.p_user_id === undefined) {
        args.p_user_id = req.user.sub;
      }
      const keys = Object.keys(args);
      for (const k of keys) {
        if (!ARG_RE.test(k)) {
          return res.status(400).json({ error: `invalid rpc argument name: ${k}` });
        }
      }
      const setSql = keys.map((k, i) => `"${k}" := $${i + 1}`).join(', ');
      const sql = keys.length
        ? `SELECT * FROM ${name}(${setSql})`
        : `SELECT * FROM ${name}()`;
      const { rows } = await pool.query(sql, keys.map((k) => args[k]));
      res.json({ data: rows, totalCount: rows?.[0]?.total_count ?? rows?.length ?? 0 });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}