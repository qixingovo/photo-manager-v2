-- ============================================
-- 003 情侣扩展功能 数据库迁移
-- 心情日记 / 每日叨叨 / 亲密记录 / 纪念日升级 / 情侣打卡
-- ============================================

-- 1. 心情日记表
CREATE TABLE IF NOT EXISTS mood_diary (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name TEXT NOT NULL,
    mood TEXT NOT NULL,
    content TEXT DEFAULT '',
    photo_id uuid REFERENCES photos(id) ON DELETE SET NULL,
    created_at DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 每日叨叨表
CREATE TABLE IF NOT EXISTS daily_chatter (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name TEXT NOT NULL,
    content TEXT NOT NULL,
    photo_id uuid REFERENCES photos(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 亲密记录表
CREATE TABLE IF NOT EXISTS intimate_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name TEXT NOT NULL,
    record_date DATE NOT NULL,
    mood TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    photo_id uuid REFERENCES photos(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 纪念日扩展
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS milestone_type TEXT DEFAULT 'anniversary';
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS repeat_yearly BOOLEAN DEFAULT false;

-- 5. 经期记录表
CREATE TABLE IF NOT EXISTS period_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 情侣任务模板表
CREATE TABLE IF NOT EXISTS couple_tasks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'general',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 情侣打卡记录表
CREATE TABLE IF NOT EXISTS couple_checkins (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id BIGINT REFERENCES couple_tasks(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    photo_id uuid REFERENCES photos(id) ON DELETE SET NULL,
    note TEXT DEFAULT '',
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS 策略 (与现有 allow_all 模式一致)
-- ============================================

ALTER TABLE mood_diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_chatter ENABLE ROW LEVEL SECURITY;
ALTER TABLE intimate_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_mood_diary" ON mood_diary FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_daily_chatter" ON daily_chatter FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_intimate_records" ON intimate_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_period_records" ON period_records FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_couple_tasks" ON couple_tasks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_couple_checkins" ON couple_checkins FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- 预设情侣任务 (20条)
-- ============================================

INSERT INTO couple_tasks (title, description, category, sort_order) VALUES
('一起看日出', '找一天早起，去山顶或海边一起看日出，感受新的一天', 'general', 1),
('一起做饭', '一起买菜、一起下厨，做一顿属于两个人的晚餐', 'general', 2),
('一起看电影', '去电影院或者窝在家里，看一部两人都想看的电影', 'date', 3),
('一起旅行', '计划一次短途或长途旅行，去一个没去过的地方', 'travel', 4),
('写一封情书', '手写一封信给对方，说说心里话', 'general', 5),
('一起看星星', '找一个晴朗的夜晚，躺在草地上看星星', 'date', 6),
('一起去游乐园', '坐过山车、吃棉花糖，像孩子一样玩一天', 'date', 7),
('一起泡温泉', '找一个温泉度假村，放松身心', 'travel', 8),
('拍一组情侣照', '穿上情侣装，找摄影师或自己拍一组美美的合照', 'general', 9),
('一起逛夜市', '手牵手逛夜市，吃各种小吃', 'date', 10),
('一起学一样新东西', '一起学跳舞、烘焙、画画……任何你们都想尝试的', 'general', 11),
('给对方一个惊喜', '准备一份对方想不到的礼物或安排', 'general', 12),
('一起去海边', '踩沙滩、踏浪花、看日落', 'travel', 13),
('一起看演唱会', '买两张演唱会门票，一起嗨', 'date', 14),
('一起露营', '搭帐篷、生篝火、聊天到深夜', 'travel', 15),
('交换日记', '各写一篇日记，记录最近的心情，然后交换阅读', 'general', 16),
('一起做手工', '一起做陶艺、串手链、拼乐高……', 'general', 17),
('去第一次约会的地方', '重温第一次约会的感觉', 'date', 18),
('一起种一棵植物', '一起种花种草，看着它慢慢长大', 'general', 19),
('为对方做早餐', '早起为对方做一份爱心早餐', 'general', 20);
