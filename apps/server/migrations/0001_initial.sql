CREATE TABLE games (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL CHECK (status IN ('lobby', 'active', 'finished')),
  ruleset_version TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  host_seat_id TEXT,
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
) STRICT;

CREATE TABLE seats (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  controller TEXT NOT NULL CHECK (controller IN ('human', 'agent')),
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1)),
  token_lookup TEXT NOT NULL UNIQUE,
  token_salt BLOB NOT NULL,
  token_hash BLOB NOT NULL,
  joined_at TEXT NOT NULL,
  UNIQUE (game_id, position)
) STRICT;

CREATE TABLE spectators (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  controller TEXT NOT NULL CHECK (controller IN ('human', 'agent')),
  token_lookup TEXT NOT NULL UNIQUE,
  token_salt BLOB NOT NULL,
  token_hash BLOB NOT NULL,
  joined_at TEXT NOT NULL
) STRICT;

CREATE TABLE events (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  actor_seat_id TEXT REFERENCES seats(id),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'seat')),
  private_seat_id TEXT REFERENCES seats(id),
  occurred_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (game_id, version),
  CHECK (
    (visibility = 'public' AND private_seat_id IS NULL) OR
    (visibility = 'seat' AND private_seat_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE processed_commands (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seat_id TEXT NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, seat_id, command_id)
) STRICT;

CREATE TABLE snapshots (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  ruleset_version TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, version)
) STRICT;

CREATE INDEX events_game_version_idx ON events(game_id, version);
CREATE INDEX seats_game_idx ON seats(game_id, position);
CREATE INDEX spectators_game_idx ON spectators(game_id, joined_at);
