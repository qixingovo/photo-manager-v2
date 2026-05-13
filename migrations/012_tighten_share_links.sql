-- 012: 收紧 share_links RLS 策略
-- share_links 当前 FOR ALL TO anon,authenticated，anon 可写入
-- get_shared_album (SECURITY DEFINER) 已覆盖 anon 读取需求，
-- 无需 anon 直接表访问
-- 在 Supabase SQL Editor 中执行

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'allow_all_share_links'
        AND tablename = 'share_links'
        AND 'anon' = ANY(roles)
    ) THEN
        ALTER POLICY "allow_all_share_links" ON share_links
            TO authenticated;
    END IF;
END;
$$;

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
