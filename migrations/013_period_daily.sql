-- 周期追踪每日记录表
CREATE TABLE IF NOT EXISTS period_daily_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name TEXT NOT NULL,
    record_date DATE NOT NULL,
    is_period BOOLEAN DEFAULT FALSE,
    flow_level INT DEFAULT 0,
    symptoms TEXT[] DEFAULT '{}',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_name, record_date)
);

ALTER TABLE period_daily_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_period_daily" ON period_daily_records
    USING (true) WITH CHECK (true);
