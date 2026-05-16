import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        mobile: 'index-mobile.html'
      }
    }
  },
  server: {
    proxy: {
      '/auth': {
        target: process.env.VITE_API_TARGET || 'https://photo.qixingovo.cn',
        changeOrigin: true,
        secure: false
      },
      '/rest/v1': {
        target: process.env.VITE_API_TARGET || 'https://photo.qixingovo.cn',
        changeOrigin: true,
        secure: false
      },
      '/storage': {
        target: process.env.VITE_API_TARGET || 'https://photo.qixingovo.cn',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
