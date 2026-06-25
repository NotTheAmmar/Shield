#!/usr/bin/env bash
# ============================================================================
# SHIELD Blockchain Network Integration Tests
# ============================================================================
# Validates the live Docker blockchain infrastructure.
#
# Prerequisites:
#   1. Main app stack running:        docker compose up -d
#   2. Blockchain stack running:      docker compose -f docker-compose.blockchain.yml up -d
#   3. Contracts compiled:            npx hardhat compile
#
# Run: bash tests/blockchain/blockchain_network_test.sh
#   or: npm run test:blockchain
# ============================================================================

set -euo pipefail

# â”€â”€ Colours & helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PASS=0
FAIL=0
SKIP=0

pass() { echo -e "${GREEN}  âœ” PASS${RESET} â€” $1"; ((PASS++)) || true; }
fail() { echo -e "${RED}  âœ– FAIL${RESET} â€” $1"; ((FAIL++)) || true; }
skip() { echo -e "${YELLOW}  âŠ˜ SKIP${RESET} â€” $1"; ((SKIP++)) || true; }
section() { echo -e "\n${CYAN}${BOLD}â–¶ $1${RESET}"; }

rpc() {
  # $1 = port, $2 = method, $3 = params
  curl -s -X POST "http://localhost:$1" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$2\",\"params\":$3,\"id\":1}" \
    --max-time 5 2>/dev/null
}

echo ""
echo -e "${BOLD}â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${RESET}"
echo -e "${BOLD}â•‘  SHIELD Blockchain Network â€” Integration Tests   â•‘${RESET}"
echo -e "${BOLD}â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${RESET}"
echo ""

# â”€â”€ Section 1: Container Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
section "1. Container Health"

for container in blockchain-bootnode node-police node-court; do
  STATUS=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not-found")
  if [ "$STATUS" = "running" ]; then
    pass "Container '$container' is running"
  else
    fail "Container '$container' is not running (status: $STATUS)"
  fi
done

# â”€â”€ Section 2: RPC Responsiveness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
section "2. JSON-RPC Endpoints"

# Give nodes a moment if just started
sleep 2

POLICE_BLOCK=$(rpc 8545 "eth_blockNumber" "[]")
COURT_BLOCK=$(rpc  8546 "eth_blockNumber" "[]")

if echo "$POLICE_BLOCK" | grep -q '"result"'; then
  pass "node-police RPC (port 8545) is responding"
else
  fail "node-police RPC (port 8545) is not responding"
fi

if echo "$COURT_BLOCK" | grep -q '"result"'; then
  pass "node-court RPC (port 8546) is responding"
else
  fail "node-court RPC (port 8546) is not responding"
fi

# â”€â”€ Section 3: Chain ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
section "3. Chain Configuration"

POLICE_CHAIN=$(rpc 8545 "eth_chainId" "[]")
COURT_CHAIN=$(rpc  8546 "eth_chainId" "[]")

# Expected: 0x7a69 = 31337
if echo "$POLICE_CHAIN" | grep -q '"0x7a69"'; then
  pass "node-police chain ID is 31337 (0x7a69)"
else
  fail "node-police chain ID mismatch â€” got: $POLICE_CHAIN"
fi

if echo "$COURT_CHAIN" | grep -q '"0x7a69"'; then
  pass "node-court chain ID is 31337 (0x7a69)"
else
  fail "node-court chain ID mismatch â€” got: $COURT_CHAIN"
fi

# â”€â”€ Section 4: Peer Connectivity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
section "4. Peer Connectivity"

# Allow extra time for peer discovery via bootnode
echo "  Waiting 15s for peer discovery..."
sleep 15

POLICE_PEERS=$(rpc 8545 "net_peerCount" "[]")
COURT_PEERS=$(rpc  8546 "net_peerCount" "[]")

POLICE_PEER_COUNT=$(echo "$POLICE_PEERS" | grep -o '"0x[0-9a-f]*"' | tr -d '"' | head -1)
COURT_PEER_COUNT=$(echo "$COURT_PEERS"   | grep -o '"0x[0-9a-f]*"' | tr -d '"' | head -1)

POLICE_PEERS_DEC=$(printf '%d' "$POLICE_PEER_COUNT" 2>/dev/null || echo 0)
COURT_PEERS_DEC=$(printf '%d' "$COURT_PEER_COUNT" 2>/dev/null || echo 0)

if [ "$POLICE_PEERS_DEC" -ge 1 ] 2>/dev/null; then
  pass "node-police has $POLICE_PEERS_DEC peer(s)"
else
  fail "node-police has 0 peers â€” expected at least 1 (bootnode + court node)"
fi

if [ "$COURT_PEERS_DEC" -ge 1 ] 2>/dev/null; then
  pass "node-court has $COURT_PEERS_DEC peer(s)"
else
  fail "node-court has 0 peers â€” expected at least 1 (bootnode + police node)"
fi

# â”€â”€ Section 5: Block Production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
section "5. Block Sealing / Production"

BLOCK_BEFORE=$(rpc 8545 "eth_blockNumber" "[]" | grep -o '"0x[0-9a-f]*"' | tr -d '"' | head -1)
echo "  Current block: $BLOCK_BEFORE â€” waiting 12s for new blocks..."
sleep 12
BLOCK_AFTER=$(rpc 8545 "eth_blockNumber" "[]" | grep -o '"0x[0-9a-f]*"' | tr -d '"' | head -1)

BLOCK_BEFORE_DEC=$(printf '%d' "$BLOCK_BEFORE" 2>/dev/null || echo 0)
BLOCK_AFTER_DEC=$(printf '%d' "$BLOCK_AFTER" 2>/dev/null || echo 0)

if [ "$BLOCK_AFTER_DEC" -gt "$BLOCK_BEFORE_DEC" ] 2>/dev/null; then
  pass "Blocks are being sealed (went from $BLOCK_BEFORE_DEC to $BLOCK_AFTER_DEC)"
else
  fail "Block number did not increase (before: $BLOCK_BEFORE_DEC, after: $BLOCK_AFTER_DEC)"
fi

# â”€â”€ Section 6: Zero-Gas Transaction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
section "6. Zero-Gas Transaction"

POLICE_ADDR="0x80de6ef5a945d6cc1dad5375e3ced4df466e0384"
COURT_ADDR="0x01a08fc1e3c0eb8d2be2301ba36761485d1a2b4e"

# Send a zero-value, zero-gas-price transaction from police to court
TX_RESULT=$(rpc 8545 "eth_sendTransaction" "[{\"from\":\"$POLICE_ADDR\",\"to\":\"$COURT_ADDR\",\"value\":\"0x0\",\"gasPrice\":\"0x0\",\"gas\":\"0x5208\"}]")

if echo "$TX_RESULT" | grep -q '"0x'; then
  TX_HASH=$(echo "$TX_RESULT" | grep -o '"0x[0-9a-f]*"' | tr -d '"' | head -1)
  pass "Zero-gas transaction accepted by node-police (tx: ${TX_HASH:0:18}...)"

  # â”€â”€ Section 7: Cross-Node Propagation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  section "7. Cross-Node Transaction Propagation"
  echo "  Waiting 18s for transaction to be mined and propagated..."
  sleep 18

  TX_RECEIPT=$(rpc 8546 "eth_getTransactionReceipt" "[\"$TX_HASH\"]")
  if echo "$TX_RECEIPT" | grep -q '"status":"0x1"'; then
    pass "Transaction found on node-court with status success (0x1)"
  elif echo "$TX_RECEIPT" | grep -q '"result":null'; then
    fail "Transaction not yet visible on node-court (possible propagation delay)"
  else
    fail "Transaction receipt on node-court unexpected: $TX_RECEIPT"
  fi
else
  fail "Zero-gas transaction rejected: $TX_RESULT"
  skip "Cross-node propagation (depends on previous test)"
fi

# â”€â”€ Section 8: ABI File Integrity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
section "8. ABI Export Integrity"

ABI_FILE="./shield-ledger/src/abis/ShieldLedger.json"

if [ ! -f "$ABI_FILE" ]; then
  fail "ABI file not found at $ABI_FILE â€” run 'npx hardhat compile' first"
else
  # Check it is valid JSON
  if ! python3 -c "import json; json.load(open('$ABI_FILE'))" 2>/dev/null; then
    fail "ABI file at $ABI_FILE is not valid JSON"
  else
    # Check it contains the expected function signatures
    if grep -q '"anchorEvidence"' "$ABI_FILE" && grep -q '"getEvidence"' "$ABI_FILE"; then
      pass "ABI file exists and contains 'anchorEvidence' and 'getEvidence' signatures"
    else
      fail "ABI file is missing expected function signatures"
    fi
  fi
fi

# â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo ""
echo -e "${BOLD}â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”${RESET}"
echo -e "${BOLD}  Results: ${GREEN}${PASS} passed${RESET}  ${RED}${FAIL} failed${RESET}  ${YELLOW}${SKIP} skipped${RESET}"
echo -e "${BOLD}â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”${RESET}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
