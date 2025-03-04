require("dotenv").config();

// Chain configurations
const activatedChains = process.env.ACTIVATED_CHAINS
  ? process.env.ACTIVATED_CHAINS.split(",")
  : [];

if (activatedChains.length === 0) {
  console.error(
    "No chains are activated. Please set the ACTIVATED_CHAINS environment variable."
  );
  process.exit(1);
}

const CHAINS = {
  "optimism-sepolia": {
    name: "Optimism Sepolia",
    rpcUrl: process.env.OPTIMISM_SEPOLIA_RPC,
    contractAddress: process.env.OPTIMISM_SEPOLIA_CONTRACT_ADDRESS,
    chainId: 11155420,
  },
  "base-sepolia": {
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC,
    contractAddress: process.env.BASE_SEPOLIA_CONTRACT_ADDRESS,
    chainId: 84532,
  },
  "mode-sepolia": {
    name: "Mode Sepolia",
    rpcUrl: process.env.MODE_SEPOLIA_RPC,
    contractAddress: process.env.MODE_SEPOLIA_CONTRACT_ADDRESS,
    chainId: 919,
  },
  "bob-sepolia": {
    name: "Bob Sepolia",
    rpcUrl: process.env.BOB_SEPOLIA_RPC,
    contractAddress: process.env.BOB_SEPOLIA_CONTRACT_ADDRESS,
    chainId: 808813,
  },
  "ink-sepolia": {
    name: "Ink Sepolia",
    rpcUrl: process.env.INK_SEPOLIA_RPC,
    contractAddress: process.env.INK_SEPOLIA_CONTRACT_ADDRESS,
    chainId: 763373,
  },
  "unichain-sepolia": {
    name: "UniChain Sepolia",
    rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC,
    contractAddress: process.env.UNICHAIN_SEPOLIA_CONTRACT_ADDRESS,
    chainId: 1301,
  },
  "mantle-sepolia": {
    name: "Mantle Sepolia",
    rpcUrl: process.env.MANTLE_SEPOLIA_RPC,
    contractAddress: process.env.MANTLE_TESTNET_CONTRACT_ADDRESS,
    chainId: 5003,
  },
};

module.exports = {
  CHAINS: Object.fromEntries(
    Object.entries(CHAINS).filter(
      ([key]) => activatedChains.length === 0 || activatedChains.includes(key)
    )
  ),
  activatedChains,
};
