import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import typegpu from 'unplugin-typegpu/vite'

export default defineConfig({
  root: '.',
  plugins: [vue(), typegpu({})],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: '../js/vue-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'mask-editor': resolve(__dirname, 'src', 'main.ts'),
        'timeline': resolve(__dirname, 'src', 'timeline-main.ts')
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
        format: 'es'
      }
    }
  }
})
