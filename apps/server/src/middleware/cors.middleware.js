/**
 * @file cors.middleware.js
 * @description CORS configuration for the Express server.
 * Allows requests only from the configured FRONTEND_URL.
 */

import cors from 'cors';
import { env } from '../config/env.js';

/** @type {import('cors').CorsOptions} */
const corsOptions = {
  origin: env.FRONTEND_URL,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

/**
 * Configured CORS middleware ready to be mounted on the Express app.
 */
const corsMiddleware = cors(corsOptions);

export { corsMiddleware };
