import { getConfig } from 'vitest/config';

const config = await getConfig(
  { root: './' },
  // default flags
);
console.log('config plugins:', config?.plugins?.length);
console.log('config test:', JSON.stringify(config?.test, null, 2).slice(0, 500));
