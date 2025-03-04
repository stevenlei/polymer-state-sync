require("dotenv").config();
const hre = require("hardhat");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");

async function main() {
  // Get the network name from Hardhat's config
  const networkName = hre.network.name;
  const chainId = hre.network.config.chainId;
  console.log(
    chalk.blue(
      `🌐 Deploying to network: ${chalk.bold(networkName)} (${chainId})`
    )
  );

  // Map network names to .env keys
  const networkToEnvKey = {
    optimismSepolia: "OPTIMISM_SEPOLIA_CONTRACT_ADDRESS",
    baseSepolia: "BASE_SEPOLIA_CONTRACT_ADDRESS",
    modeSepolia: "MODE_SEPOLIA_CONTRACT_ADDRESS",
    bobSepolia: "BOB_SEPOLIA_CONTRACT_ADDRESS",
    inkSepolia: "INK_SEPOLIA_CONTRACT_ADDRESS",
    unichainSepolia: "UNICHAIN_SEPOLIA_CONTRACT_ADDRESS",
  };

  // Get the Polymer Prover address based on the network
  let polymerProverAddress;
  if (chainId === 11155420) {
    // Optimism Sepolia
    polymerProverAddress =
      process.env.POLYMER_PROVER_OPTIMISM_TESTNET_CONTRACT_ADDRESS;
  } else if (chainId === 84532) {
    // Base Sepolia
    polymerProverAddress =
      process.env.POLYMER_PROVER_BASE_TESTNET_CONTRACT_ADDRESS;
  } else if (chainId === 919) {
    // Mode Sepolia
    polymerProverAddress =
      process.env.POLYMER_PROVER_MODE_TESTNET_CONTRACT_ADDRESS;
  } else if (chainId === 808813) {
    // Bob Sepolia
    polymerProverAddress =
      process.env.POLYMER_PROVER_BOB_TESTNET_CONTRACT_ADDRESS;
  } else if (chainId === 763373) {
    // Ink Sepolia
    polymerProverAddress =
      process.env.POLYMER_PROVER_INK_TESTNET_CONTRACT_ADDRESS;
  } else if (chainId === 1301) {
    // Unichain Sepolia
    polymerProverAddress =
      process.env.POLYMER_PROVER_UNICHAIN_TESTNET_CONTRACT_ADDRESS;
  } else {
    throw new Error("Unsupported network");
  }

  console.log(
    chalk.cyan(
      `🔗 Using Polymer Prover address: ${chalk.bold(polymerProverAddress)}`
    )
  );

  console.log(chalk.yellow("📄 Deploying StateSyncV2..."));
  const StateSync = await hre.ethers.getContractFactory("StateSyncV2");
  const store = await StateSync.deploy(polymerProverAddress);
  await store.waitForDeployment();

  const address = await store.getAddress();
  console.log(chalk.green(`✅ StateSync deployed to: ${chalk.bold(address)}`));

  // Wait for a few block confirmations
  console.log(chalk.yellow("⏳ Waiting for confirmations..."));
  await store.deploymentTransaction().wait(5);
  console.log(chalk.green("🎉 Deployment confirmed!"));

  // Update .env file
  const envKey = networkToEnvKey[networkName];
  if (envKey) {
    const envPath = path.join(__dirname, "../.env");
    let envContent = fs.readFileSync(envPath, "utf8");

    const envRegex = new RegExp(`${envKey}=.*`, "g");
    if (envContent.match(envRegex)) {
      // Update existing entry
      envContent = envContent.replace(envRegex, `${envKey}=${address}`);
    } else {
      // Add new entry
      envContent += `\n${envKey}=${address}`;
    }

    // Write updated content back to .env
    fs.writeFileSync(envPath, envContent);
    console.log(chalk.cyan(`📝 Updated ${envKey} in .env`));
  }

  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red("❌ Error:"), error);
    process.exit(1);
  });
