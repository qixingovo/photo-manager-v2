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
| 周期追踪 | 经期日历标记、流量强度、症状记录、周期预测 | — | ✅ |
| 游戏中心 | 记忆翻牌、中国象棋、黑白棋 3款双人游戏 | ✅ | ✅ |
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

- 桌面端侧边栏导航（18个功能分区）+ tooltip
- 手机端暖粉风格首页 2×4 功能宫格 + 23个独立页面
- 手机端 3 标签导航：首页 / 照片 / 我的
- 手机端所有子页面 `←` 统一返回
- 主题切换：蓝色经典 / 暖粉（设置页切换，夜间模式独立，跨设备同步）
- 照片分享链接（`share.html`）
- 账号密码登录（laoda / xiaodi 双角色）
- Service Worker 离线缓存
- SHA-256 + PEPPER 密码哈希（亲密空间）
- Supabase Auth JWT 认证（signInWithPassword）
- RLS 策略收紧（anon → authenticated）

## 安全加固记录 (2026-05-09 ~ 2026-05-10)

### Phase 1: 紧急修复
| 问题 | 修复 |
|------|------|
| XSS: innerHTML 未转义 | 所有用户可控数据包裹 `escapeHtml()` |
| 密码明文存储 | SHA-256(PEPPER) 哈希 + 明文兼容升级 |
| 文件上传无校验 | MIME 类型 + 扩展名白名单 |
| 内容长度无限制 | CHECK 约束 (migration 009) |

### Phase 2: Supabase Auth 迁移
| 问题 | 修复 |
|------|------|
| 自建 RPC `authenticate_user` | 替换为 `signInWithPassword` + profiles 查表 |
| localStorage session 存储 | 删除 `getStoredSession`/`saveSession`/`clearSession` |
| RLS `TO anon,authenticated` | 收紧为 `TO authenticated`（15 个策略，migration 010） |
| 无 profiles 表 | 创建 profiles 表 (user_id → username/role) |
| 分享功能 RLS 受阻 | `get_shared_album` SECURITY DEFINER 函数 |

### Phase 3: 生产部署修复
| 问题 | 根因 | 修复 |
|------|------|------|
| `app_settings` 406 | 页面加载时请求在登录前发出，anon 无权限 | 添加 anon SELECT 策略 |
| 戳一戳 401 | CDN 版 supabase-js localStorage session 不持久化 | 手动 `pm2_session` 保存/恢复 + `setSession` |
| 纪念日类别绑定丢失 | `milestones.category_id`(BIGINT) ≠ `categories.id`(UUID)；移动版 `safeBigint` 将 UUID 转 null | ALTER TYPE → text；去除 `safeBigint` |
| upload 循环 SyntaxError | 文件校验新增 `const ext` 与原有声明重复 | 重命名为 `fileExtension` |

## 技术栈

- **前端**: HTML + CSS + JavaScript (ES6+)
- **后端**: Supabase (PostgreSQL + Storage + RLS)
- **地图**: Leaflet
- **部署**: Vercel

## 文件索引

### 入口页面

| 文件 | 用途 |
|------|------|
| `index.html` | 桌面版入口，侧边栏导航 + 主内容区（18个功能分区） |
| `index-mobile.html` | 手机版入口，暖粉风格首页 + 底部3标签导航 + 23个功能页 |
| `share.html` | 相册分享独立页面，无需登录即可浏览 |

### 核心 JS

| 文件 | 行数 | 职责 |
|------|------|------|
| `app.js` | ~6690 | 桌面版全部逻辑：照片流/分类/地图/情侣打卡/纪念日/心情日记/每日叨叨/亲密记录/拼贴墙/相册/足迹护照/回忆成就/情感时间轴/漂流瓶/秘密便签/轻轻碰 |
| `mobile-app.js` | ~1950 | 手机版核心：认证/路由/主题/首页/懒加载调度(_ensureModule)+loading动画 |
| `modules/*.js` | ~6325 | 手机版7个懒加载模块：photos/albums/diary/records/timeline/map-passport/extras |
| `common.js` | ~150 | 共享工具：escapeHtml/sha256/formatFileSize + 常量(EMOTION_TYPES/MOOD_EMOJIS/DEFAULT_PROFILE) |
| `share.js` | ~300 | 分享页面：加载相册照片、密码验证 |
| `sw.js` | ~50 | Service Worker：离线缓存、PWA 安装 |

### 游戏 (`games/`)

| 文件 | 行数 | 职责 |
|------|------|------|
| `game-engine.js` | ~70 | 游戏注册/计分/排行榜/XP 桥接 |
| `games.css` | ~270 | 游戏通用样式：卡片/HUD/记忆翻牌/象棋/黑白棋 |
| `memory-card.js` | ~250 | 记忆翻牌：照片配对，3 种难度，计分排行榜 |
| `chinese-chess.js` | ~740 | 中国象棋：Canvas 棋盘、7种棋子完整规则、将军/将死/困毙/3次重复和棋 |
| `reversi.js` | ~260 | 黑白棋：8×8 奥赛罗、夹翻规则、自动跳回合 |

### 样式

| 文件 | 行数 | 职责 |
|------|------|------|
| `style.css` | ~2280 | 桌面版全部样式：侧边栏/照片网格/模态框/表单/地图/成就 |
| `mobile.css` | ~2880 | 手机版全部样式：暖粉主题/卡片布局/底部导航/RPG 系统/设置面板/周期追踪日历/模块loading动画 |

### 数据库迁移 (`migrations/`)

按顺序在 Supabase SQL Editor 中执行：

| 文件 | 内容 |
|------|------|
| `001_milestones_app_settings.sql` | 纪念日表、应用设置表 |
| `002_albums_share_links.sql` | 相册表、分享链接表、照片-相册关联表 |
| `003_couple_features.sql` | 心情日记/每日叨叨/亲密记录/经期记录/情侣打卡表 |
| `004_rpg_achievements.sql` | RPG 进度表（XP/等级/任务/称号/奖励） |
| `005_drift_bottles.sql` | 漂流瓶表（扔瓶/捞瓶/回复） |
| `006_secret_notes.sql` | 秘密便签表（地理围栏/过期/已读） |
| `007_nudges.sql` | 轻轻碰表（发送/已读状态） |
| `008_time_capsules.sql` | 时光胶囊表 |
| `009_add_length_checks.sql` | 内容长度 CHECK 约束 |
| `010_fix_rls.sql` | RLS 收紧 + profiles 表 + SECURITY DEFINER 函数 |
| `011_app_settings_anon_select.sql` | app_settings anon SELECT 策略（登录前必需） |
| `012_tighten_share_links.sql` | share_links 策略收紧：移除 anon 写入权限 |
| `013_period_daily.sql` | 周期追踪每日记录表（经期状态/流量强度/症状/备注） |
| `014_mini_games.sql` | 小游戏排行榜表 |

### 配置 & 构建

| 文件 | 用途 |
|------|------|
| `config.example.js` | Supabase 配置模板，复制为 `config.js` 填入密钥 |
| `package.json` | npm 依赖（仅 vite 用于构建时注入配置） |
| `vite.config.js` | Vite 构建配置：注入 `__APP_CONFIG__` 全局变量 |
| `vercel.json` | Vercel 部署配置：SPA 路由重写 + 安全头 |
| `scripts/build-config.js` | 构建脚本：生成 config.js + 版本号自动打标（JS/CSS/模块） |
| `scripts/extract-modules.js` | 模块提取脚本：从 mobile-app.js 拆分懒加载模块 |
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
  SUPABASE_STORAGE_URL: 'https://your-project.supabase.co/storage/v1/object/public/photo/',
  PEPPER: 'your-random-pepper-string',
  USER_EMAILS: { laoda: 'laoda@couple.local', xiaodi: 'xiaodi@couple.local' }
}
```
> `config.js` 已加入 `.gitignore`

## 数据库

在 Supabase SQL Editor 中依次执行 `migrations/` 目录下的 SQL 文件。

### 数据库表一览

| 表名 | 用途 |
|------|------|
| `categories` | 照片分类（无限级联） |
| `photos` | 照片记录（url/category/tags/location） |
| `milestones` | 纪念日（倒数日/里程碑/经期记录） |
| `app_settings` | 应用设置（主题/夜间模式等） |
| `albums` | 相册 |
| `album_photos` | 相册-照片关联 |
| `share_links` | 分享链接 |
| `mood_diary` | 心情日记 |
| `daily_chatter` | 每日叨叨 |
| `intimate_records` | 亲密记录（密码锁） |
| `period_records` | 经期记录（纪念日内嵌） |
| `period_daily_records` | 周期追踪每日记录（日历标记/流量/症状/预测） |
| `couple_tasks` | 情侣打卡任务 |
| `couple_checkins` | 情侣打卡记录 |
| `rpg_progress` | RPG 成就进度 |
| `drift_bottles` | 漂流瓶 |
| `secret_notes` | 秘密便签 |
| `nudges` | 轻轻碰 |
| `time_capsules` | 时光胶囊 |
| `game_scores` | 小游戏排行榜 |
| `profiles` | 用户档案 (user_id → username/role) |

### Storage Bucket

创建名为 `photo` 的公开 Storage Bucket。

## 部署

Vercel 部署，环境变量注入配置值，构建阶段生成 `config.js`。
