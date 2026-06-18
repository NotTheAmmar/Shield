-- Initialize tables if they do not exist

-- ═══════════════════════════════════════════════════════════
-- Enable PostGIS for spatial data types
-- ═══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS postgis;

-- ═══════════════════════════════════════════════════════════
-- Forensic flag ENUM — strongly typed, stack-able via arrays
-- ═══════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TYPE forensic_flag AS ENUM (
    'LOCATION_MISMATCH', 'TIME_SUSPICIOUS', 'STORAGE_TAMPERING',
    'DEVICE_INCONSISTENCY', 'METADATA_STRIPPED', 'SOCIAL_MEDIA_WIPE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- Core tables
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jurisdictions (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(255) NOT NULL,
  state     VARCHAR(100),
  boundary  GEOMETRY(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS idx_jurisdiction_boundary ON jurisdictions USING GIST (boundary);

CREATE TABLE IF NOT EXISTS fir (
  id                UUID         PRIMARY KEY,
  case_category     VARCHAR(100) DEFAULT '',
  description       TEXT         DEFAULT '',
  location          VARCHAR(255) DEFAULT '',
  jurisdiction_id   INT          REFERENCES jurisdictions(id),
  reporting_officer TEXT         NOT NULL,
  fir_number        VARCHAR(100) DEFAULT '',
  status            VARCHAR(50)  DEFAULT 'OPEN',
  registered_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_source (
  id SERIAL PRIMARY KEY,
  source_type VARCHAR(100) NOT NULL,
  make VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  identifiers VARCHAR(255),
  device_chain JSONB NOT NULL,
  lawful_control BOOLEAN NOT NULL DEFAULT FALSE,
  proper_operation BOOLEAN NOT NULL DEFAULT FALSE,
  ownership_status VARCHAR(50),
  certificate_status VARCHAR(50) DEFAULT 'PENDING_PART_A',
  signed_cert_file_path TEXT
);

CREATE TABLE IF NOT EXISTS evidence (
  id           UUID         PRIMARY KEY,
  fir_id       UUID         REFERENCES fir(id) NOT NULL,
  source_id    INTEGER      REFERENCES evidence_source(id),
  filename     VARCHAR(255) NOT NULL,
  bucket_name  VARCHAR(100) NOT NULL,
  object_key   VARCHAR(500) NOT NULL,
  sha256_hash  VARCHAR(64)  NOT NULL,
  uploaded_by  TEXT,
  uploaded_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- Extracted EXIF metadata (spatial + structured)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS evidence_metadata (
  id            SERIAL PRIMARY KEY,
  evidence_id   UUID UNIQUE REFERENCES evidence(id),
  gps_location  GEOMETRY(Point, 4326),
  camera_make   VARCHAR(100),
  camera_model  VARCHAR(100),
  original_date TIMESTAMP,            -- No TZ: raw camera wall-clock time
  file_size     BIGINT,
  mime_type     VARCHAR(100),
  all_metadata  JSONB DEFAULT '{}',
  processed_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_metadata_gps ON evidence_metadata USING GIST (gps_location);

-- ═══════════════════════════════════════════════════════════
-- Append-only forensic audit ledger (NEVER UPDATE, only INSERT)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS evidence_forensic_log (
  id           SERIAL PRIMARY KEY,
  evidence_id  UUID REFERENCES evidence(id),
  flags        forensic_flag[] NOT NULL,
  details      JSONB DEFAULT '{}',
  actor        VARCHAR(100) DEFAULT 'SYSTEM_WORKER',
  logged_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- Existing audit tables
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL       PRIMARY KEY,
  evidence_id  UUID         REFERENCES evidence(id),
  action       VARCHAR(50),
  result       VARCHAR(20),
  actor_id     TEXT,
  checked_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_audit_log (
  id           SERIAL PRIMARY KEY,
  user_id      TEXT,
  method       VARCHAR(10) NOT NULL,
  endpoint     VARCHAR(255) NOT NULL,
  ip_address   VARCHAR(45) NOT NULL,
  status_code  INT NOT NULL,
  accessed_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- Report job tracking (for async PDF generation)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS report_jobs (
  id           VARCHAR(36) PRIMARY KEY,
  evidence_id  UUID REFERENCES evidence(id),
  status       VARCHAR(20) DEFAULT 'QUEUED',
  download_url TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
