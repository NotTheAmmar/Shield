/**
 * SHIELD — Hardhat Deploy Script for ShieldLedger
 *
 * Deploys the ShieldLedger smart contract to the target network and prints
 * the deployed contract address to stdout so CI can capture it.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localnet   (Docker PoA chain)
 *   npx hardhat run scripts/deploy.js --network hardhat     (in-memory, for testing)
 */

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ShieldLedger with account:", deployer.address);

  const ShieldLedger = await ethers.getContractFactory("ShieldLedger");
  const contract = await ShieldLedger.deploy();

  // ethers v6: deploymentTransaction().wait() ensures the contract is mined
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  console.log("ShieldLedger deployed to:", deployedAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
