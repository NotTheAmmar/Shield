const ethers = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const signer = await provider.getSigner("0x80de6eF5a945D6Cc1DAd5375E3CeD4DF466e0384");
    
    const artifactPath = path.join(__dirname, "../artifacts/contracts/ShieldLedger.sol/ShieldLedger.json");
    const contractJson = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    
    const factory = new ethers.ContractFactory(contractJson.abi, contractJson.bytecode, signer);
    
    console.log("Deploying contract...");
    const contract = await factory.deploy({ gasPrice: 0 });
    
    await contract.waitForDeployment();
    console.log("ShieldLedger deployed to:", await contract.getAddress());
}

main().catch(console.error);
