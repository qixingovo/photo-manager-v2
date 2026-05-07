-- ============================================
-- 005 照片漂流瓶 数据库迁移
-- ============================================

CREATE TABLE IF NOT EXISTS drift_bottles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    photo_id uuid REFERENCES photos(id) ON DELETE SET NULL,
    message TEXT DEFAULT '',
    status TEXT DEFAULT 'drifting',
    thrown_at TIMESTAMPTZ DEFAULT NOW(),
    reveal_at TIMESTAMPTZ,
    revealed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE drift_bottles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_drift_bottles"
    ON drift_bottles FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
