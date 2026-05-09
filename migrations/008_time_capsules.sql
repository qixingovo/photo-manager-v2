-- 时光胶囊表
-- 支持定时解锁、定位解锁、定时+定位双条件解锁
-- 解锁后双方永久可见

CREATE TABLE IF NOT EXISTS time_capsules (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_by TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    photo_storage_path TEXT,
    unlock_mode TEXT NOT NULL DEFAULT 'time',  -- 'time' | 'location' | 'both'
    reveal_at TIMESTAMPTZ,
    reveal_lat DOUBLE PRECISION,
    reveal_lng DOUBLE PRECISION,
    reveal_radius INT DEFAULT 200,
    status TEXT NOT NULL DEFAULT 'locked',  -- 'locked' | 'unlocked'
    unlocked_by TEXT,
    unlocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE time_capsules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_time_capsules"
    ON time_capsules FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
