-- 009: 添加内容长度 CHECK 约束，防止服务端超大输入攻击
-- 在 Supabase SQL Editor 中执行

ALTER TABLE mood_diary ADD CONSTRAINT chk_mood_content_length CHECK (char_length(content) <= 5000);
ALTER TABLE daily_chatter ADD CONSTRAINT chk_chatter_content_length CHECK (char_length(content) <= 2000);
ALTER TABLE secret_notes ADD CONSTRAINT chk_secret_content_length CHECK (char_length(content) <= 5000);
ALTER TABLE drift_bottles ADD CONSTRAINT chk_bottle_content_length CHECK (char_length(message) <= 2000);
ALTER TABLE time_capsules ADD CONSTRAINT chk_capsule_title_length CHECK (char_length(title) <= 200);
ALTER TABLE time_capsules ADD CONSTRAINT chk_capsule_content_length CHECK (char_length(content) <= 10000);
ALTER TABLE milestones ADD CONSTRAINT chk_milestone_title_length CHECK (char_length(title) <= 200);
ALTER TABLE albums ADD CONSTRAINT chk_album_name_length CHECK (char_length(name) <= 200);
