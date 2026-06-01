# SHIELD — Frontend UI Client (`shield-frontend`)

The **SHIELD Frontend** is a modern, responsive web application serving as the primary user interface for law enforcement officials and judicial authorities. Built with **React** and bundled via **Vite**, it features secure logins, real-time telemetry dashboards, case creation forms, drag-and-drop evidence uploads, and immediate cryptographic verification reports.

## 🛠️ Tech Stack & Dependencies

- **Framework**: React 18
- **Build System**: Vite (high-performance development server and bundler)
- **Styling**: Modern, responsive Custom CSS with dark mode palettes, gradients, and micro-animations.
- **Routing**: React Router DOM (v6)
- **Icons**: Lucide React
- **File Upload**: React Dropzone
- **HTTP Client**: Axios

## 📁 Key Files & Structure

- `index.html`: Shell page.
- `vite.config.js`: Vite configuration and proxy configurations.
- `src/main.jsx`: React engine initialization.
- `src/App.jsx`: Global routes, layouts, and auth state.
- `src/index.css`: Global styling tokens, gradients, animations, and typography.
- `src/pages/`: Page components:
  - `Login.jsx`: Secure login page with role selectors.
  - `Dashboard.jsx`: Telemetry dashboard with live evidence statistics.
  - `FirList.jsx`: Searchable list of all First Information Reports (FIRs).
  - `FirDetails.jsx`: Detailed case review page with case timeline, linked evidence, and drag-and-drop upload.
  - `VerifyEvidence.jsx`: Interactive cryptographic proof tool.
  - `AuditLog.jsx`: Immutable transaction auditing console (Judicial Only).

## 🚀 Running Locally

Ensure that the SHIELD cluster is running (the API gateway runs on port `3001`).

```bash
# Navigate into frontend
cd shield-frontend

# Install dependencies
npm install

# Run the dev server
npm run dev
```

The frontend will boot on `http://localhost:3000`. Hot-reloading is configured by default.

## ⚙️ Configuration (Environment Variables)

The frontend dev server and production builder are configured via environment variables:

| Variable | Description | Default |
|---|---|---|
| `VITE_GATEWAY_URL` | The URL of the API Gateway BFF (browser-accessible target) | `http://localhost:3001` |
