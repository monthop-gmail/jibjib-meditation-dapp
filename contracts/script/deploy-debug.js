const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "JBC");

  const MeditationReward = await hre.ethers.getContractFactory("MeditationReward");

  // Check bytecode before deploy
  const deployTxData = MeditationReward.bytecode;
  console.log("\n--- Pre-deploy checks ---");
  console.log("Bytecode length (hex chars):", deployTxData.length);
  console.log("Bytecode size (bytes):", (deployTxData.length - 2) / 2);

  // Check for key function selectors in bytecode
  // startMeditation() = 0x3e0a3228 (keccak256 first 4 bytes)
  // completeMeditation(address) = keccak256 first 4 bytes
  const selectors = {
    'startMeditation()': '3e0a3228',
    'name()': '06fdde03',
    'transfer(address,uint256)': 'a9059cbb',
  };
  for (const [fn, sel] of Object.entries(selectors)) {
    console.log(`  ${fn} (${sel}): ${deployTxData.includes(sel) ? 'FOUND' : 'NOT FOUND'}`);
  }

  // Estimate gas
  const estimated = await hre.ethers.provider.estimateGas({
    data: deployTxData,
    from: deployer.address,
  });
  console.log("\nEstimated gas:", estimated.toString());

  // Deploy with explicit high gas limit
  console.log("\nDeploying with gas limit:", (estimated * 2n).toString());
  const contract = await MeditationReward.deploy({
    gasLimit: estimated * 2n,
  });

  console.log("Deploy tx hash:", contract.deploymentTransaction().hash);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("Deployed to:", address);

  // Verify deployed bytecode
  const deployedCode = await hre.ethers.provider.getCode(address);
  console.log("\n--- Post-deploy checks ---");
  console.log("Deployed bytecode length:", deployedCode.length);
  console.log("Deployed bytecode size (bytes):", (deployedCode.length - 2) / 2);

  // Check function selectors in deployed code
  for (const [fn, sel] of Object.entries(selectors)) {
    console.log(`  ${fn} (${sel}): ${deployedCode.includes(sel) ? 'FOUND' : 'NOT FOUND'}`);
  }

  // Try calling getUserStats
  try {
    const c = MeditationReward.attach(address);
    const stats = await c.getUserStats(deployer.address);
    console.log("\ngetUserStats() works! Result:", stats.toString());
  } catch (e) {
    console.log("\ngetUserStats() FAILED:", e.message.substring(0, 200));
  }

  // Try calling name
  try {
    const c = MeditationReward.attach(address);
    const n = await c.name();
    console.log("name():", n);
  } catch (e) {
    console.log("name() FAILED:", e.message.substring(0, 200));
  }

  console.log("\nExplorer: https://exp-l1.jibchain.net/address/" + address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
