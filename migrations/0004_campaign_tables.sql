-- Campaign data tables for KV→D1 migration
-- Each table mirrors an array/object in the campaign-data blob.
-- The `data` TEXT column holds the full entity JSON.
-- Indexed columns (id, name, player_id, map_id) enable filtering/sorting
-- without parsing JSON.

CREATE TABLE IF NOT EXISTS campaign_players (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_npcs (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_maps (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_map_pins (
  id         TEXT PRIMARY KEY,
  map_id     TEXT,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_map_pins_map ON campaign_map_pins(map_id);

CREATE TABLE IF NOT EXISTS campaign_questionnaires (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_responses (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaign_downtime_chronicles (
  id         TEXT PRIMARY KEY,
  player_id  TEXT,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_dc_player ON campaign_downtime_chronicles(player_id);

CREATE TABLE IF NOT EXISTS campaign_notifications (
  id         TEXT PRIMARY KEY,
  player_id  TEXT,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_notifs_player ON campaign_notifications(player_id);

-- Flattened: comments[npcId] → one row per comment
CREATE TABLE IF NOT EXISTS campaign_comments (
  id         TEXT PRIMARY KEY,
  player_id  TEXT,
  data       TEXT NOT NULL,
  timestamp  INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_comments_player ON campaign_comments(player_id);

CREATE TABLE IF NOT EXISTS campaign_calendar_events (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Flattened: calendar.comments[dateKey] → one row per comment
CREATE TABLE IF NOT EXISTS campaign_calendar_comments (
  id         TEXT PRIMARY KEY,
  date_key   TEXT,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_cal_comments_date ON campaign_calendar_comments(date_key);

-- Singleton row (id = 'singleton') holding calendar.state
CREATE TABLE IF NOT EXISTS campaign_calendar_state (
  id         TEXT PRIMARY KEY DEFAULT 'singleton',
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
