# SHIELD — Authentication Service (`shield-auth`)

The **Authentication Service** is a Node.js Express microservice responsible for user administration, role management, authentication, and token issuance. It acts as the gatekeeper for user roles and zero-trust validations across the SHIELD system.

## 🛠️ Tech Stack & Dependencies

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (relational store for users and sessions)
- **Security**: `bcrypt` (password hashing), `jsonwebtoken` (JWT token verification & signing), `cookie-parser` (for session storage support)

## 📁 Key Files & Structure

- `src/index.js`: Service entrypoint and port binding.
- `src/db.js`: Connection pool initialization for PostgreSQL.
- `src/migrate.js`: Auto-migrations that initialize the users table and seed the initial super administrator.
- `src/routes/`: Route definitions for user logins, user logs, registration, status updates.
- `src/middleware/`: JWT verification and role-based access controllers (RBAC).

## ⚙️ Configuration (Environment Variables)

This service is configured via environment variables injected through the docker composition layer:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Listening port for the HTTP server | `4000` |
| `DB_HOST` | Hostname of the PostgreSQL user database | `db-users` |
| `DB_USER` | PostgreSQL admin username | `shield` |
| `DB_PASSWORD` | PostgreSQL admin password | `secure_password` |
| `DB_NAME` | PostgreSQL relational database name | `shield` |
| `JWT_SECRET` | Secret key used to sign and verify user JWTs | `secret` |
| `ADMIN_SEED_EMAIL` | Default admin email to auto-seed on database migration | `admin@police.gov` |
| `ADMIN_SEED_PASSWORD`| Default admin password to auto-seed on database migration| `Sh13ld@Pr0duct10n2026!` |
| `ADMIN_SEED_NAME` | Default admin name to auto-seed on database migration | `System Administrator` |
| `ADMIN_SEED_EMPLOYEE_ID`| Default admin employee ID to auto-seed on database migration| `EMP-00000` |

## 🚀 API Endpoints & Routes

All routes are exposed through the API Gateway, but bind locally to port `4000`:

### Auth Routing (`/api/auth`)
- **`POST /login`**: Validate credentials (`email`, `password`, `role`) and issue short-lived JWT.
- **`POST /logout`**: Invalidate user session and clear access credentials.

### Administrative Routing (`/api/admin`)
- **`GET /users`**: List all registered users (Admin Only).
- **`POST /users`**: Register a new police officer or judicial authority (Admin Only).
- **`PATCH /users/:id`**: Update user status (e.g. `active`, `deactivated`) (Admin Only).
