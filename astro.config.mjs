import { defineConfig } from 'astro/config';
import yaml from '@rollup/plugin-yaml';

export default defineConfig({
  site: 'https://jennifer-schumacher.vercel.app',
  build: { format: 'file' },
  vite: { plugins: [yaml()] },
});
