CREATE TABLE IF NOT EXISTS clan_rankings (id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar INTEGER NOT NULL DEFAULT 0, wave INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS clan_rankings_wave ON clan_rankings(wave DESC);
CREATE TABLE IF NOT EXISTS clan_limits (id TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS clan_limits_expires ON clan_limits(expires);
