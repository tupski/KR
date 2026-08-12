// Error response helper: 400 = validasi user (message asli), 500 = unexpected (generic, log).
export function sendError(res, err, opts = {}) {
  const status = err?.status || (opts.status || (err?.isValidation ? 400 : 500));
  if (status >= 500) console.error(err);
  const message = status >= 500 ? (opts.genericMessage || 'Internal server error') : err.message;
  res.status(status).json({ error: message });
}
