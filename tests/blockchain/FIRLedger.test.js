const { expect } = require("chai");
const { ethers }  = require("hardhat");

const VALID_HASH   = "a".repeat(64);
const VALID_HASH_2 = "b".repeat(64);

describe("FIRLedger", function () {
  let firLedger;
  let owner;
  let otherAccount;

  beforeEach(async function () {
    [owner, otherAccount] = await ethers.getSigners();
    const FIRLedgerFactory = await ethers.getContractFactory("FIRLedger");
    firLedger = await FIRLedgerFactory.deploy();
    
    const ANCHOR_ROLE = ethers.id("ANCHOR_ROLE");
    await firLedger.grantRole(ANCHOR_ROLE, owner.address);
  });

  describe("Deployment", function () {
    it("should deploy successfully and set admin role to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      expect(await firLedger.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });
  });

  describe("anchorFIR", function () {
    it("should anchor valid FIR and emit FIRAnchored event", async function () {
      const firId = "fir-uuid-001";
      await expect(firLedger.anchorFIR(firId, VALID_HASH))
        .to.emit(firLedger, "FIRAnchored")
        .withArgs(firId, VALID_HASH, owner.address);
    });

    it("should retrieve correct data after anchoring FIR", async function () {
      const firId = "fir-uuid-002";
      await firLedger.anchorFIR(firId, VALID_HASH);

      const [sha256Hash, blockTimestamp, registeredBy] = await firLedger.getFIR(firId);
      expect(sha256Hash).to.equal(VALID_HASH);
      expect(blockTimestamp).to.be.gt(0n);
      expect(registeredBy).to.equal(owner.address);
    });

    it("should revert when anchoring the same FIR ID twice", async function () {
      const firId = "fir-uuid-003";
      await firLedger.anchorFIR(firId, VALID_HASH);
      await expect(firLedger.anchorFIR(firId, VALID_HASH_2))
        .to.be.revertedWith("FIR ID already anchored on ledger");
    });
  });

  describe("Validation & Rejects", function () {
    it("should revert when hash is invalid", async function () {
      await expect(firLedger.anchorFIR("fir-id", "tooshort"))
        .to.be.revertedWith("Must be a valid 64-character SHA-256 hex string");
    });

    it("should revert when retrieving non-existent records", async function () {
      await expect(firLedger.getFIR("nonexistent")).to.be.revertedWith("FIR record not found on ledger");
    });
  });
});
