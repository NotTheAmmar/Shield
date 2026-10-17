# SHIELD Frontend API Contract

> **Purpose**: This document defines every HTTP endpoint the `shield-frontend` calls through `shield-gateway`. It is the specification that all backend modules (`shield-auth`, `shield-evidence`, `shield-ledger`) must implement.
>
> All requests are routed through the **API Gateway** at `http://localhost:3001`. The gateway is responsible for forwarding to the correct microservice.
>
> **Auth**: Every protected route requires a `Authorization: Bearer <JWT>` header. The JWT payload contains `{ userId, name, email, role, employeeId }`.

---

## Base URL

```text
http://localhost:3001/api
```

---

## 1. Authentication  →  `shield-auth`

### `POST /api/auth/login`

Authenticate a user and receive a JWT.

#### Request Body

```json
{
  "email": "officer@police.gov.in",
  "password": "••••••••",
  "role": "police_officer"   // "police_officer" | "forensic_expert" | "judicial_magistrate" | "sessions_judge" | "advocate" | "admin" | "judicial_authority"
}
```

**Success `200`**

```json
{
  "token": "<jwt_string>",
  "user": {
    "id": "usr_abc123",
    "name": "Rajesh Kumar",
    "email": "officer@police.gov.in",
    "role": "police_officer",
    "employeeId": "MH/INS/2041",
    "designation": "Inspector",
    "station": "Andheri PS",
    "assignedPoliceStations": [],
    "fslJurisdictionId": null,
    "sessionsCourtId": null,
    "barEnrollmentNo": null,
    "blockchainAddress": "0x71C...49A",
    "mustChangePassword": false
  }
}
```

**Error `401`**

```json
{ "error": "Invalid credentials" }
```

**Error `403`**

```json
{ "error": "Account is deactivated" }
```

---

### `POST /api/auth/logout`

Invalidate the session server-side (blocklist the JWT).

**Headers**: `Authorization: Bearer <token>`

**Success `200`**

```json
{ "message": "Logged out successfully" }
```

---

### `POST /api/auth/change-password`

Change a user's password. Used primarily for the **mandatory first-login password change** flow. Requires an active HttpOnly session cookie (the user must be logged in).

**Headers**: `Cookie: shield_access_token=<token>`

#### Request Body

```json
{
  "currentPassword": "TemporaryP@ssword1",
  "newPassword":     "MyStr0ng#NewPass!"
}
```

**Success `200`**

```json
{ "message": "Password changed successfully.", "mustChangePassword": false }
```

**Error `400`** *(validation failure)*

```json
{ "error": "New password must be at least 8 characters." }
```

**Error `401`** *(wrong current password)*

```json
{ "error": "Current password is incorrect." }
```

> **First-login flow**: When an admin creates a new user, the `must_change_password` flag is set to `true` in the DB. The login response includes `mustChangePassword: true`, and the frontend gates the entire application behind `ForcePasswordChangePage` until the password is changed.

---

## 2. FIR Management  →  `shield-evidence` + `shield-ledger`

### `GET /api/firs`

List all FIRs. Supports filtering and pagination.

**Headers**: `Authorization: Bearer <token>`

#### Query Parameters

| Param       | Type     | Description                                         |
| ----------- | -------- | --------------------------------------------------- |
| `page`      | number   | Page number, default `1`                            |
| `limit`     | number   | Items per page, default `25`                        |
| `search`    | string   | Filter by FIR number (partial match)                |
| `dateFrom`  | ISO date | Filter upload date from                             |
| `dateTo`    | ISO date | Filter upload date to                               |
| `status`    | string   | `verified` \| `pending` \| `tampered`               |
| `sortBy`    | string   | Column to sort: `firNumber`, `uploadDate`, `status` |
| `sortOrder` | string   | `asc` \| `desc`                                     |

**Success `200`**

```json
{
  "data": [
    {
      "id": "fir_001",
      "firNumber": "FIR/2025/MH/0042",
      "incidentType": "Theft",
      "description": "Reported theft at...",
      "location": "Andheri West",
      "uploadDate": "2025-03-15T10:30:00Z",
      "evidenceCount": 3,
      "status": "OPEN"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 142,
    "totalPages": 6
  }
}
```

> **Note**: FIR records are metadata-only. File-related fields (`fileName`, `hash`, `fileSize`, `uploadedBy`) are not returned from the FIR list. Evidence files linked to a FIR are tracked separately via the evidence endpoints.

---

### `GET /api/firs/:id`

Get a single FIR by ID, including its linked evidence.

**Headers**: `Authorization: Bearer <token>`

**Success `200`**

```json
{
  "id": "fir_001",
  "firNumber": "FIR/2025/MH/0042",
  "incidentType": "Theft",
  "description": "Reported theft at...",
  "location": "Andheri West",
  "uploadDate": "2025-03-15T10:30:00Z",
  "status": "OPEN",
  "reportingOfficer": "usr_abc123",
  "linkedEvidence": [
    {
      "id": "ev_101",
      "fileName": "cctv_footage.mp4",
      "category": "video",
      "uploadDate": "2025-03-15T11:00:00Z",
      "hash": "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567",
      "status": "verified"
    }
  ]
}
```

> **Note**: FIR records are metadata-only. Fields like `fileName`, `hash`, `fileSize`, `fileUrl`, `mimeType`, `ledgerTxId`, and `ledgerTimestamp` are not applicable to FIR records. Evidence files linked to a FIR carry their own integrity records.
**Error `404`**

```json
{ "error": "FIR not found" }
```

---

### `POST /api/fir/create`

Upload and register a scanned physical FIR document with cryptographic SHA-256 seal and on-chain anchoring.

**Headers**: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`  
**Role**: `Police Officer`

#### Form Fields

| Field                | Type   | Description                                                                  |
| -------------------- | ------ | ---------------------------------------------------------------------------- |
| `firNumber`          | string | **Required**. E.g. `FIR/2026/MH/0214`                                        |
| `incidentDateTime`   | string | **Required**. ISO-8601 or datetime-local string                              |
| `applicableSections` | string | **Required**. Penal / statutory sections (e.g. `BNS Sec 303, IT Act Sec 66`) |
| `station`            | string | **Required**. Police station jurisdiction (e.g. `Kothrud PS`)                |
| `incidentType`       | string | Optional. Crime category (e.g. `Theft`, `Cybercrime`)                        |
| `location`           | string | Optional. Human-readable scene location or GPS coordinates                   |
| `description`        | string | Optional. Narrative summary of initial report                                |
| `file`               | File   | **Required**. Scanned physical FIR document (PDF, JPG, PNG)                  |

**Success `201`**

```json
{
  "status": "success",
  "fir_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "firNumber": "FIR/2026/MH/0214",
  "station": "Kothrud PS",
  "applicableSections": "BNS Sec 303, IT Act Sec 66",
  "sha256Hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "ledgerTxId": "0x4b7c...",
  "message": "FIR registered and immutably anchored successfully"
}
```

---

### FIR Immutability Freeze: `PUT /api/fir/:id` & `PATCH /api/fir/:id`

Core FIR records are legally immutable under Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023. Any attempt to modify or overwrite registered FIR narrative/fields is blocked.

**Response `405 Method Not Allowed`**

```json
{
  "error": "FIR Freeze Violation: Modification of registered FIR narrative or records is strictly prohibited under Bharatiya Nagarik Suraksha Sanhita (BNSS). All subsequent findings must be recorded via Section 193(9) BNSS supplementary reports.",
  "code": "FIR_IMMUTABILITY_FROZEN"
}
```

---

### `POST /api/fir/:id/supplementary`

Append a progressive case diary report to a registered FIR under Section 193(9) of the Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023.

**Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`  
**Role**: `Police Officer` (strictly scoped to assigned police station)

#### Request Body

```json
{
  "narrative": "Seized external hard drive from crime scene warehouse and forwarded to Regional FSL for extraction.",
  "discovered_items": "1x WD 2TB HDD (S/N WD-49210), 1x Airtel SIM Card",
  "fsl_notified": true
}
```

**Success `201`**

```json
{
  "status": "success",
  "message": "Supplementary Report #1 recorded under Section 193(9) BNSS",
  "data": {
    "id": "c1f7b605-72b2-4d1e-84bf-03fcfbd3ad4e",
    "firId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "reportNumber": 1,
    "narrative": "Seized external hard drive from crime scene warehouse and forwarded to Regional FSL for extraction.",
    "discoveredItems": "1x WD 2TB HDD (S/N WD-49210), 1x Airtel SIM Card",
    "fslNotified": true,
    "reportingOfficer": "7b822d32-e06e-49b4-b461-8cf9eb8c005b",
    "officerName": "Inspector Rajesh Kumar",
    "createdAt": "2026-10-17T14:30:00.000Z",
    "sha256Hash": "3b4f...a812",
    "ledgerTxId": "0x9d2a..."
  }
}
```

**Error `403` — Jurisdictional access denied**

```json
{
  "error": "Forbidden: Jurisdictional access denied for this police station.",
  "code": "JURISDICTION_ACCESS_DENIED"
}
```

---

### `GET /api/fir/:id/supplementary`

Retrieve the chronological, append-only investigation case diary entries for a specific FIR.

**Headers**: `Authorization: Bearer <token>`  
**Roles**: `Police Officer`, `Judicial Authority` (`Judicial Magistrate`, `Sessions Judge`), `Forensic Expert`, `Advocate`

**Success `200`**

```json
{
  "data": [
    {
      "id": "c1f7b605-72b2-4d1e-84bf-03fcfbd3ad4e",
      "firId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "reportNumber": 1,
      "narrative": "Initial crime scene inspection and CCTV DVR recovery.",
      "discoveredItems": "Hikvision CCTV DVR (SN: SN-DVR-2025-001)",
      "fslNotified": true,
      "reportingOfficer": "7b822d32-e06e-49b4-b461-8cf9eb8c005b",
      "officerName": "Inspector Rajesh Kumar",
      "createdAt": "2026-10-17T14:30:00.000Z",
      "sha256Hash": "3b4f...a812",
      "ledgerTxId": "0x9d2a..."
    }
  ],
  "count": 1
}
```

---

### `PATCH /api/fir/:id/close`

Close a FIR. **Constraint**: All evidence linked to the FIR must be verified (not tampered, not pending). Requires at least one evidence file.

**Headers**: `Authorization: Bearer <token>`  
**Required Role**: `Police Officer`

**Success `200`**

```json
{
  "message": "FIR closed successfully",
  "firNumber": "FIR/2025/MH/0042",
  "status": "CLOSED"
}
```

**Error `400` — Unverified evidence**

```json
{
  "error": "Cannot close FIR: All evidence must be verified first.",
  "unverifiedFiles": ["photo_scene.jpg"]
}
```

**Error `400` — Tampered evidence**

```json
{
  "error": "Cannot close FIR: Some evidence has been tampered with.",
  "tamperedFiles": ["cctv_footage.mp4"]
}
```

**Tampered `200`** *(hash mismatch)*

```json
{
  "id": "fir_001",
  "status": "tampered",
  "currentHash": "deadbeef...",
  "ledgerHash": "a1b2c3d4...",
  "match": false,
  "verifiedAt": "2025-03-18T14:25:00Z"
}
```

---

### `GET /api/fir/:id/download`

Stream the original uploaded FIR file.

**Headers**: `Authorization: Bearer <token>`

**Response**: Binary file stream with correct `Content-Type` header (redirects to a 30-second presigned MinIO URL).

---

## 3. Evidence Management  →  `shield-evidence` + `shield-ledger`

### `GET /api/evidence`

List all evidence files. Supports filtering and pagination.

**Headers**: `Authorization: Bearer <token>`

#### Query Parameters

| Param       | Type     | Description                                            |
| ----------- | -------- | ------------------------------------------------------ |
| `page`      | number   | Page number, default `1`                               |
| `limit`     | number   | Items per page, default `25`                           |
| `search`    | string   | Filter by file name or FIR number                      |
| `firId`     | string   | Filter by linked FIR ID                                |
| `category`  | string   | `photo` \| `video` \| `audio` \| `document` \| `other` |
| `status`    | string   | `verified` \| `pending` \| `tampered`                  |
| `dateFrom`  | ISO date | Upload date from                                       |
| `dateTo`    | ISO date | Upload date to                                         |
| `sortBy`    | string   | `fileName`, `uploadDate`, `category`, `status`         |
| `sortOrder` | string   | `asc` \| `desc`                                        |

**Success `200`**

```json
{
  "data": [
    {
      "id": "ev_101",
      "fileName": "cctv_footage.mp4",
      "firId": "fir_001",
      "firNumber": "FIR/2025/MH/0042",
      "category": "video",
      "description": "CCTV footage from main gate",
      "fileSize": 104857600,
      "mimeType": "video/mp4",
      "uploadDate": "2025-03-15T11:00:00Z",
      "uploadedBy": {
        "id": "usr_abc123",
        "name": "Rajesh Kumar",
        "employeeId": "MH/INS/2041"
      },
      "hash": "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567",
      "status": "verified",
      "ledgerTxId": "tx_immu_0100",
      "ledgerTimestamp": "2025-03-15T11:00:08Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 89,
    "totalPages": 4
  }
}
```

---

### `GET /api/evidence/:id`

Get a single evidence item with full metadata.

**Headers**: `Authorization: Bearer <token>`

**Success `200`**

```json
{
  "id": "ev_101",
  "fileName": "cctv_footage.mp4",
  "firId": "fir_001",
  "firNumber": "FIR/2025/MH/0042",
  "category": "video",
  "description": "CCTV footage from main gate",
  "fileSize": 104857600,
  "mimeType": "video/mp4",
  "uploadDate": "2025-03-15T11:00:00Z",
  "uploadedBy": {
    "name": "Rajesh Kumar",
    "employeeId": "MH/INS/2041"
  },
  "hash": "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567",
  "status": "verified",
  "ledgerTxId": "tx_immu_0100",
  "ledgerTimestamp": "2025-03-15T11:00:08Z",
  "fileUrl": "/api/evidence/download/ev_101",
  "history": [
    { "action": "VERIFY", "result": "OK", "actor": "usr_abc123", "timestamp": "2025-03-18T14:25:00Z" }
  ]
}
```

> **Note**: `uploadedBy` is denormalized at upload time from the JWT token. `category` is now stored directly on the evidence table (not derived from the FIR's `case_category`). `status` is computed from the most recent audit_log entry.
```

---

### `POST /api/evidence/upload`

Upload one or more evidence files linked to a FIR.

**Headers**: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`

#### Form Fields

| Field         | Type   | Description                                                      |
| ------------- | ------ | ---------------------------------------------------------------- |
| `firId`       | string | Required. ID of the linked FIR                                   |
| `category`    | string | Required. `photo` \| `video` \| `audio` \| `document` \| `other` |
| `description` | string | Optional                                                         |
| `files`       | File[] | Required. One or more files (no size limit — backed by MinIO)    |

**Success `201`**

```json
{
  "id": "ev_102",
  "sha256_hash": "d4e5f6789012345678901234567890abcdef1234567890abcdef123456789",
  "ledgerTxId": "tx_immu_0101"
}
```

> **Note**: The upload response now returns `sha256_hash` (the computed hash) and `ledgerTxId`. The `category` is stored on the evidence record directly.
```

---

### `POST /api/evidence/:id/verify`

Re-run integrity check for an evidence file.

**Headers**: `Authorization: Bearer <token>`

**Success `200`** — same shape as `POST /api/firs/:id/verify`

---

### `GET /api/evidence/:id/download`

Stream the original evidence file.

**Headers**: `Authorization: Bearer <token>`

**Response**: Binary file stream with correct `Content-Type` header.

### `POST /api/evidence-source/:id/sign-digital`

Digitally sign a Section 63/65B Certificate via an HTML5 canvas signature.

**Headers**: `Authorization: Bearer <token>`
**Required Role**: `police_officer` (Part A) or `forensic_expert` (Part B)

**Request Body**:
```json
{
  "signatureBase64": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Success `200`**
```json
{
  "status": "COMPLETED",
  "message": "Certificate digitally signed and merged successfully"
}
```

---

## 4. Audit Log  →  `shield-gateway` (aggregates from all services)

### `GET /api/audit`

Return a chronological chain-of-custody log. Judicial role only.

**Headers**: `Authorization: Bearer <token>` *(role: `judicial_authority`)*

#### Query Parameters

| Param      | Type     | Description              |
| ---------- | -------- | ------------------------ |
| `page`     | number   | Default `1`              |
| `limit`    | number   | Default `50`             |
| `userId`   | string   | Filter by acting user ID |
| `action`   | string   | See action types below   |
| `targetId` | string   | FIR ID or Evidence ID    |
| `dateFrom` | ISO date |                          |
| `dateTo`   | ISO date |                          |

**Action Types**
`UPLOADED_FIR` | `UPLOADED_EVIDENCE` | `VERIFIED_FIR` | `VERIFIED_EVIDENCE` | `DOWNLOADED_FIR` | `DOWNLOADED_EVIDENCE` | `LOGIN` | `LOGOUT` | `USER_CREATED` | `USER_DEACTIVATED` | `USER_REACTIVATED`

**Success `200`**

```json
{
  "data": [
    {
      "id": "log_001",
      "timestamp": "2025-03-18T14:30:00Z",
      "user": {
        "id": "usr_abc123",
        "name": "Rajesh Kumar",
        "employeeId": "MH/INS/2041"
      },
      "role": "police_officer",
      "action": "UPLOADED_EVIDENCE",
      "targetType": "evidence",
      "targetId": "ev_102",
      "targetLabel": "photo_scene.jpg",
      "result": "success",
      "ipAddress": "10.0.0.5"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1024,
    "totalPages": 21
  }
}
```

---

## 5. User Management  →  `shield-auth`

### `GET /api/admin/users`

List all user accounts. Admin role only.

**Headers**: `Authorization: Bearer <token>` *(role: `admin`)*

#### Query Parameters

| Param    | Type   | Description                                         |
| -------- | ------ | --------------------------------------------------- |
| `page`   | number | Default `1`                                         |
| `limit`  | number | Default `25`                                        |
| `search` | string | Name or email partial match                         |
| `role`   | string | `police_officer` \| `judicial_authority` \| `admin` \| `forensic_expert` |
| `status` | string | `active` \| `deactivated`                           |

**Success `200`**

```json
{
  "data": [
    {
      "id": "usr_abc123",
      "name": "Rajesh Kumar",
      "email": "officer@police.gov.in",
      "role": "police_officer",
      "designation": "Inspector",
      "station": "Andheri PS",
      "employeeId": "MH/INS/2041",
      "status": "active",
      "createdAt": "2025-01-10T08:00:00Z",
      "lastLoginAt": "2025-03-18T09:15:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 38,
    "totalPages": 2
  }
}
```

---

### `POST /api/admin/users`

Create a new user account with cryptographic identity provisioning. Admin only. No self-registration.

**Headers**: `Authorization: Bearer <token>` *(role: `admin`)*

**Request Body**

```json
{
  "name": "Rajesh Kumar",
  "parentageName": "S/O Mahesh Kumar",
  "email": "rajesh@police.gov.in",
  "employeeId": "POL-84920",
  "role": "Police Officer",       // "Police Officer" | "Forensic Expert" | "Judicial Magistrate" | "Sessions Judge" | "Advocate" | "Admin"
  "plainPassword": "Sh!3ld@Pass1",
  "designation": "Inspector",
  "station": "Kothrud Police Station",            // For Police Officers
  "assignedPoliceStations": ["Kothrud PS"],       // For Judicial Magistrates
  "fslJurisdictionId": "FSL-MH-01",              // For Forensic Experts
  "sessionsCourtId": "DIST_COURT_01",             // For Sessions Judges
  "barEnrollmentNo": "MAH/1234/2020"              // For Advocates
}
```

**Success `201`**

```json
{
  "message": "User created successfully",
  "user": {
    "id": "usr_def456",
    "name": "Rajesh Kumar",
    "email": "rajesh@police.gov.in",
    "employee_id": "POL-84920",
    "role": "Police Officer",
    "designation": "Inspector",
    "station": "Kothrud Police Station",
    "assigned_police_stations": [],
    "fsl_jurisdiction_id": null,
    "sessions_court_id": null,
    "bar_enrollment_no": null,
    "blockchain_address": "0x71C...49A",
    "status": "active",
    "created_at": "2026-10-17T14:35:00Z"
  }
}
```

**Error `409`**

```json
{ "error": "User with this email or Employee ID already exists" }
```

---

### `PATCH /api/admin/users/:id`

Update user details, role assignments, or toggle active/deactivated status.

**Headers**: `Authorization: Bearer <token>` *(role: `admin`)*

**Request Body** *(all fields optional)*

```json
{
  "role": "Sessions Judge",
  "status": "deactivated",
  "designation": "Principal Sessions Judge",
  "station": "Pune Sessions Court",
  "sessionsCourtId": "DIST_COURT_01"
}
```
> **Note**: Users are never deleted from PostgreSQL to preserve complete chain-of-custody audit logs under BSA 2023.

**Success `200`**

```json
{
  "message": "User updated successfully",
  "user": {
    "id": "usr_def456",
    "name": "Rajesh Kumar",
    "status": "deactivated"
  }
}
```

---

### `GET /api/admin/system-health`

Inspects real-time container states, RPC latencies, and service metrics across all cluster microservices. Admin only.

**Headers**: `Authorization: Bearer <token>` *(role: `admin`)*

**Success `200`**

```json
{
  "overallStatus": "HEALTHY",
  "timestamp": "2026-10-17T18:00:00.000Z",
  "metrics": {
    "totalUsers": 12,
    "totalAuditEvents": 1420
  },
  "services": [
    { "name": "shield-auth", "role": "Authentication & Identity Microservice", "status": "ONLINE", "latencyMs": 1 },
    { "name": "db-users", "role": "PostgreSQL Relational & Audit Database", "status": "ONLINE", "latencyMs": 2 },
    { "name": "shield-evidence", "role": "Evidence Ingestion & MinIO Storage Pipeline", "status": "ONLINE", "latencyMs": 4 },
    { "name": "shield-ledger", "role": "EVM PoA Blockchain Smart Contract Gateway", "status": "ONLINE", "latencyMs": 3 },
    { "name": "shield-watchdog", "role": "Automated Background Integrity Scanner", "status": "ONLINE", "latencyMs": 5 }
  ]
}
```

---

### `GET /api/admin/audit-logs`

Query system-level access and audit logs. Admin only.

**Headers**: `Authorization: Bearer <token>` *(role: `admin`)*

#### Query Parameters

| Param | Type | Description |
| :--- | :--- | :--- |
| `search` | string | Search actor name, employee ID, or endpoint |
| `method` | string | Filter event type (`LOGIN`, `USER_CREATED`, `PASSWORD_RESET`, `WATCHDOG_ALERT`) |
| `page` | number | Page number (default: `1`) |
| `limit` | number | Records per page (default: `50`, max: `200`) |

**Success `200`**

```json
{
  "data": [
    {
      "id": 102,
      "user_name": "System Administrator",
      "user_role": "Admin",
      "user_employee_id": "EMP-00000",
      "method": "USER_CREATED",
      "endpoint": "/api/admin/users",
      "ip_address": "127.0.0.1",
      "status_code": 201,
      "target_label": "Created user: Rajesh Kumar (POL-84920) [Police Officer]",
      "accessed_at": "2026-10-17T17:50:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 }
}
```

---

### `GET /api/admin/watchdog-alerts`

Returns real-time security alerts triggered by the background watchdog daemon or tampering circuit breaker. Admin only.

**Headers**: `Authorization: Bearer <token>` *(role: `admin`)*

**Success `200`**

```json
{
  "alerts": [
    {
      "id": 84,
      "user_name": "SYSTEM_WATCHDOG",
      "method": "WATCHDOG_ALERT",
      "target_label": "Storage tampering detected: MinIO hash mismatch for evidence UUID",
      "accessed_at": "2026-10-17T12:00:00.000Z"
    }
  ]
}
```

---

### Zero-Trust Policy Enforcement (Admin Case Boundary)

To preserve admissibility under the **Bharatiya Sakshya Adhiniyam (BSA), 2023**, the System Administrator has zero access to legal case data:

* **Restricted Routes**:
  - `GET /api/fir/:id`
  - `GET /api/fir/:id/download`
  - `GET /api/evidence/:id`
  - `GET /api/evidence/download/:id`
  - `GET /api/evidence-source/:id/certificate`
  - `GET /api/reports/*`

When an Admin requests any of these endpoints, `shield-gateway` drops the request immediately:

**Error `403 Forbidden`**

```json
{
  "error": "Zero-Trust Policy Violation: Administrators are restricted exclusively to infrastructure and user onboarding. Direct access to criminal FIR narratives, evidence files, and certificates is strictly prohibited under legal chain of custody rules (Bharatiya Sakshya Adhiniyam, 2023).",
  "code": "ZERO_TRUST_RESTRICTION"
}
```

---

## 6. Dashboard Stats  →  `shield-gateway` (aggregated)

### `GET /api/dashboard/stats`

Returns role-appropriate summary statistics.

**Headers**: `Authorization: Bearer <token>`

**Success `200` — Police Officer**

```json
{
  "role": "police_officer",
  "stats": {
    "firsUploaded": 24,
    "evidenceFiles": 87,
    "verified": 79,
    "pendingVerification": 8
  },
  "recentActivity": [
    {
      "timestamp": "2025-03-18T14:30:00Z",
      "action": "UPLOADED_EVIDENCE",
      "targetLabel": "photo_scene.jpg",
      "result": "success"
    }
  ]
}
```

**Success `200` — Judicial Authority**

```json
{
  "role": "judicial_authority",
  "stats": {
    "totalFirs": 142,
    "totalEvidence": 890,
    "verifiedIntegrity": 880,
    "tamperAlerts": 2
  },
  "recentActivity": [ "..." ]
}
```

**Success `200` — Admin**

```json
{
  "role": "admin",
  "stats": {
    "totalUsers": 38,
    "activeUsers": 35,
    "deactivatedUsers": 3,
    "recentLogins": 12
  },
  "recentActivity": [ "..." ]
}
```

---

## Error Response Format (All Endpoints)

All errors follow this consistent shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": {}
}
```

| HTTP Status | Meaning                                               |
| ----------- | ----------------------------------------------------- |
| `400`       | Bad Request — validation failed                       |
| `401`       | Unauthorized — missing or invalid JWT                 |
| `403`       | Forbidden — valid JWT but insufficient role           |
| `404`       | Not Found                                             |
| `409`       | Conflict — duplicate resource                         |
| `413`       | Payload Too Large *(should not occur — MinIO backed)* |
| `500`       | Internal Server Error                                 |

---

## JWT Payload Structure

```json
{
  "userId": "usr_abc123",
  "name": "Rajesh Kumar",
  "email": "officer@police.gov.in",
  "role": "police_officer",
  "employeeId": "MH/INS/2041",
  "designation": "Inspector",
  "station": "Andheri PS",
  "iat": 1742300000,
  "exp": 1742386400
}
```

**Role values**: `police_officer` | `judicial_authority` | `admin` | `forensic_expert`

**Token expiry**: **15 minutes** (government/banking standard). Frontend clears token and redirects to `/login` on `401` from any endpoint *except* the login endpoint itself (which surfaces the error message in the UI instead).

---

## Environment Configuration

The frontend reads one environment variable:

| Variable           | Default                 | Description                 |
| ------------------ | ----------------------- | --------------------------- |
| `VITE_GATEWAY_URL` | `http://localhost:3001` | Base URL of the API Gateway |

Set in `shield-frontend/.env.local` for local dev. Docker Compose injects it via `environment:` at container startup.

---

## Role-Based UI Visibility

The frontend enforces role restrictions at two levels:

1. **Route level** (`ProtectedRoute`) — wrong-role users are redirected before the page renders.
2. **Component level** — individual UI elements are conditionally rendered based on `role` from `useAuth()`.

| Feature / UI Element                        | Police Officer | Forensic Expert | Judicial Authority | Admin |
| ------------------------------------------- | :------------: | :-------------: | :----------------: | :---: |
| Dashboard                                   |       ✅        |        ✅        |         ✅          |   ✅   |
| Upload FIR / Evidence                       |       ✅        |        ❌        |         ❌          |   ❌   |
| FIR Registry (browse)                       |       ✅        |        ✅        |         ✅          |   ❌   |
| FIR Detail — "Attach More Evidence" button  |       ✅        |        ❌        |         ❌          |   ❌   |
| FIR Detail — Re-Verify Integrity button     |       ✅        |        ✅        |         ✅          |   ❌   |
| Evidence Vault (browse)                     |       ✅        |        ✅        |         ✅          |   ❌   |
| Evidence Detail — Re-Verify button          |       ✅        |        ✅        |         ✅          |   ❌   |
| Evidence Detail — Digitally Sign Cert       |       ✅        |        ✅        |         ❌          |   ❌   |
| Evidence Detail — "View Audit Trail" button |       ❌        |        ❌        |         ✅          |   ❌   |
| Audit Log page                              |       ❌        |        ❌        |         ✅          |   ❌   |
| User Management                             |       ❌        |        ❌        |         ❌          |   ✅   |

---

## Development Credentials

> These are **mock credentials** valid while the gateway serves mock data. Replace when `shield-auth` is integrated.

| Email                        | Password          | Role               |
| ---------------------------- | ----------------- | ------------------ |
| `rajesh.kumar@police.gov.in` | `<Mock_Password>` | Police Officer     |
| `vikram.patil@police.gov.in` | `<Mock_Password>` | Police Officer     |
| `priya.nair@court.gov.in`    | `<Mock_Password>` | Judicial Authority |
| `suresh.mehta@court.gov.in`  | `<Mock_Password>` | Judicial Authority |
| `admin@shield.gov.in`        | `<Mock_Password>` | Administrator      |
