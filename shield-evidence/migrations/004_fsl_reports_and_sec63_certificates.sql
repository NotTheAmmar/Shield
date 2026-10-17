-- Person 3: Forensic Science Laboratory (FSL), Evidence Blockchain Anchoring & Sec 63 BSA Certification
-- Schema definitions for Forensic Analysis Reports, EVM Block Anchoring & Statutory Section 63 BSA Certificates

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS ledger_block_number BIGINT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS has_report BOOLEAN DEFAULT FALSE;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS report_object_key TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS report_filename TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS report_hash VARCHAR(64);
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS report_tools TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS report_methodology TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS report_results TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS report_uploaded_at TIMESTAMPTZ;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS sec63_status VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS sec63_cert_path TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS sec63_signed_at TIMESTAMPTZ;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS sec63_signatory_name TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS sec63_analyst_id TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS sec63_fsl_lab TEXT;

CREATE TABLE IF NOT EXISTS forensic_analysis_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID REFERENCES evidence(id) ON DELETE CASCADE NOT NULL,
  filename VARCHAR(255) NOT NULL,
  bucket_name VARCHAR(100) NOT NULL,
  object_key VARCHAR(500) NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  tools_used TEXT,
  extraction_methodology TEXT,
  hash_verification_results TEXT,
  examiner_notes TEXT,
  examiner_id UUID,
  examiner_name VARCHAR(255),
  examiner_employee_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fsl_report_evidence_id ON forensic_analysis_reports(evidence_id);

CREATE TABLE IF NOT EXISTS section63_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID REFERENCES evidence(id) ON DELETE CASCADE NOT NULL,
  fir_id UUID REFERENCES fir(id) ON DELETE CASCADE NOT NULL,
  certificate_object_key TEXT NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  ledger_tx_id TEXT,
  ledger_block_number BIGINT,
  ledger_timestamp TIMESTAMPTZ,
  signatory_id UUID,
  signatory_name VARCHAR(255) NOT NULL,
  analyst_id VARCHAR(100) NOT NULL,
  designation VARCHAR(150) NOT NULL,
  fsl_jurisdiction VARCHAR(150),
  statutory_declaration TEXT NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec63_evidence_id ON section63_certificates(evidence_id);
