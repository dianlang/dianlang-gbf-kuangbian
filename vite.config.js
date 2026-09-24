import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: { rollupOptions: { input: {
    game: fileURLToPath(new URL('./index.html', import.meta.url)),
    animations: fileURLToPath(new URL('./animations.html', import.meta.url)),
  } } },
});
