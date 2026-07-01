const { expect } = require("chai");
const { ethers }  = require("hardhat");

const VALID_HASH   = "a".repeat(64);

describe("EvidenceLedger", function () {
  let evidenceLedger;
  let owner;
  let otherAccount;

  beforeEach(async function () {
    [owner, otherAccount] = await ethers.getSigners();
    const EvidenceLedgerFactory = await ethers.getContractFactory("EvidenceLedger");
    evidenceLedger = await EvidenceLedgerFactory.deploy();
    
    const ANCHOR_ROLE = ethers.id("ANCHOR_ROLE");
    await evidenceLedger.grantRole(ANCHOR_ROLE, owner.address);
  });

  describe("Deployment", function () {
    it("should deploy successfully and set admin role to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      expect(await evidenceLedger.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("anchorEvidence", function () {
    it("should anchor valid evidence and emit EvidenceAnchored event", async function () {
      const evidenceId = "ev-uuid-001";
      const firId = "fir-uuid-001";

      await expect(evidenceLedger.anchorEvidence(evidenceId, firId, VALID_HASH))
        .to.emit(evidenceLedger, "EvidenceAnchored")
        .withArgs(evidenceId, firId, VALID_HASH, owner.address);
    });

    it("should retrieve correct data including firId after anchoring evidence", async function () {
      const evidenceId = "ev-uuid-002";
      const firId = "fir-uuid-002";
      await evidenceLedger.anchorEvidence(evidenceId, firId, VALID_HASH);

      const [sha256Hash, retrievedFirId, blockTimestamp, registeredBy] = await evidenceLedger.getEvidence(evidenceId);
      expect(sha256Hash).to.equal(VALID_HASH);
      expect(retrievedFirId).to.equal(firId);
      expect(blockTimestamp).to.be.gt(0n);
      expect(registeredBy).to.equal(owner.address);
    });
  });

  describe("Validation & Rejects", function () {
    it("should revert when evidenceId is empty", async function () {
      await expect(evidenceLedger.anchorEvidence("", "fir-id", VALID_HASH))
        .to.be.revertedWith("Evidence ID cannot be empty");
    });

    it("should revert when firId is empty in evidence", async function () {
      await expect(evidenceLedger.anchorEvidence("ev-id", "", VALID_HASH))
        .to.be.revertedWith("FIR ID cannot be empty");
    });

    it("should revert when hash is invalid", async function () {
      await expect(evidenceLedger.anchorEvidence("ev-id", "fir-id", "tooshort"))
        .to.be.revertedWith("Must be a valid 64-character SHA-256 hex string");
    });

    it("should revert when retrieving non-existent records", async function () {
      await expect(evidenceLedger.getEvidence("nonexistent")).to.be.revertedWith("Evidence record not found on ledger");
    });
  });
});
