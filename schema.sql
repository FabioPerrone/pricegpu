-- PriceGPU analytics (Cloudflare D1)
--
-- Apply with:
--   npx wrangler d1 create pricegpu-analytics
--   npx wrangler d1 execute pricegpu-analytics --remote --file=schema.sql
--
-- One row per view or outbound click. Deliberately stores nothing that
-- identifies a person: no IP, no user or session id, no cookie. Country and
-- device class come from Cloudflare request properties and are coarse enough
-- to stay aggregate, which keeps this outside consent-gated tracking.

CREATE TABLE IF NOT EXISTS event (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,          -- unix seconds
  day           TEXT    NOT NULL,          -- YYYY-MM-DD, for cheap grouping
  type          TEXT    NOT NULL,          -- 'view' | 'click'
  path          TEXT    NOT NULL,          -- page the event happened on
  provider      TEXT,                      -- click only: provider slug
  gpu           TEXT,                      -- gpu slug in context, when known
  position      INTEGER,                   -- click only: row index in the table
  price_usd     REAL,                      -- click only: price shown at click time
  referrer_host TEXT,                      -- external referrer host only
  country       TEXT,                      -- 2-letter, from Cloudflare
  device        TEXT                       -- 'mobile' | 'desktop'
);

CREATE INDEX IF NOT EXISTS idx_event_day       ON event (day);
CREATE INDEX IF NOT EXISTS idx_event_type_day  ON event (type, day);
CREATE INDEX IF NOT EXISTS idx_event_path      ON event (path);
CREATE INDEX IF NOT EXISTS idx_event_provider  ON event (provider) WHERE provider IS NOT NULL;

-- Conversions reported back by affiliate networks. Filled in by hand or by a
-- future importer; joined to clicks by provider and day to get real EPC.
CREATE TABLE IF NOT EXISTS conversion (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  day          TEXT NOT NULL,
  provider     TEXT NOT NULL,
  conversions  INTEGER NOT NULL DEFAULT 0,
  revenue_usd  REAL    NOT NULL DEFAULT 0,
  note         TEXT,
  UNIQUE (day, provider)
);
