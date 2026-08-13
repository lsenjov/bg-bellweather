ALTER TABLE spectators
ADD COLUMN replay_only INTEGER NOT NULL DEFAULT 0 CHECK (replay_only IN (0, 1));
