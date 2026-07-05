import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // Локально фронтенд ходит за /api на уже задеплоенный бэкенд на Vercel —
      // своего serverless-рантайма для api/ в `vite dev` нет.
      '/api': {
        target: 'https://mini-apps-read-helper.vercel.app',
        changeOrigin: true,
      },
    },
  },
})
