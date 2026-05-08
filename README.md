# 📷 老大和小弟的回忆管理系统

基于 Supabase 的情侣照片管理网站，桌面版 + 手机版双端支持。

## 功能

### 核心

| 功能 | 描述 | 桌面 | 手机 |
|------|------|:--:|:--:|
| 照片流 | 上传、浏览、搜索、分页、多选批量操作 | ✅ | ✅ |
| 分类管理 | 无限级联分类、加锁、标记收藏 | ✅ | ✅ |
| 地图 | Leaflet 地图 + 照片地理标记 | ✅ | ✅ |

### 情侣

| 功能 | 描述 | 桌面 | 手机 |
|------|------|:--:|:--:|
| 首页情侣横幅 | 双人头像(可上传/跨设备同步)+恋爱天数倒计时 | — | ✅ |
| 纪念日时间线 | 倒数日、纪念日里程碑、经期记录 | ✅ | ✅ |
| 心情日记 | 记录每日心情，关联照片，支持删除 | ✅ | ✅ |
| 每日叨叨 | 碎片化文字记录，支持删除 | ✅ | ✅ |
| 亲密记录 | 密码锁保护，统计面板 | ✅ | ✅ |
| 情侣打卡 | 20个预设任务 + 自定义任务 | ✅ | ✅ |
| 情感时间轴 | 全类型事件统一时间线（照片/日记/叨叨/里程碑/打卡/漂流瓶） | ✅ | ✅ |
| 漂流瓶 | 扔瓶/捞瓶/回复，匿名传情 | ✅ | ✅ |
| 秘密便签 | 地理围栏解锁，过期自动失效，收到即毁 | ✅ | ✅ |
| 轻轻碰 | 发送轻碰提醒，已读/未读状态 | ✅ | ✅ |

### 回忆

| 功能 | 描述 | 桌面 | 手机 |
|------|------|:--:|:--:|
| 拼贴墙 | 爱心形状照片拼贴 | ✅ | ✅ |
| 相册 | 创建相册、管理照片、分享链接 | ✅ | ✅ |
| 足迹护照 | 按地点汇总旅行足迹 | ✅ | ✅ |
| 回忆成就 | 自动统计里程碑成就 | ✅ | ✅ |

### 其他

- 桌面端侧边栏导航 + tooltip
- 手机端暖粉风格首页 2×4 功能宫格
- 手机端所有子页面 `←` 统一返回
- 主题切换：蓝色经典 / 暖粉（设置页切换，夜间模式独立，跨设备同步）
- 照片分享链接（`share.html`）
- 账号密码登录（laoda / xiaodi 双角色）
- Service Worker 离线缓存

## 技术栈

- **前端**: HTML + CSS + JavaScript (ES6+)
- **后端**: Supabase (PostgreSQL + Storage + RLS)
- **地图**: Leaflet
- **部署**: Vercel

## 文件索引

### 入口页面

| 文件 | 用途 |
|------|------|
| `index.html` | 桌面版入口，侧边栏导航 + 主内容区 |
| `index-mobile.html` | 手机版入口，暖粉风格首页 + 底部导航 + 功能页 |
| `share.html` | 相册分享独立页面，无需登录即可浏览 |

### 核心 JS

| 文件 | 行数 | 职责 |
|------|------|------|
| `app.js` | ~6100 | 桌面版全部逻辑：照片流/分类/地图/情侣打卡/纪念日/心情日记/每日叨叨/亲密记录/拼贴墙/相册/足迹护照/回忆成就/情感时间轴/漂流瓶/秘密便签/轻轻碰 |
| `mobile-app.js` | ~7000 | 手机版全部逻辑：同上 + 首页情侣横幅/RPG成就系统/头像上传/主题切换 |
| `share.js` | ~300 | 分享页面：加载相册照片、密码验证 |
| `sw.js` | ~50 | Service Worker：离线缓存、PWA 安装 |

### 样式

| 文件 | 行数 | 职责 |
|------|------|------|
| `style.css` | ~2400 | 桌面版全部样式：侧边栏/照片网格/模态框/表单/地图/成就 |
| `mobile.css` | ~3200 | 手机版全部样式：暖粉主题/卡片布局/底部导航/RPG 系统/设置面板 |

### 数据库迁移 (`migrations/`)

按顺序在 Supabase SQL Editor 中执行：

| 文件 | 内容 |
|------|------|
| `001_milestones_app_settings.sql` | 纪念日表、应用设置表 |
| `002_albums_share_links.sql` | 相册表、分享链接表、照片-相册关联表 |
| `003_couple_features.sql` | 心情日记/每日叨叨/亲密记录/情侣打卡表 |
| `004_rpg_achievements.sql` | RPG 进度表（XP/等级/任务/称号/奖励） |
| `005_drift_bottles.sql` | 漂流瓶表（扔瓶/捞瓶/回复） |
| `006_secret_notes.sql` | 秘密便签表（地理围栏/过期/已读） |
| `007_nudges.sql` | 轻轻碰表（发送/已读状态） |

### 配置 & 构建

| 文件 | 用途 |
|------|------|
| `config.example.js` | Supabase 配置模板，复制为 `config.js` 填入密钥 |
| `package.json` | npm 依赖（仅 vite 用于构建时注入配置） |
| `vite.config.js` | Vite 构建配置：注入 `__APP_CONFIG__` 全局变量 |
| `vercel.json` | Vercel 部署配置：SPA 路由重写 + 安全头 |
| `scripts/build-config.js` | 构建脚本：从环境变量生成 `config.js` |
| `manifest.json` | PWA 清单：应用名/图标/主题色 |
| `BRANCHES.md` | 分支命名规范 |

### 静态资源

| 路径 | 用途 |
|------|------|
| `icons/icon-192.png` | PWA 小图标 |
| `icons/icon-512.png` | PWA 大图标 |
| `qr.png` | 手机端扫码入口二维码 |

## 本地开发

```bash
npm install
npm run dev
```

## 配置

1. 复制 `config.example.js` → `config.js`
2. 填写 Supabase 配置：
```javascript
window.__APP_CONFIG__ = {
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key',
  SUPABASE_STORAGE_URL: 'https://your-project.supabase.co/storage/v1/object/public/photo/'
}
```

> `config.js` 已加入 `.gitignore`

## 数据库

在 Supabase SQL Editor 中依次执行 `migrations/` 目录下的 SQL 文件。

### Storage Bucket

创建名为 `photo` 的公开 Storage Bucket。

## 部署

Vercel 部署，环境变量注入配置值，构建阶段生成 `config.js`。
