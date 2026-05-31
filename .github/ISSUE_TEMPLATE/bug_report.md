---
name: "🐛 Bug Report"
about: "Report a software defect or security anomaly in the SHIELD system"
title: "[BUG] "
labels: ["bug"]
assignees: ""
---

## 🐛 Bug Description
<!-- A clear and concise description of what the bug is. -->

## 🚨 Impact & Security Assessment
* **Affected Service**: <!-- Select: shield-auth, shield-evidence, shield-gateway, shield-ledger, shield-watchdog, shield-frontend, shield-nginx -->
* **Zero-Trust Compromised?** <!-- Select: Yes / No (Does this allow privilege escalation or unauthorized data viewing?) -->
* **Integrity Ledger Status**: <!-- Select: OK / TAMPERED / FAILED_TO_CONNECT -->

## 🎬 How to Reproduce
Steps to reproduce the behavior:
1. Spin up the environment using `docker compose up`
2. Perform action: `...`
3. Send request or click: `...`
4. Encountered Error / Behavior: `...`

## 📋 Console Logs / Terminal Output
<!-- Copy and paste the standard output from the affected Docker container, or E2E testing logs here. -->
```bash
# Paste logs here
```

## 🎯 Expected Behavior
<!-- A clear and concise description of what you expected to happen. -->

## 💻 Environment Information
* **Operating System**: <!-- e.g., Ubuntu Linux 22.04, macOS Sonoma, Windows 11 -->
* **Docker Compose Version**: <!-- e.g., v2.24.0 -->
* **Node.js Version**: <!-- e.g., v20.11.0 -->
* **Web Browser (if frontend issue)**: <!-- e.g., Chrome v121, Safari v17 -->

## 🔍 Additional Context
<!-- Add any other context, screenshots, or network requests payload details here. -->
