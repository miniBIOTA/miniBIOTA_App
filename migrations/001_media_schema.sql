-- Migration 001: Media asset library
-- Tracks local photo/video files with structured tags tied to species, biomes, systems, chronicles.

-- Core asset record
CREATE TABLE media_assets (
  id              bigserial PRIMARY KEY,
  filename        text NOT NULL,
  local_path      text NOT NULL UNIQUE,
  file_type       text NOT NULL CHECK (file_type IN ('photo', 'video')),
  size_bytes      bigint,
  duration_seconds integer,            -- video only
  captured_date   date,
  date_parse_source text,              -- 'filename' | 'manual' | 'file_mtime'
  description     text,
  notes           text,
  indexed_at      timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

-- Many-to-many: species featured in this asset
CREATE TABLE media_species (
  media_id    bigint NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  species_id  bigint NOT NULL REFERENCES species(id)      ON DELETE CASCADE,
  PRIMARY KEY (media_id, species_id)
);

-- Many-to-many: biomes shown in this asset
CREATE TABLE media_biomes (
  media_id  bigint NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  biome_id  bigint NOT NULL REFERENCES biomes(id)       ON DELETE CASCADE,
  PRIMARY KEY (media_id, biome_id)
);

-- Many-to-many: systems present or relevant in this asset
CREATE TABLE media_systems (
  media_id  bigint  NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  system_id integer NOT NULL REFERENCES systems(id)      ON DELETE CASCADE,
  PRIMARY KEY (media_id, system_id)
);

-- Many-to-many: chronicles this asset is associated with
CREATE TABLE media_chronicles (
  media_id     bigint NOT NULL REFERENCES media_assets(id)  ON DELETE CASCADE,
  chronicle_id bigint NOT NULL REFERENCES chronicles(id)    ON DELETE CASCADE,
  PRIMARY KEY (media_id, chronicle_id)
);

-- Free-form extensible tags (behavior, weather, quality, event, etc.)
-- Add new categories freely — no schema change needed, just new rows.
CREATE TABLE media_tags (
  id       serial PRIMARY KEY,
  name     text NOT NULL UNIQUE,
  category text    -- e.g. 'behavior', 'weather', 'quality', 'event', 'gear'
);

CREATE TABLE media_tag_links (
  media_id bigint  NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  tag_id   integer NOT NULL REFERENCES media_tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (media_id, tag_id)
);

-- Projects: group assets for a specific production deliverable
CREATE TABLE media_projects (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE media_project_assets (
  project_id integer NOT NULL REFERENCES media_projects(id) ON DELETE CASCADE,
  media_id   bigint  NOT NULL REFERENCES media_assets(id)   ON DELETE CASCADE,
  notes      text,
  PRIMARY KEY (project_id, media_id)
);

-- Indexes for common search and filter patterns
CREATE INDEX idx_media_assets_captured_date ON media_assets(captured_date);
CREATE INDEX idx_media_assets_file_type     ON media_assets(file_type);
CREATE INDEX idx_media_species_species       ON media_species(species_id);
CREATE INDEX idx_media_biomes_biome          ON media_biomes(biome_id);
CREATE INDEX idx_media_systems_system        ON media_systems(system_id);
CREATE INDEX idx_media_chronicles_chronicle  ON media_chronicles(chronicle_id);
CREATE INDEX idx_media_tag_links_tag         ON media_tag_links(tag_id);

-- Row Level Security
ALTER TABLE media_assets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_species        ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_biomes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_systems        ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_chronicles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_tags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_tag_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_project_assets ENABLE ROW LEVEL SECURITY;
-- No policies needed — service role key (used by Electron app) bypasses RLS.
