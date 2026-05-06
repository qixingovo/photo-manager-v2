-- 相册、分享链接、足迹护照 — 数据库迁移
-- 在 Supabase SQL Editor 中执行

-- 0. 清理上次失败残留（如有）
DROP TABLE IF EXISTS album_photos;
DROP TABLE IF EXISTS share_links;
DROP TABLE IF EXISTS albums;

-- 1. 相册表
CREATE TABLE IF NOT EXISTS albums (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    cover_photo_id uuid,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 相册-照片关联表（多对多）
CREATE TABLE IF NOT EXISTS album_photos (
    album_id BIGINT REFERENCES albums(id) ON DELETE CASCADE,
    photo_id uuid REFERENCES photos(id) ON DELETE CASCADE,
    PRIMARY KEY (album_id, photo_id)
);

-- 3. 分享链接表
CREATE TABLE IF NOT EXISTS share_links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    album_id BIGINT REFERENCES albums(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 启用 RLS
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;

-- 5. RLS 策略：允许所有角色操作（应用层自定义认证）
CREATE POLICY "allow_all_albums"
    ON albums FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "allow_all_album_photos"
    ON album_photos FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "allow_all_share_links"
    ON share_links FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
