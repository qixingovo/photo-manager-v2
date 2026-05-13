-- 014_mini_games: Game scores table for mini-games feature
CREATE TABLE IF NOT EXISTS game_scores (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    game_name TEXT NOT NULL,
    user_name TEXT NOT NULL,
    score INT NOT NULL DEFAULT 0,
    extra_data JSONB DEFAULT '{}',
    played_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_leaderboard
    ON game_scores (game_name, score DESC);

ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_game_scores" ON game_scores FOR ALL
    TO anon, authenticated
    USING (true) WITH CHECK (true);
