# SHIELD - Legal Compliance & Section 63 (65B) Implementation

This document provides a technical and legal breakdown of how the SHIELD system strictly complies with the **Bharatiya Sakshya Adhiniyam (BSA), 2023** (specifically Section 63, which replaces the former Section 65B of the Indian Evidence Act).

The core requirement of Section 63 is to prove the authenticity, integrity, and origin of digital electronic evidence submitted to a court of law. SHIELD automates this proof via a mathematically verifiable cryptographic circuit breaker and a dynamic PDF certificate generation engine.

---

## 1. The Two-Part Certificate Architecture

Under the BSA Schedule, the certificate must be signed by two individuals:
1. **Part A:** The Police Officer / Investigating Officer who extracted or seized the electronic record.
2. **Part B:** The Forensic Expert or Systems Administrator who manages the device or verifies the integrity of the hash.

### Dynamic PDF-Lib Stitching
Historically, software systems generated single, flat PDFs. SHIELD uses a dual-buffer pipeline via `pdf-lib` and `pdfkit`:
- The Police Officer manually signs the physical Part A document and snaps a photo or scan (Android `.jpg`, `.png`, or `.pdf`).
- The backend dynamically generates Part B and the Enclosed Hash Report entirely in memory.
- The pipeline scales and stitches the Police Officer's image onto an A4 PDF canvas and merges it with the system-generated Part B.

---

## 2. Closing the Legal "Blank Spaces"

If a defense attorney reviews a Section 63 certificate and finds empty fields or generic checkboxes, the evidence can be deemed inadmissible. We engineered the backend to dynamically inject verifiable truths into the document.

### A. Vector-Based Ascii Checkboxes
Checkbox alignment issues across different PDF readers have caused documents to be rejected. We replaced standard ASCII `[X]` strings with pure PDF vector graphics (`doc.rect().stroke()`). The "Device Type" (Mobile, Computer, Server) and "Ownership Status" are drawn dynamically with crossed intersection lines based on the `sourceData` payload.

### B. Expert Identity & "Place" Injection
The certificate explicitly injects the JWT-authenticated metadata of the Forensic Expert into the opening paragraph of Part B:
- `req.user.name`
- `req.user.parentage_name`
- `req.user.designation`
- `req.user.station` (mapped dynamically to the `Place:` declaration to establish jurisdictional authority).

### C. Device Chain of Custody (Section 63(3))
To satisfy Section 63(3) transparency requirements, the system requires an explicit `deviceChain` array during evidence upload (e.g., `UFED -> Desktop -> Cloud Bucket`). This array is recursively flattened and injected into the "Other Relevant Information" section of the certificate, closing the chain-of-custody loophole.

### D. 24-Hour Military Timestamping
All dates and times—specifically the Enclosed Hash Report's timestamp—are strictly coerced into 24-hour military format (`HH:mm:ss IST`) to prevent AM/PM ambiguity during cross-examination.

---

## 3. The Cryptographic Circuit Breaker (Tamper Lock)

A major flaw in traditional evidence lockers is the "Time of Check to Time of Use" (TOCTOU) vulnerability. An attacker might alter a file in the storage bucket *after* upload but *before* the Forensic Expert signs Part B.

To prevent this, SHIELD implements a strict **Cryptographic Circuit Breaker**:

1. **The Verification Trigger:** When the Forensic Expert clicks "Verify Integrity" on the dashboard, the API (`GET /api/evidence/verify/:id`) intercepts the request.
2. **Live Computation:** The backend streams the physical file from the MinIO bucket into memory and recalculates its SHA-256 hash.
3. **Ledger Consensus:** It queries the Ethereum Blockchain ledger for the original transaction hash.
4. **The Terminal Lock:** If the hashes mismatch (even by a single byte), the file is marked `TAMPERED`. The backend actively reaches up to the parent `evidence_source` batch and permanently updates its status to `FAILED_VERIFICATION`.
5. **The Guard Clause:** The `POST /upload-signed-certificate` endpoint possesses a strict database lock. If the batch is in `FAILED_VERIFICATION`, the API returns a `403 Forbidden`. The system mathematically guarantees that **no compromised file can ever be certified**.

---

## 4. Resource & Memory Protection

Due to the size of digital evidence (CCTV, disk images), the certificate generation and upload pipelines are protected against Denial of Service (DoS) and memory heap exhaustion:

- **Busboy Streaming:** File uploads utilize memory-safe `busboy` streams capped at 5MB for the certificate documents.
- **Express Rate Limiting:** 
  - `GET /certificate` generation is strictly limited to 100 requests per 15 minutes.
  - `POST /upload-signed-certificate` is capped at 50 requests per 15 minutes to prevent storage bucket flooding.
- **Regex Sanitization:** User-provided filenames are regex-scrubbed (`.replace(/[^\x20-\x7E]/g, '?')`) before injection into the Hash Report to prevent `WinAnsiEncoding` parsing crashes in PDFKit.
