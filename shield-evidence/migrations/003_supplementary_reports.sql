-- Person 2: Supplementary Reports & Police Station Jurisdiction Scoping
-- Schema definitions for Section 193(9) BNSS Append-Only Case Diaries and FIR Freeze

ALTER TABLE fir ADD COLUMN IF NOT EXISTS station VARCHAR(100);
ALTER TABLE fir ADD COLUMN IF NOT EXISTS applicable_sections TEXT DEFAULT '';
ALTER TABLE fir ADD COLUMN IF NOT EXISTS incident_date_time TIMESTAMPTZ;
ALTER TABLE fir ADD COLUMN IF NOT EXISTS jurisdiction_name VARCHAR(255) DEFAULT '';

CREATE TABLE IF NOT EXISTS fir_supplementary_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fir_id UUID REFERENCES fir(id) ON DELETE CASCADE NOT NULL,
  report_number INT NOT NULL,
  narrative TEXT NOT NULL,
  discovered_items TEXT DEFAULT '',
  fsl_notified BOOLEAN DEFAULT FALSE,
  reporting_officer UUID REFERENCES users(id),
  officer_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sha256_hash VARCHAR(64),
  ledger_tx_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_fir_supp_fir_id ON fir_supplementary_reports(fir_id);
