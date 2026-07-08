-- ============================================================
-- D&D DM Tool — Cloudflare D1 Schema
-- Run with: npx wrangler d1 execute dnd-dm-tool --file=schema.sql
-- ============================================================

-- ============================================================
-- CAMPAIGNS
-- ============================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  -- Global DM weights for party effectiveness gauge (must sum to 1.0)
  weight_offense    REAL NOT NULL DEFAULT 0.34,
  weight_defense    REAL NOT NULL DEFAULT 0.33,
  weight_healing    REAL NOT NULL DEFAULT 0.33,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);


-- ============================================================
-- PLAYERS
-- ============================================================

CREATE TABLE IF NOT EXISTS players (
  id                    TEXT PRIMARY KEY,
  campaign_id           TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  class                 TEXT,
  subclass              TEXT,
  level                 INTEGER NOT NULL DEFAULT 1,
  race                  TEXT,
  ac                    INTEGER,
  max_hp                INTEGER NOT NULL DEFAULT 10,
  passive_perception    INTEGER,
  passive_investigation INTEGER,
  passive_insight       INTEGER,
  exhaustion_level      INTEGER NOT NULL DEFAULT 0, -- 0-6
  languages             TEXT,    -- JSON array e.g. ["Common", "Elvish"]
  notable_abilities     TEXT,    -- JSON array e.g. ["Darkvision 60ft", "Lucky"]
  display_order         INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_campaign ON players(campaign_id);


-- ============================================================
-- PLAYER RESOURCES
-- Dynamic, fully tunable. One row per resource per player.
-- Spell slots = one row per level (e.g. "Spell Slot 1st", slot_level = 1)
-- ============================================================

CREATE TABLE IF NOT EXISTS player_resources (
  id                      TEXT PRIMARY KEY,
  player_id               TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  -- 'numeric'  = Ki, Rage, Channel Divinity, charges, etc.
  -- 'spell_slot' = standard 1st-9th level slots
  -- 'binary'   = on/off (e.g. Wild Shape availability)
  resource_type           TEXT NOT NULL DEFAULT 'numeric',
  slot_level              INTEGER,    -- 1-9 for spell slots, NULL otherwise
  current_value           INTEGER NOT NULL DEFAULT 0,
  max_value               INTEGER NOT NULL DEFAULT 0,
  -- Recovery type determines short rest prompt logic
  recovery_type           TEXT NOT NULL DEFAULT 'long_rest',
                                      -- 'long_rest' | 'short_rest' | 'encounter' | 'per_turn'
  -- Effective combat value weights (0.0 - 1.0 each)
  weight_damage_boost     REAL NOT NULL DEFAULT 0.0,
  weight_damage_reduction REAL NOT NULL DEFAULT 0.0,
  weight_healing          REAL NOT NULL DEFAULT 0.0,
  display_order           INTEGER NOT NULL DEFAULT 0,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resources_player ON player_resources(player_id);


-- ============================================================
-- MONSTERS
-- Library of stat blocks — SRD, custom uploads, homebrew.
-- CR stored as TEXT to handle '1/2', '1/4', '1/8'.
-- Speed, resistances, senses stored as JSON for flexibility.
-- ============================================================

CREATE TABLE IF NOT EXISTS monsters (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  source                  TEXT NOT NULL DEFAULT 'custom', -- 'srd' | 'custom' | 'homebrew'
  cr                      TEXT,
  xp                      INTEGER,
  size                    TEXT,  -- 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan'
  monster_type            TEXT,  -- 'beast' | 'undead' | 'humanoid' etc.
  alignment               TEXT,

  -- Core combat stats
  ac                      INTEGER,
  ac_notes                TEXT,  -- e.g. "natural armor", "shield"
  hp_max                  INTEGER NOT NULL,
  hp_formula              TEXT,  -- e.g. "8d10+24"

  -- Speed as JSON: {"walk": 30, "fly": 60, "swim": 0, "climb": 0, "burrow": 0}
  speed                   TEXT,

  -- Ability scores
  str INTEGER, dex INTEGER, con INTEGER,
  int INTEGER, wis INTEGER, cha INTEGER,

  -- JSON objects — only proficient saves/skills included
  -- e.g. {"dex": 4, "wis": 2}
  saving_throws           TEXT,
  skills                  TEXT,

  -- Damage tags — JSON arrays of damage type strings
  -- e.g. ["fire", "cold", "bludgeoning from nonmagical attacks"]
  damage_resistances      TEXT,
  damage_immunities       TEXT,
  damage_vulnerabilities  TEXT,
  condition_immunities    TEXT,

  -- Senses as JSON: {"darkvision": 60, "tremorsense": 30, "passive_perception": 14}
  senses                  TEXT,

  languages               TEXT,

  -- Passive features/traits as JSON array: [{"name": "Pack Tactics", "description": "..."}]
  passives                TEXT,

  -- Spellcasting
  spell_dc                INTEGER,
  spell_attack_bonus      INTEGER,
  -- Spells as JSON grouped by level:
  -- {"cantrips": ["Fire Bolt"], "1": ["Burning Hands"], "2": ["Scorching Ray"]}
  spells_available        TEXT,

  -- DM reference text
  description             TEXT,
  rp_notes                TEXT,

  -- Combat reminders (shown contextually during combat)
  bloodied_reminder       TEXT,  -- shown when HP drops to 50%
  death_reminder          TEXT,  -- shown when HP hits 0

  -- Legendary / lair
  legendary_action_count  INTEGER NOT NULL DEFAULT 0,
  lair_action_count       INTEGER NOT NULL DEFAULT 0,

  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monsters_name   ON monsters(name);
CREATE INDEX IF NOT EXISTS idx_monsters_source ON monsters(source);
CREATE INDEX IF NOT EXISTS idx_monsters_cr     ON monsters(cr);


-- ============================================================
-- MONSTER ACTIONS
-- Covers: actions, bonus actions, reactions, legendary, lair, multiattack
-- ============================================================

CREATE TABLE IF NOT EXISTS monster_actions (
  id                    TEXT PRIMARY KEY,
  monster_id            TEXT NOT NULL REFERENCES monsters(id) ON DELETE CASCADE,
  -- 'action' | 'bonus_action' | 'reaction' | 'legendary' | 'lair' | 'multiattack'
  action_type           TEXT NOT NULL DEFAULT 'action',
  name                  TEXT NOT NULL,

  -- Attack properties
  attack_bonus          INTEGER,
  advantage_note        TEXT,   -- e.g. "Advantage if target is prone"
  reach_range           TEXT,   -- e.g. "5 ft." or "60/120 ft."

  -- Primary damage
  avg_damage            INTEGER,
  damage_dice           TEXT,   -- e.g. "2d6+4"
  damage_type           TEXT,   -- e.g. "slashing"

  -- Secondary damage (e.g. poison on top of piercing)
  secondary_avg_damage  INTEGER,
  secondary_damage_dice TEXT,
  secondary_damage_type TEXT,

  -- Save instead of attack roll
  save_dc               INTEGER,
  save_ability          TEXT,   -- 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'

  description           TEXT,
  display_order         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_actions_monster ON monster_actions(monster_id);


-- ============================================================
-- NPCs
-- Unique named characters converted from a monster base,
-- or created from scratch. Persist across sessions.
-- ============================================================

CREATE TABLE IF NOT EXISTS npcs (
  id                TEXT PRIMARY KEY,
  campaign_id       TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  monster_id        TEXT REFERENCES monsters(id), -- base stat block, nullable
  name              TEXT NOT NULL,
  role              TEXT,      -- e.g. "Blacksmith", "Guild Master", "Spy"
  faction           TEXT,
  location          TEXT,
  -- 'alive' | 'dead' | 'missing' | 'captive' | 'unknown'
  status            TEXT NOT NULL DEFAULT 'alive',
  -- 'ally' | 'neutral' | 'hostile' | 'unknown'
  relationship      TEXT NOT NULL DEFAULT 'unknown',
  portrait_url      TEXT,
  description       TEXT,
  rp_notes          TEXT,
  -- Stat overrides (when NPC differs from base monster)
  ac_override       INTEGER,
  hp_max_override   INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_npcs_campaign     ON npcs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_npcs_status       ON npcs(status);
CREATE INDEX IF NOT EXISTS idx_npcs_relationship ON npcs(relationship);


-- ============================================================
-- NPC NOTES
-- Timestamped quicknotes, addable from initiative or NPC page.
-- ============================================================

CREATE TABLE IF NOT EXISTS npc_notes (
  id          TEXT PRIMARY KEY,
  npc_id      TEXT NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES sessions(id),
  note        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_npc_notes_npc ON npc_notes(npc_id);


-- ============================================================
-- SESSIONS
-- One row per game session. Ties notes, encounters, and NPCs.
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  campaign_id    TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_number INTEGER,
  title          TEXT,
  notes          TEXT,  -- freeform session scratchpad
  played_at      INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_campaign ON sessions(campaign_id);


-- ============================================================
-- NPC SESSION APPEARANCES
-- Auto-stamped when an NPC enters combat or is noted in a session.
-- ============================================================

CREATE TABLE IF NOT EXISTS npc_sessions (
  npc_id     TEXT NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (npc_id, session_id)
);


-- ============================================================
-- SCENES / LOCATIONS
-- Cards that group encounters + NPCs under a named location.
-- ============================================================

CREATE TABLE IF NOT EXISTS scenes (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  notes       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scene_npcs (
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  npc_id   TEXT NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  PRIMARY KEY (scene_id, npc_id)
);


-- ============================================================
-- ENCOUNTERS
-- Saved encounter templates for prep. Load into combat with one action.
-- ============================================================

CREATE TABLE IF NOT EXISTS encounters (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id    TEXT REFERENCES scenes(id),
  name        TEXT NOT NULL,
  -- 'easy' | 'medium' | 'hard' | 'deadly' — computed from XP budget
  difficulty  TEXT,
  notes       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_encounters_campaign ON encounters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_encounters_scene    ON encounters(scene_id);


-- ============================================================
-- ENCOUNTER MONSTERS
-- Which monsters (and how many) are in a saved encounter template.
-- ============================================================

CREATE TABLE IF NOT EXISTS encounter_monsters (
  id          TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  monster_id  TEXT NOT NULL REFERENCES monsters(id),
  quantity    INTEGER NOT NULL DEFAULT 1,
  hp_override INTEGER,   -- override default HP for this encounter
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_enc_monsters_encounter ON encounter_monsters(encounter_id);


-- ============================================================
-- COMBAT SESSIONS
-- A live or historical combat instance.
-- State is synced here at meaningful checkpoints (turn end, combat end).
-- Live in-turn state is held client-side for zero latency.
-- ============================================================

CREATE TABLE IF NOT EXISTS combat_sessions (
  id                  TEXT PRIMARY KEY,
  campaign_id         TEXT NOT NULL REFERENCES campaigns(id),
  encounter_id        TEXT REFERENCES encounters(id),
  session_id          TEXT REFERENCES sessions(id),
  round               INTEGER NOT NULL DEFAULT 1,
  current_turn_index  INTEGER NOT NULL DEFAULT 0,
  -- 'active' | 'paused' | 'ended'
  state               TEXT NOT NULL DEFAULT 'active',
  started_at          INTEGER NOT NULL,
  ended_at            INTEGER
);


-- ============================================================
-- COMBATANTS
-- The initiative order for an active combat session.
-- player_id, monster_id, or npc_id — only one will be set per row.
-- ============================================================

CREATE TABLE IF NOT EXISTS combatants (
  id                          TEXT PRIMARY KEY,
  combat_session_id           TEXT NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
  -- Source reference — one of these will be set
  player_id                   TEXT REFERENCES players(id),
  monster_id                  TEXT REFERENCES monsters(id),
  npc_id                      TEXT REFERENCES npcs(id),
  -- Display
  display_name                TEXT NOT NULL,
  -- Position in initiative order (higher = earlier)
  initiative                  INTEGER NOT NULL,
  display_order               INTEGER NOT NULL DEFAULT 0,
  -- HP
  hp_current                  INTEGER NOT NULL,
  hp_max                      INTEGER NOT NULL,
  hp_temp                     INTEGER NOT NULL DEFAULT 0,
  -- AC (copied from source at combat start, in case stat block changes)
  ac                          INTEGER,
  -- Status flags
  is_player                   INTEGER NOT NULL DEFAULT 0,  -- 1 = PC, 0 = monster/NPC
  is_concentrating            INTEGER NOT NULL DEFAULT 0,
  concentration_spell         TEXT,
  has_used_reaction           INTEGER NOT NULL DEFAULT 0,
  is_readied                  INTEGER NOT NULL DEFAULT 0,
  readied_trigger             TEXT,   -- "when enemy moves within 5ft..."
  legendary_actions_remaining INTEGER NOT NULL DEFAULT 0,
  -- Death saves (PCs)
  death_saves_successes       INTEGER NOT NULL DEFAULT 0,
  death_saves_failures        INTEGER NOT NULL DEFAULT 0,
  -- Active conditions as JSON array:
  -- [{"type": "prone", "rounds_remaining": 2}, {"type": "stunned", "rounds_remaining": 1}]
  conditions                  TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_combatants_combat ON combatants(combat_session_id);
CREATE INDEX IF NOT EXISTS idx_combatants_order  ON combatants(combat_session_id, display_order);
