import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';
  import path from 'path';

  // When deploying to GitHub Pages at https://user.github.io/repo-name/
  // set VITE_BASE_PATH=/repo-name/ in your build step.
  // For the root domain leave it unset (defaults to "./").
  const base = process.env.VITE_BASE_PATH ?? './';

  export default defineConfig({
    base,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  });
  