/**
 * SHIELD — Hardhat Deploy Script for FIRLedger and EvidenceLedger
 *
 * Deploys the smart contracts to the target network and prints
 * the deployed contract addresses to stdout so CI can capture them.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localnet   (Docker PoA chain)
 *   npx hardhat run scripts/deploy.js --network hardhat     (in-memory, for testing)
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const FIRLedger = await ethers.getContractFactory("FIRLedger");
  const firContract = await FIRLedger.deploy();
  await firContract.waitForDeployment();
  console.log("FIRLedger deployed to:", await firContract.getAddress());

  const EvidenceLedger = await ethers.getContractFactory("EvidenceLedger");
  const evidenceContract = await EvidenceLedger.deploy();
  await evidenceContract.waitForDeployment();
  console.log("EvidenceLedger deployed to:", await evidenceContract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
