# 待优化问题清单

**日期**：2026-05-10
**来源**：安全审核回归后整理

---

## Medium

### 1. ~~`share_links` RLS 策略过宽~~ ✅ 已修复

**位置**：`migrations/002_albums_share_links.sql:52-56`
**修复**：创建 `migrations/012_tighten_share_links.sql`，收紧为 `TO authenticated`。（2026-05-10）
**待办**：执行 SQL 后验证分享功能正常。

---

## Low

### 2. ~~console.log 调试日志残留~~ ✅ 已修复

**修复**：app.js + mobile-app.js 顶部添加 `DEBUG` 门控，生产环境自动禁用 `console.log`。（2026-05-10）
```javascript
if (!APP_CONFIG.DEBUG) { console.log = () => {}; }
```
share.js 无 console.log，无需修改。console.error 保留用于生产错误追踪。

### 3. ~~版本号手动维护~~ ✅ 已修复

**修复**：`scripts/build-config.js` 末尾增加自动版本号注入，每次部署时自动用 `Date.now().toString(36)` 替换 `app.js?v=` 和 `mobile-app.js?v=`。
开发环境不改动 HTML，部署时自动更新，无需手动维护。（2026-05-10）

---

### 4. ~~USER_EMAIL_MAP 硬编码~~ ✅ 已修复

**位置**：`app.js:81`、`mobile-app.js:130`
**问题**：邮箱映射硬编码 `{ laoda: 'laoda@couple.local', xiaodi: 'xiaodi@couple.local' }`，`APP_CONFIG.USER_EMAILS` 配置不生效。
**修复**：改为 `APP_CONFIG.USER_EMAILS || {...}` 兜底。（2026-05-10）

### 5. ~~缺少安全响应头~~ ✅ 已修复

**修复**：`vercel.json` 添加全局安全头（X-Content-Type-Options、X-Frame-Options、Referrer-Policy）。（2026-05-10）

### 6. ~~Service Worker 预缓存列表有误~~ ✅ 已修复

**问题**：`STATIC_ASSETS` 缓存了无版本号的 `./mobile-app.js`，但 HTML 加载 `mobile-app.js?v=75`，URL 不匹配导致预缓存无效。同时缺少桌面端 HTML/CSS 资源。
**修复**：移除版本化 JS，添加 `./index.html`、`./share.html`、`./style.css`。缓存名 `v3` → `v4`。（2026-05-10）

---

## 备注

### 7. 代码结构（长期）

| 项 | 说明 |
|----|------|
| app.js ~6100 行 | 与 mobile-app.js ~7000 行有大量重复（sha256、escapeHtml、render 函数等），长期可抽取 `common.js` 公共模块 |
| safeBigint 仍用于 milestones.id | `milestones.id` 是 BIGINT，目前用法正确。但若未来改为 UUID 需同步去除 |
