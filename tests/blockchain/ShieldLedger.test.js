/**
 * ShieldLedger Smart Contract Unit Tests
 *
 * Tests the ShieldLedger.sol contract logic in isolation using the built-in
 * Hardhat EVM. No Docker or external services required.
 *
 * Run: npx hardhat test
 *   or: npm run test:contract
 *
 */

const { expect } = require("chai");
const { ethers }  = require("hardhat");

const VALID_HASH   = "a".repeat(64);
const VALID_HASH_2 = "b".repeat(64);
const VALID_HASH_3 = "c".repeat(64);

describe("ShieldLedger", function () {
  let shieldLedger;
  let owner;
  let otherAccount;

  beforeEach(async function () {
    [owner, otherAccount] = await ethers.getSigners();
    const ShieldLedgerFactory = await ethers.getContractFactory("ShieldLedger");
    shieldLedger = await ShieldLedgerFactory.deploy();
    
    const ANCHOR_ROLE = ethers.id("ANCHOR_ROLE");
    await shieldLedger.grantRole(ANCHOR_ROLE, owner.address);
  });

  describe("Deployment", function () {
    it("should deploy successfully and set admin role to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      expect(await shieldLedger.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("anchorFIR", function () {
    it("should anchor valid FIR and emit FIRAnchored event", async function () {
      const firId = "fir-uuid-001";
      await expect(shieldLedger.anchorFIR(firId, VALID_HASH))
        .to.emit(shieldLedger, "FIRAnchored")
        .withArgs(firId, VALID_HASH, owner.address);
    });

    it("should retrieve correct data after anchoring FIR", async function () {
      const firId = "fir-uuid-002";
      await shieldLedger.anchorFIR(firId, VALID_HASH);

      const [sha256Hash, blockTimestamp, registeredBy] = await shieldLedger.getFIR(firId);
      expect(sha256Hash).to.equal(VALID_HASH);
      expect(blockTimestamp).to.be.gt(0n);
      expect(registeredBy).to.equal(owner.address);
    });

    it("should revert when anchoring the same FIR ID twice", async function () {
      const firId = "fir-uuid-003";
      await shieldLedger.anchorFIR(firId, VALID_HASH);
      await expect(shieldLedger.anchorFIR(firId, VALID_HASH_2))
        .to.be.revertedWith("FIR ID already anchored on ledger");
    });
  });

  describe("anchorEvidence", function () {
    it("should anchor valid evidence and emit EvidenceAnchored event", async function () {
      const evidenceId = "ev-uuid-001";
      const firId = "fir-uuid-001";

      await expect(shieldLedger.anchorEvidence(evidenceId, firId, VALID_HASH))
        .to.emit(shieldLedger, "EvidenceAnchored")
        .withArgs(evidenceId, firId, VALID_HASH, owner.address);
    });

    it("should retrieve correct data including firId after anchoring evidence", async function () {
      const evidenceId = "ev-uuid-002";
      const firId = "fir-uuid-002";
      await shieldLedger.anchorEvidence(evidenceId, firId, VALID_HASH);

      const [sha256Hash, retrievedFirId, blockTimestamp, registeredBy] = await shieldLedger.getEvidence(evidenceId);
      expect(sha256Hash).to.equal(VALID_HASH);
      expect(retrievedFirId).to.equal(firId);
      expect(blockTimestamp).to.be.gt(0n);
      expect(registeredBy).to.equal(owner.address);
    });
  });

  describe("Validation & Rejects", function () {
    it("should revert when evidenceId is empty", async function () {
      await expect(shieldLedger.anchorEvidence("", "fir-id", VALID_HASH))
        .to.be.revertedWith("Evidence ID cannot be empty");
    });

    it("should revert when firId is empty in evidence", async function () {
      await expect(shieldLedger.anchorEvidence("ev-id", "", VALID_HASH))
        .to.be.revertedWith("FIR ID cannot be empty");
    });

    it("should revert when hash is invalid", async function () {
      await expect(shieldLedger.anchorFIR("fir-id", "tooshort"))
        .to.be.revertedWith("Must be a valid 64-character SHA-256 hex string");
    });

    it("should revert when retrieving non-existent records", async function () {
      await expect(shieldLedger.getFIR("nonexistent")).to.be.revertedWith("FIR record not found on ledger");
      await expect(shieldLedger.getEvidence("nonexistent")).to.be.revertedWith("Evidence record not found on ledger");
    });
  });
});
