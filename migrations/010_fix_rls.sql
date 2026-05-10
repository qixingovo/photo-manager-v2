-- 010: Supabase Auth 迁移 — profiles 表 + RLS 收紧 + 分享函数
-- 在 Supabase SQL Editor 中执行
-- 前提：已在 Supabase Dashboard → Authentication → Users 中创建用户

-- ============================================
-- Part A: 创建 profiles 表
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'xiaodi',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_auth" ON profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_self" ON profiles
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- Part B: 收紧所有 RLS 策略 → TO authenticated
-- ============================================
ALTER POLICY "allow_all_milestones" ON milestones TO authenticated;
ALTER POLICY "allow_all_app_settings" ON app_settings TO authenticated;
ALTER POLICY "allow_all_albums" ON albums TO authenticated;
ALTER POLICY "allow_all_album_photos" ON album_photos TO authenticated;
-- share_links 保留 TO anon（分享链接需要公开访问，由 SECURITY DEFINER 函数控制）
ALTER POLICY "allow_all_mood_diary" ON mood_diary TO authenticated;
ALTER POLICY "allow_all_daily_chatter" ON daily_chatter TO authenticated;
ALTER POLICY "allow_all_intimate_records" ON intimate_records TO authenticated;
ALTER POLICY "allow_all_period_records" ON period_records TO authenticated;
ALTER POLICY "allow_all_couple_tasks" ON couple_tasks TO authenticated;
ALTER POLICY "allow_all_couple_checkins" ON couple_checkins TO authenticated;
ALTER POLICY "allow_all_rpg_progress" ON rpg_progress TO authenticated;
ALTER POLICY "allow_all_drift_bottles" ON drift_bottles TO authenticated;
ALTER POLICY "allow_all_secret_notes" ON secret_notes TO authenticated;
ALTER POLICY "allow_all_nudges" ON nudges TO authenticated;
ALTER POLICY "allow_all_time_capsules" ON time_capsules TO authenticated;

-- ============================================
-- Part C: 分享功能 SECURITY DEFINER 函数
-- ============================================
-- get_shared_album 允许 anon 通过 RPC 获取分享的相册信息
CREATE OR REPLACE FUNCTION get_shared_album(share_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    share_record RECORD;
    album_record RECORD;
    photo_ids BIGINT[];
    photos_json JSONB;
    result JSONB;
BEGIN
    -- 查找分享链接
    SELECT * INTO share_record FROM share_links WHERE token = share_code;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', '链接无效');
    END IF;

    -- 检查过期
    IF share_record.expires_at IS NOT NULL AND share_record.expires_at < now() THEN
        RETURN jsonb_build_object('error', '链接已过期');
    END IF;

    -- 查找相册
    SELECT * INTO album_record FROM albums WHERE id = share_record.album_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', '相册不存在');
    END IF;

    -- 获取照片 ID 列表
    SELECT array_agg(photo_id) INTO photo_ids FROM album_photos WHERE album_id = share_record.album_id;

    -- 获取照片详情
    IF photo_ids IS NOT NULL AND array_length(photo_ids, 1) > 0 THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'description', p.description,
                'storage_path', p.storage_path,
                'location_name', p.location_name,
                'is_favorite', p.is_favorite,
                'created_at', p.created_at
            )
            ORDER BY p.created_at DESC
        ) INTO photos_json
        FROM photos p
        WHERE p.id = ANY(photo_ids);
    ELSE
        photos_json := '[]'::jsonb;
    END IF;

    -- 获取分类名称
    -- (简化处理：共享页面上分类名称是可选的装饰，不阻塞核心流程)

    RETURN jsonb_build_object(
        'album', jsonb_build_object(
            'id', album_record.id,
            'name', album_record.name,
            'description', album_record.description
        ),
        'photos', COALESCE(photos_json, '[]'::jsonb)
    );
END;
$$;
