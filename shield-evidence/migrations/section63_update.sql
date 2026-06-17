-- 1. Create the standalone evidence_source table with batch tracking
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

-- 2. Link evidence to the source
ALTER TABLE evidence 
  ADD COLUMN IF NOT EXISTS source_id INTEGER REFERENCES evidence_source(id);
