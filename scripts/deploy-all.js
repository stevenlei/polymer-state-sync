require("dotenv").config();
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

// Chain configurations
const activatedChains = process.env.ACTIVATED_CHAINS
  ? process.env.ACTIVATED_CHAINS.split(",")
  : [];

const CHAINS = [
  {
    name: "Optimism Sepolia",
    network: "optimismSepolia",
    envKey: "OPTIMISM_SEPOLIA_CONTRACT_ADDRESS",
    id: "optimism-sepolia",
  },
  {
    name: "Base Sepolia",
    network: "baseSepolia",
    envKey: "BASE_SEPOLIA_CONTRACT_ADDRESS",
    id: "base-sepolia",
  },
  {
    name: "Mode Sepolia",
    network: "modeSepolia",
    envKey: "MODE_SEPOLIA_CONTRACT_ADDRESS",
    id: "mode-sepolia",
  },
  {
    name: "Bob Sepolia",
    network: "bobSepolia",
    envKey: "BOB_SEPOLIA_CONTRACT_ADDRESS",
    id: "bob-sepolia",
  },
  {
    name: "Ink Sepolia",
    network: "inkSepolia",
    envKey: "INK_SEPOLIA_CONTRACT_ADDRESS",
    id: "ink-sepolia",
  },
  {
    name: "Unichain Sepolia",
    network: "unichainSepolia",
    envKey: "UNICHAIN_SEPOLIA_CONTRACT_ADDRESS",
    id: "unichain-sepolia",
  },
  {
    name: "Arbitrum Sepolia",
    network: "arbitrumSepolia",
    envKey: "ARBITRUM_SEPOLIA_CONTRACT_ADDRESS",
    id: "arbitrum-sepolia",
  },
  {
    name: "Everclear Sepolia",
    network: "everclearSepolia",
    envKey: "EVERCLEAR_SEPOLIA_CONTRACT_ADDRESS",
    id: "everclear-sepolia",
  },
  {
    name: "Mantle Sepolia",
    network: "mantleSepolia",
    envKey: "MANTLE_SEPOLIA_CONTRACT_ADDRESS",
    id: "mantle-sepolia",
  },
].filter((chain) => activatedChains.includes(chain.id));

async function main() {
  console.log(chalk.blue("🚀 Starting deployment to all chains..."));

  const envPath = path.join(__dirname, "../.env");
  let envContent = fs.readFileSync(envPath, "utf8");

  for (const chain of CHAINS) {
    try {
      console.log(
        chalk.yellow(`\n📄 Deploying to ${chalk.bold(chain.name)}...`)
      );

      // Run the deployment script using npx hardhat directly
      const output = execSync(
        `npx hardhat run scripts/deploy.js --network ${chain.network}`,
        {
          encoding: "utf8",
        }
      );

      // Extract the contract address from the output
      const addressMatch = output.match(
        /StateSync deployed to: (0x[0-9a-fA-F]{40})/
      );
      if (!addressMatch) {
        throw new Error(
          `Could not find contract address in output:\n${output}`
        );
      }

      const contractAddress = addressMatch[1];
      console.log(
        chalk.green(
          `✅ Deployed to ${chalk.bold(chain.name)}: ${chalk.bold(
            contractAddress
          )}`
        )
      );

      // Update .env file
      const envRegex = new RegExp(`${chain.envKey}=.*`, "g");
      if (envContent.match(envRegex)) {
        // Update existing entry
        envContent = envContent.replace(
          envRegex,
          `${chain.envKey}=${contractAddress}`
        );
      } else {
        // Add new entry
        envContent += `\n${chain.envKey}=${contractAddress}`;
      }

      // Write updated content back to .env
      fs.writeFileSync(envPath, envContent);
      console.log(chalk.cyan(`📝 Updated ${chain.envKey} in .env`));
    } catch (error) {
      console.error(
        chalk.red(`❌ Error deploying to ${chalk.bold(chain.name)}:`),
        error.message
      );
      // Continue with next chain even if this one fails
      continue;
    }
  }

  console.log(chalk.green("\n✅ Deployment to all chains completed!"));
  console.log(
    chalk.cyan("📝 Contract addresses have been updated in .env file")
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red("❌ Error:"), error);
    process.exit(1);
  });
