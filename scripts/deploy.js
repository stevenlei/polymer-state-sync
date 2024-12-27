require("dotenv").config();
const hre = require("hardhat");
const chalk = require("chalk");

async function main() {
  // Get the network name from Hardhat's config
  const networkName = hre.network.name;
  const chainId = hre.network.config.chainId;
  console.log(
    chalk.blue(
      `🌐 Deploying to network: ${chalk.bold(networkName)} (${chainId})`
    )
  );

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

  console.log(chalk.yellow("📄 Deploying CrossChainStore..."));
  const CrossChainStore = await hre.ethers.getContractFactory(
    "CrossChainStore"
  );
  const store = await CrossChainStore.deploy(polymerProverAddress);
  await store.waitForDeployment();

  const address = await store.getAddress();
  console.log(
    chalk.green(`✅ CrossChainStore deployed to: ${chalk.bold(address)}`)
  );

  // Wait for a few block confirmations
  console.log(chalk.yellow("⏳ Waiting for confirmations..."));
  await store.deploymentTransaction().wait(5);
  console.log(chalk.green("🎉 Deployment confirmed!"));

  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red("❌ Error:"), error);
    process.exit(1);
  });
