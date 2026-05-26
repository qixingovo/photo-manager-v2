-- 015: 修复 photo_categories 表 RLS 策略
-- 问题：photo_categories 表启用 RLS 但无 INSERT 策略，导致上传时分类关联静默失败
-- 在 Supabase SQL Editor 中执行

-- 确保 RLS 已启用
ALTER TABLE IF EXISTS photo_categories ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略（允许 authenticated 用户所有操作）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'allow_all_photo_categories'
        AND tablename = 'photo_categories'
    ) THEN
        CREATE POLICY "allow_all_photo_categories" ON photo_categories
            FOR ALL TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;

-- 同时确认 photos 表也有 RLS 策略
ALTER TABLE IF EXISTS photos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'allow_all_photos'
        AND tablename = 'photos'
    ) THEN
        CREATE POLICY "allow_all_photos" ON photos
            FOR ALL TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;
