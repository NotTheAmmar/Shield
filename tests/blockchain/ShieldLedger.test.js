/**
 * ShieldLedger Smart Contract Unit Tests
 *
 * Tests the ShieldLedger.sol contract logic in isolation using the built-in
 * Hardhat EVM. No Docker or external services required.
 *
 * Run: npx hardhat test
 *   or: npm run test:contract
 *
 * Coverage:
 *  1. Contract deployment and ownership
 *  2. Anchoring valid evidence (happy path)
 *  3. Retrieving anchored evidence
 *  4. Rejecting duplicate evidence IDs
 *  5. Rejecting empty evidence ID
 *  6. Rejecting invalid SHA-256 hash length
 *  7. Rejecting retrieval of non-existent evidence
 *  8. Multiple independent evidence anchors do not interfere
 */

const { expect } = require("chai");
const { ethers }  = require("hardhat");

// A valid 64-character hex string representing a SHA-256 hash
const VALID_HASH   = "a".repeat(64);
const VALID_HASH_2 = "b".repeat(64);
const VALID_HASH_3 = "c".repeat(64);

describe("ShieldLedger", function () {
  let shieldLedger;
  let owner;
  let otherAccount;

  // Deploy a fresh contract instance before each test
  beforeEach(async function () {
    [owner, otherAccount] = await ethers.getSigners();
    const ShieldLedgerFactory = await ethers.getContractFactory("ShieldLedger");
    shieldLedger = await ShieldLedgerFactory.deploy();
    
    // Grant role so tests can anchor evidence
    const EVIDENCE_ANCHOR_ROLE = ethers.id("EVIDENCE_ANCHOR_ROLE");
    await shieldLedger.grantRole(EVIDENCE_ANCHOR_ROLE, owner.address);
  });

  // ── Test 1: Deployment ─────────────────────────────────────────────────
  describe("Deployment", function () {
    it("should deploy successfully and set admin role to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      expect(await shieldLedger.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });
  });

  // ── Test 2: Anchor valid evidence ──────────────────────────────────────
  describe("anchorEvidence", function () {
    it("should anchor valid evidence and emit EvidenceAnchored event", async function () {
      const evidenceId = "fir-uuid-001";

      await expect(shieldLedger.anchorEvidence(evidenceId, VALID_HASH))
        .to.emit(shieldLedger, "EvidenceAnchored")
        .withArgs(evidenceId, VALID_HASH, owner.address);
    });

    // ── Test 3: Retrieve anchored evidence ───────────────────────────────
    it("should retrieve correct data after anchoring", async function () {
      const evidenceId = "fir-uuid-002";
      await shieldLedger.anchorEvidence(evidenceId, VALID_HASH);

      const [sha256Hash, blockTimestamp, registeredBy] =
        await shieldLedger.getEvidence(evidenceId);

      expect(sha256Hash).to.equal(VALID_HASH);
      expect(blockTimestamp).to.be.gt(0n);
      expect(registeredBy).to.equal(owner.address);
    });

    // ── Test 4: Reject duplicate evidence ID ─────────────────────────────
    it("should revert when anchoring the same evidence ID twice", async function () {
      const evidenceId = "fir-uuid-003";
      await shieldLedger.anchorEvidence(evidenceId, VALID_HASH);

      await expect(shieldLedger.anchorEvidence(evidenceId, VALID_HASH_2))
        .to.be.revertedWith("Evidence ID already anchored on ledger");
    });

    // ── Test 5: Reject empty evidence ID ─────────────────────────────────
    it("should revert when evidenceId is an empty string", async function () {
      await expect(shieldLedger.anchorEvidence("", VALID_HASH))
        .to.be.revertedWith("Evidence ID cannot be empty");
    });

    // ── Test 6: Reject invalid hash length ───────────────────────────────
    it("should revert when sha256Hash is shorter than 64 characters", async function () {
      await expect(shieldLedger.anchorEvidence("fir-uuid-004", "tooshort"))
        .to.be.revertedWith("Must be a valid 64-character SHA-256 hex string");
    });

    it("should revert when sha256Hash is longer than 64 characters", async function () {
      const tooLongHash = "a".repeat(65);
      await expect(shieldLedger.anchorEvidence("fir-uuid-005", tooLongHash))
        .to.be.revertedWith("Must be a valid 64-character SHA-256 hex string");
    });

    // ── Test 7: Reject retrieval of non-existent evidence ────────────────
    it("should revert when retrieving a non-existent evidence ID", async function () {
      await expect(shieldLedger.getEvidence("nonexistent-uuid"))
        .to.be.revertedWith("Evidence record not found on ledger");
    });

    // ── Test 8: Multiple independent anchors ─────────────────────────────
    it("should store multiple distinct evidence records independently", async function () {
      const ids = ["fir-uuid-010", "fir-uuid-011", "fir-uuid-012"];
      const hashes = [VALID_HASH, VALID_HASH_2, VALID_HASH_3];

      // Anchor three different records
      for (let i = 0; i < ids.length; i++) {
        await shieldLedger.anchorEvidence(ids[i], hashes[i]);
      }

      // Verify each record is stored independently and correctly
      for (let i = 0; i < ids.length; i++) {
        const [sha256Hash, blockTimestamp, registeredBy] =
          await shieldLedger.getEvidence(ids[i]);

        expect(sha256Hash).to.equal(hashes[i],
          `Record ${ids[i]} should have hash ${hashes[i]}`);
        expect(blockTimestamp).to.be.gt(0n,
          `Record ${ids[i]} should have a valid timestamp`);
        expect(registeredBy).to.equal(owner.address,
          `Record ${ids[i]} should be registered by owner`);
      }
    });

    // ── Bonus: Different callers store with their own address ─────────────
    it("should record the correct signer address as registeredBy", async function () {
      const evidenceId = "fir-uuid-020";
      // Grant role to otherAccount
      const EVIDENCE_ANCHOR_ROLE = ethers.id("EVIDENCE_ANCHOR_ROLE");
      await shieldLedger.grantRole(EVIDENCE_ANCHOR_ROLE, otherAccount.address);
      
      // Submit from a non-owner account
      await shieldLedger.connect(otherAccount).anchorEvidence(evidenceId, VALID_HASH);

      const [, , registeredBy] = await shieldLedger.getEvidence(evidenceId);
      expect(registeredBy).to.equal(otherAccount.address);
    });
  });
});
