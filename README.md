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
| 首页情侣横幅 | 双人头像(可上传)+恋爱天数倒计时 | — | ✅ |
| 纪念日时间线 | 倒数日、纪念日里程碑、经期记录 | ✅ | ✅ |
| 心情日记 | 记录每日心情，关联照片，支持删除 | ✅ | ✅ |
| 每日叨叨 | 碎片化文字记录，支持删除 | ✅ | ✅ |
| 亲密记录 | 密码锁保护，统计面板 | ✅ | ✅ |
| 情侣打卡 | 20个预设任务 + 自定义任务 | ✅ | ✅ |

### 回忆

| 功能 | 描述 | 桌面 | 手机 |
|------|------|:--:|:--:|
| 拼贴墙 | 爱心形状照片拼贴 | ✅ | ✅ |
| 相册 | 创建相册、管理照片、分享链接 | ✅ | ✅ |
| 足迹护照 | 按地点汇总旅行足迹 | ✅ | ✅ |
| 回忆成就 | 自动统计里程碑成就 | ✅ | ✅ |

### 其他

- 桌面端侧边栏导航 + tooltip
- 手机端 Suki 风格首页 2×3 功能宫格
- 手机端所有子页面 `←` 统一返回
- 照片分享链接（`share.html`）
- 账号密码登录（laoda / xiaodi 双角色）
- Service Worker 离线缓存

## 技术栈

- **前端**: HTML + CSS + JavaScript (ES6+)
- **后端**: Supabase (PostgreSQL + Storage + RLS)
- **地图**: Leaflet
- **部署**: Vercel

## 项目结构

```
photo-manager-v2/
├── index.html              # 桌面版入口
├── app.js                  # 桌面版 JS（~5000行）
├── index-mobile.html       # 手机版入口
├── mobile-app.js           # 手机版 JS（~5300行）
├── mobile.css              # 手机版样式（~2300行）
├── style.css               # 桌面版样式（~1800行）
├── share.html / share.js   # 分享页面
├── config.example.js       # 配置模板
├── manifest.json / sw.js   # PWA
├── migrations/             # 数据库迁移 SQL
│   ├── 001_milestones_app_settings.sql
│   ├── 002_cascade_categories.sql
│   └── 003_couple_features.sql
├── icons/                  # PWA 图标
└── scripts/                # 辅助脚本
```

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
