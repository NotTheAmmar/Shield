CREATE TABLE IF NOT EXISTS fir (
  id                UUID         PRIMARY KEY,
  case_category     VARCHAR(100) NOT NULL,
  description       TEXT         NOT NULL,
  location          VARCHAR(255) NOT NULL,
  reporting_officer UUID         NOT NULL,
  status            VARCHAR(50)  DEFAULT 'OPEN',
  registered_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence (
  id           UUID         PRIMARY KEY,
  fir_id       UUID         REFERENCES fir(id) NOT NULL,
  filename     VARCHAR(255) NOT NULL,
  bucket_name  VARCHAR(100) NOT NULL,
  object_key   VARCHAR(500) NOT NULL,
  sha256_hash  VARCHAR(64)  NOT NULL,
  uploaded_by  UUID,
  uploaded_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL       PRIMARY KEY,
  evidence_id  UUID         REFERENCES evidence(id),
  action       VARCHAR(50),
  result       VARCHAR(20),
  actor_id     UUID,
  checked_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_audit_log (
  id           SERIAL PRIMARY KEY,
  user_id      UUID,
  method       VARCHAR(10) NOT NULL,
  endpoint     VARCHAR(255) NOT NULL,
  ip_address   VARCHAR(45) NOT NULL,
  status_code  INT NOT NULL,
  accessed_at  TIMESTAMPTZ DEFAULT NOW()
);
