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
    configureServer(server) {
      server.middlewares.use('/vendor/supabase.js', (req, res, next) => {
        const umd = path.resolve(__dirname, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js')
        if (fs.existsSync(umd)) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          fs.createReadStream(umd).pipe(res)
          return
        }
        next()
      })
    },
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      // 复制自托管 Supabase UMD 客户端（避免国内移动网络访问 jsdelivr 失败导致无法登录）
      const sbUmdSrc = path.resolve(__dirname, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js')
      if (fs.existsSync(sbUmdSrc)) {
        const vendorDir = path.resolve(distDir, 'vendor')
        fs.mkdirSync(vendorDir, { recursive: true })
        fs.copyFileSync(sbUmdSrc, path.join(vendorDir, 'supabase.js'))
        console.log('  复制: vendor/supabase.js')
      }
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
