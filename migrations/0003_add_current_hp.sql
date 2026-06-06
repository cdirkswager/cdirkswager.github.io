-- Add current_hp tracking for Well Rested panel
ALTER TABLE players ADD COLUMN current_hp INTEGER NOT NULL DEFAULT 0;
UPDATE players SET current_hp = max_hp WHERE current_hp = 0;
