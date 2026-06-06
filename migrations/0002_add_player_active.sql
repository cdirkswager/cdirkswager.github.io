-- Add is_active flag for players (party roster toggle)
ALTER TABLE players ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;
