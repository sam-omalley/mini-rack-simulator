import { defineConfig } from 'vite';

// Deployed to https://sam-omalley.github.io/mini-rack-simulator/
// so assets must be served from that sub-path in production.
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/mini-rack-simulator/' : '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
