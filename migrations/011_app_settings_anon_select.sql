-- 011: app_settings anon SELECT 策略
-- 登录前页面初始化需查询 anniversary_start_date
-- 在 Supabase SQL Editor 中执行

-- app_settings 的 intimate_password 已 SHA-256 哈希化，anon 可读不会泄露
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'app_settings_select_anon'
        AND tablename = 'app_settings'
    ) THEN
        CREATE POLICY "app_settings_select_anon" ON app_settings
            FOR SELECT TO anon USING (true);
    END IF;
END;
$$;

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
