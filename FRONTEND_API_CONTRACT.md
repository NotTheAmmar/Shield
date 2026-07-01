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
  "role": "police_officer"   // "police_officer" | "judicial_authority" | "admin" | "forensic_expert"
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
    "station": "Andheri PS"
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

### `POST /api/firs/upload`

Upload a scanned FIR document.

**Headers**: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`

#### Form Fields

| Field       | Type   | Description                       |
| ----------- | ------ | --------------------------------- |
| `firNumber` | string | Required. E.g. `FIR/2025/MH/0042` |
| `file`      | File   | Required. PDF, JPG, or PNG scan   |

**Success `201`**

```json
{
  "status": "success",
  "fir_id": "fir_002",
  "firNumber": "FIR/2025/MH/0043",
  "message": "FIR registered successfully"
}
```

> **Note**: FIR files are now stored securely in MinIO, similar to Evidence files. Their hashes and metadata are recorded in the FIR table.
```

**Error `409`**

```json
{ "error": "FIR number already exists" }
```

---

### `POST /api/firs/:id/verify`

Re-run integrity check for a FIR against the ledger hash.

**Headers**: `Authorization: Bearer <token>`

**Success `200`**

```json
{
  "id": "fir_001",
  "status": "verified",
  "currentHash": "a1b2c3d4...",
  "ledgerHash": "a1b2c3d4...",
  "match": true,
  "verifiedAt": "2025-03-18T14:25:00Z"
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

Create a new user account. Admin only. No self-registration.

**Headers**: `Authorization: Bearer <token>` *(role: `admin`)*

**Request Body**

```json
{
  "name": "Priya Sharma",
  "email": "priya.sharma@court.gov.in",
  "role": "judicial_authority",
  "designation": "Additional Sessions Judge",
  "station": "Mumbai Sessions Court",
  "temporaryPassword": "Sh!3ld@2025"
}
```

**Success `201`**

```json
{
  "id": "usr_def456",
  "name": "Priya Sharma",
  "email": "priya.sharma@court.gov.in",
  "role": "judicial_authority",
  "designation": "Additional Sessions Judge",
  "station": "Mumbai Sessions Court",
  "status": "active",
  "createdAt": "2025-03-18T14:35:00Z",
  "mustChangePassword": true
}
```

**Error `409`**

```json
{ "error": "Email already registered" }
```

---

### `PATCH /api/admin/users/:id`

Update user details or toggle active/deactivated status.

**Headers**: `Authorization: Bearer <token>` *(role: `admin`)*

**Request Body** *(all fields optional)*

```json
{
  "name": "Priya Sharma",
  "designation": "Sessions Judge",
  "station": "Bombay High Court",
  "status": "deactivated"
}
```
> **Note**: No delete endpoint — users are only deactivated to preserve the audit trail integrity.

**Success `200`**

```json
{
  "id": "usr_def456",
  "name": "Priya Sharma",
  "status": "deactivated",
  "updatedAt": "2025-03-18T14:40:00Z"
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
