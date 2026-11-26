import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { home: `${root}index.html`, prototype: `${root}prototype.html` },
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[/\\]three[/\\]/, minSize: 20000, maxSize: 250000 }],
        },
      },
    },
  },
});
