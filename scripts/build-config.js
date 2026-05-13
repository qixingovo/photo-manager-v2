// This script generates config.js from environment variables during deployment.
// Set these in your Vercel project settings → Environment Variables
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_STORAGE_URL = process.env.SUPABASE_STORAGE_URL || ''
const PEPPER = process.env.PEPPER || ''
const USER_EMAILS_LAODA = process.env.USER_EMAILS_LAODA || ''
const USER_EMAILS_XIAODI = process.env.USER_EMAILS_XIAODI || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('错误：请在 Vercel 项目设置中配置环境变量 SUPABASE_URL 和 SUPABASE_ANON_KEY')
    process.exit(1)
}

const lines = [
    `window.__APP_CONFIG__ = {`,
    `    SUPABASE_URL: '${SUPABASE_URL}',`,
    `    SUPABASE_ANON_KEY: '${SUPABASE_ANON_KEY}',`,
]

if (SUPABASE_STORAGE_URL) {
    lines.push(`    SUPABASE_STORAGE_URL: '${SUPABASE_STORAGE_URL}',`)
}

if (PEPPER) {
    lines.push(`    PEPPER: '${PEPPER}',`)
}

if (USER_EMAILS_LAODA && USER_EMAILS_XIAODI) {
    lines.push(`    USER_EMAILS: {`)
    lines.push(`        laoda: '${USER_EMAILS_LAODA}',`)
    lines.push(`        xiaodi: '${USER_EMAILS_XIAODI}'`)
    lines.push(`    }`)
}

lines.push(`}`)

const content = lines.join('\n') + '\n'
const outputPath = path.join(__dirname, '..', 'config.js')
fs.writeFileSync(outputPath, content, 'utf8')
console.log('config.js 已生成')

// Auto-bump JS version numbers in HTML for cache busting
const BUILD_VERSION = Date.now().toString(36)
const htmlFiles = ['index.html', 'index-mobile.html']
htmlFiles.forEach(file => {
    const htmlPath = path.join(__dirname, '..', file)
    let html = fs.readFileSync(htmlPath, 'utf8')
    html = html.replace(/(app\.js\?v=)\w+/g, '$1' + BUILD_VERSION)
    html = html.replace(/(mobile-app\.js\?v=)\w+/g, '$1' + BUILD_VERSION)
    fs.writeFileSync(htmlPath, html, 'utf8')
    console.log(`${file} 版本号已更新 → ${BUILD_VERSION}`)
})

// Auto-bump module version constant in mobile-app.js for lazy-loaded module cache busting
const mobileAppPath = path.join(__dirname, '..', 'mobile-app.js')
let mobileApp = fs.readFileSync(mobileAppPath, 'utf8')
mobileApp = mobileApp.replace(/_MODULE_VERSION: '[^']*'/, "_MODULE_VERSION: '" + BUILD_VERSION + "'")
fs.writeFileSync(mobileAppPath, mobileApp, 'utf8')
console.log(`mobile-app.js module version → ${BUILD_VERSION}`)

// Auto-bump common.js version in HTML
const commonVersion = BUILD_VERSION
htmlFiles.forEach(file => {
    const htmlPath = path.join(__dirname, '..', file)
    let html = fs.readFileSync(htmlPath, 'utf8')
    html = html.replace(/(common\.js\?v=)\w+/g, '$1' + commonVersion)
    fs.writeFileSync(htmlPath, html, 'utf8')
    console.log(`${file} common.js 版本号已更新 → ${commonVersion}`)
})
