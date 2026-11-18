-- Playtest events. No IP address, user agent, or name is stored. pid is a random id kept in the player's browser; gid is one game.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,   -- server time, ms
  pid TEXT NOT NULL,
  gid TEXT,
  k TEXT NOT NULL,       -- start, season, battle, vote, over, leave, ...
  turn INTEGER,
  act INTEGER,
  d TEXT                 -- JSON detail
);
CREATE INDEX IF NOT EXISTS events_gid ON events (gid, id);
CREATE INDEX IF NOT EXISTS events_k ON events (k);
