import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

// Custom plugin to copy static non-module files to dist/
function copyStaticFiles() {
  const filesToCopy = [
    'common.js',
    'config.js',
    'games/game-engine.js',
    'games/memory-card.js',
    'games/chinese-chess.js',
    'games/reversi.js'
  ]

  return {
    name: 'copy-static-files',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      filesToCopy.forEach(file => {
        const src = path.resolve(__dirname, file)
        const dest = path.resolve(distDir, file)
        if (fs.existsSync(src)) {
          const destDir = path.dirname(dest)
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true })
          }
          fs.copyFileSync(src, dest)
          console.log(`  复制: ${file}`)
        }
      })
      // 复制 modules 目录（懒加载模块，APK 需要）
      const modulesSrc = path.resolve(__dirname, 'modules')
      const modulesDest = path.resolve(distDir, 'modules')
      if (fs.existsSync(modulesSrc)) {
        fs.cpSync(modulesSrc, modulesDest, { recursive: true })
        console.log('  复制: modules/')
      }
      // 复制 download 目录（APK 下载）
      const dlSrc = path.resolve(__dirname, 'download')
      const dlDest = path.resolve(distDir, 'download')
      if (fs.existsSync(dlSrc)) {
        fs.mkdirSync(dlDest, { recursive: true })
        fs.readdirSync(dlSrc).forEach(f => {
          fs.copyFileSync(path.join(dlSrc, f), path.join(dlDest, f))
          console.log('  复制: download/' + f)
        })
      }
    }
  }
}

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
  },
  plugins: [copyStaticFiles()]
})
