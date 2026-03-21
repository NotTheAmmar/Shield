-- Initialize auth tables if they do not exist

CREATE TABLE IF NOT EXISTS users (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  employee_id    VARCHAR(50)  UNIQUE NOT NULL,
  role           VARCHAR(50)  NOT NULL,
  status         VARCHAR(20)  DEFAULT 'active',
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);
