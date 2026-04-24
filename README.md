# 📷 照片分类管理系统

基于 Supabase 的照片分类管理网站，支持上传、分类、搜索和删除照片。

## 功能

- 📤 上传照片（支持 jpg/png/gif/webp）
- 📁 创建/删除分类
- 🔍 按分类筛选
- 🔎 搜索照片
- 🗑️ 删除照片

## 技术栈

- **前端**: HTML + CSS + JavaScript (ES6+)
- **后端**: Supabase (PostgreSQL + Storage)
- **部署**: Vercel

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 配置

1. 复制配置模板：

```bash
cp config.example.js config.js
```

2. 在 `config.js` 中填写 Supabase 配置：

```javascript
window.__APP_CONFIG__ = {
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key',
  SUPABASE_STORAGE_URL: 'https://your-project.supabase.co/storage/v1/object/public/photo/'
}
```

> `config.js` 已加入 `.gitignore`，避免将真实 key 提交到仓库。

## 数据库设置

需要在 Supabase 中创建以下表：

```sql
-- 分类表
CREATE TABLE categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 照片表
CREATE TABLE photos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    storage_path TEXT NOT NULL,
    original_name TEXT,
    size BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 开启 RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- ⚠️ 不要使用 FOR ALL + true 的全开放策略
-- 下面是更安全的最小策略示例：
-- 1) 匿名仅可读
CREATE POLICY "categories_read_anon"
ON categories FOR SELECT
TO anon
USING (true);

CREATE POLICY "photos_read_anon"
ON photos FOR SELECT
TO anon
USING (true);

-- 2) 写入仅允许 authenticated（生产建议走登录态或后端服务）
CREATE POLICY "categories_write_authenticated"
ON categories FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "categories_update_authenticated"
ON categories FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "categories_delete_authenticated"
ON categories FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "photos_write_authenticated"
ON photos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "photos_update_authenticated"
ON photos FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "photos_delete_authenticated"
ON photos FOR DELETE
TO authenticated
USING (true);
```

### 账号密码登录（不用邮箱）

前端会调用 `authenticate_user` 函数校验账号密码。可用以下 SQL 创建仅账号登录所需表与函数：

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('laoda', 'user')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION authenticate_user(p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user app_users%ROWTYPE;
BEGIN
    SELECT * INTO v_user
    FROM app_users
    WHERE username = p_username
      AND is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false);
    END IF;

    IF crypt(p_password, v_user.password_hash) <> v_user.password_hash THEN
        RETURN jsonb_build_object('success', false);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'username', v_user.username,
        'role', v_user.role
    );
END;
$$;

REVOKE ALL ON TABLE app_users FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION authenticate_user(TEXT, TEXT) TO anon, authenticated;

-- 只保留两个账号（示例）
-- ⚠️ 两个账号必须使用不同的高强度密码
-- ⚠️ 部署前必须替换下方占位密码，禁止直接使用示例值
INSERT INTO app_users (username, password_hash, role)
VALUES
('laoda', crypt('CHANGE_THIS_TO_UNIQUE_STRONG_PASSWORD_MIN_16_CHARS_1', gen_salt('bf')), 'laoda'),
('xiaodi', crypt('CHANGE_THIS_TO_UNIQUE_STRONG_PASSWORD_MIN_16_CHARS_2', gen_salt('bf')), 'user');
```

## Storage Bucket

创建名为 `photos` 的公开 Storage Bucket。

## 部署到 Vercel

1. Fork 此仓库
2. 在 Vercel 中导入项目
3. 在 Vercel 项目设置中，使用环境变量保存配置值（如 `SUPABASE_URL`、`SUPABASE_ANON_KEY`）
4. 在构建阶段生成 `config.js`（内容结构与 `config.example.js` 一致），并确保部署产物可访问该文件
5. 点击 Deploy

请确保部署平台注入或提供 `config.js`，不要把真实 key 硬编码到源码并提交到仓库。
