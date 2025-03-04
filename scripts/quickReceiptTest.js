/**
 * Quick Receipt Test for StateSyncV2
 * =================================
 * 
 * Tests transaction receipt validation for the StateSyncV2 contract.
 * 
 * Setup:
 * ------
 * 1. Configure .env with contract addresses and RPC URLs
 * 2. Make sure networks are configured in hardhat.config.js
 * 
 * Usage:
 * ------
 * For Optimism Sepolia:
 * npx hardhat run scripts/quickReceiptTest.js --network optimismSepolia
 * 
 * For Base Sepolia:
 * npx hardhat run scripts/quickReceiptTest.js --network baseSepolia
 * 
 * Required Environment Variables:
 * -----------------------------
 * - OPTIMISM_SEPOLIA_CONTRACT_ADDRESS
 * - BASE_SEPOLIA_CONTRACT_ADDRESS
 */

const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
    console.log("Starting quick test for V2...");
    
    // Get contract address from .env based on network
    const networkName = hre.network.name;
    let contractAddress;
    
    if (networkName === 'optimismSepolia') {
        contractAddress = process.env.OPTIMISM_SEPOLIA_CONTRACT_ADDRESS;
    // } else if (networkName === 'baseSepolia') {
    //     contractAddress = process.env.BASE_SEPOLIA_CONTRACT_ADDRESS;
    } else {
        throw new Error(`Unsupported network: ${networkName}`);
    }

    if (!contractAddress) {
        throw new Error(`Contract address not found for network: ${networkName}`);
    }
    
    console.log(`Using contract address: ${contractAddress} on ${networkName}`);
    
    // Get contract
    const StateSyncV2 = await ethers.getContractFactory("StateSyncV2");
    const contract = await StateSyncV2.attach(contractAddress);
    
    console.log("Contract attached, sending test transaction...");
    
    // Send test transaction
    const tx = await contract.setValue("test-key", ethers.toUtf8Bytes("test-value"));
    console.log("Transaction sent:", tx.hash);
    
    // Wait for confirmation and print detailed receipt
    const provider = ethers.provider;  // Get provider from ethers
    const receipt = await provider.getTransactionReceipt(tx.hash);
    
    console.log("\nTransaction Receipt Details:");
    console.log("==========================");
    console.log("Transaction Hash:", receipt.hash);
    console.log("Block Number:", receipt.blockNumber);
    console.log("Receipt Index:", receipt.index);
    console.log("Gas Used:", receipt.gasUsed.toString());
    
    console.log("\nLogs:");
    receipt.logs.forEach((log, index) => {
        console.log(`\nLog[${index}]:`);
        console.log("  Address:", log.address);
        console.log("  Topics:");
        log.topics.forEach((topic, i) => {
            console.log(`    [${i}]: ${topic}`);
        });
        console.log("  Data:", log.data);
        console.log("  Log Index:", log.index);
        console.log("  Transaction Index:", log.transactionIndex);
        console.log("  Block Number:", log.blockNumber);
    });
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });