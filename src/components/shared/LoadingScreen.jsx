import React from 'react';
import { motion } from 'framer-motion';

/**
 * LoadingScreen — Simple loading spinner extracted from App.jsx.
 *
 * Displays a centered animated logo with "Memuat..." text,
 * suitable for initial auth loading states.
 */
export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-cyan-200 to-blue-300">
      <div className="flex flex-col items-center gap-4 text-blue-900">
        <motion.div
          initial={{ scale: 0.9, opacity: 0.75 }}
          animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-blue-200"
        >
          <img
            src="/logo-kr-transparent-square.png"
            alt="KR"
            className="h-14 w-14 object-contain"
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0.5 }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          className="text-base font-semibold sm:text-lg"
        >
          Memuat...
        </motion.div>
      </div>
    </div>
  );
}
