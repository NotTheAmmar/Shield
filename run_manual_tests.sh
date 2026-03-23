#!/bin/bash
echo "🛡️ Starting SHIELD Backend Master Evaluation Suite (Bash/cURL)..."

echo "TEST SECRET EVIDENCE PAYLOAD" > test_evidence.txt

# Step 1
echo -en "\n[1] Testing Auth Service: Super Admin Login... "
O1=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@police.gov","password":"Sh13ld@Pr0duct10n2026!","role":"Super Admin"}')
BODY=$(echo "$O1" | sed '$d')
ADMIN_TOKEN=$(echo "$BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
if [ -z "$ADMIN_TOKEN" ]; then echo "❌ FAILED: $BODY"; exit 1; else echo "✅ JWT Issued"; fi

# Step 2
echo -en "[2] Testing Admin Service: Create Police Officer... "
# Use unique email logic precisely
O2=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/admin/users -H "Content-Type: application/json" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"name": "Detective Test","email": "test_'"$(date +%s)"'@police.gov","employeeId": "EMP-'"$(date +%s)"'","role": "Police Officer","plainPassword": "SecurePassword123!"}')
BODY2=$(echo "$O2" | sed '$d')
OFFICER_EMAIL=$(echo "$BODY2" | grep -o '"email":"[^"]*' | cut -d'"' -f4)
if [ -z "$OFFICER_EMAIL" ]; then echo "❌ FAILED: $BODY2"; exit 1; else echo "✅ User Created: $OFFICER_EMAIL"; fi

# Step 3
echo -en "[3] Testing Auth Service: Login as Officer... "
O3=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"'"$OFFICER_EMAIL"'","password":"SecurePassword123!","role":"Police Officer"}')
BODY3=$(echo "$O3" | sed '$d')
OFFICER_TOKEN=$(echo "$BODY3" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
if [ -z "$OFFICER_TOKEN" ]; then echo "❌ FAILED: $BODY3"; exit 1; else echo "✅ Officer JWT Issued"; fi

# Step 4
echo -en "[4] Testing FIR Service: Create FIR... "
O4=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/fir/create -H "Authorization: Bearer $OFFICER_TOKEN" -F "firNumber=FIR/2026/TEST/$(date +%s)" -F "case_category=Theft" -F "description=Evidence testing FIR" -F "location=Test HQ")
BODY4=$(echo "$O4" | sed '$d')
FIR_ID=$(echo "$BODY4" | grep -o '"fir_id":"[^"]*' | cut -d'"' -f4)
if [ -z "$FIR_ID" ]; then echo "❌ FAILED: $BODY4"; exit 1; else echo "✅ FIR Created: $FIR_ID"; fi

# Step 5
echo -en "[5] Testing Evidence Service: Upload Evidence... "
O5=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/evidence/upload -H "Authorization: Bearer $OFFICER_TOKEN" -F "fir_id=$FIR_ID" -F "file=@test_evidence.txt")
BODY5=$(echo "$O5" | sed '$d')
EVIDENCE_ID=$(echo "$BODY5" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
if [ -z "$EVIDENCE_ID" ]; then echo "❌ FAILED: $BODY5"; exit 1; else echo "✅ Uploaded! ID: $EVIDENCE_ID"; fi

# Step 6
echo -en "[6] Testing Security: Cryptographic Verification... "
O6=$(curl -s -w "\n%{http_code}" -X GET http://localhost:3001/api/evidence/verify/$EVIDENCE_ID -H "Authorization: Bearer $ADMIN_TOKEN")
BODY6=$(echo "$O6" | sed '$d')
STATUS=$(echo "$BODY6" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
if [ "$STATUS" != "OK" ]; then echo "❌ FAILED: $BODY6"; exit 1; else echo "✅ Hash Match ImmuDB vs MinIO = 1.0 (OK)"; fi

# Step 7
echo -en "[7] Testing Telemetry: Dashboard Stats... "
O7=$(curl -s -w "\n%{http_code}" -X GET http://localhost:3001/api/dashboard/stats -H "Authorization: Bearer $ADMIN_TOKEN")
BODY7=$(echo "$O7" | sed '$d')
TOTAL_EVIDENCE=$(echo "$BODY7" | grep -o '"totalEvidence":[0-9]*' | cut -d ':' -f2)
if [ -z "$TOTAL_EVIDENCE" ]; then echo "❌ FAILED: $BODY7"; exit 1; else echo "✅ Stats Active. Total Evidence: $TOTAL_EVIDENCE"; fi

echo -e "\n🎉 ALL TESTS PASSED SUCCESSFULLY!"
