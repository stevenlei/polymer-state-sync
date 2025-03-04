/**
 * Polymer Block Confirmations Test
 * ===============================
 * Tests proof generation with specified block confirmations
 * 
 * Usage: node scripts/quickConfirmations.js
 */

const axios = require("axios");
const chalk = require("chalk");
const inquirer = require("inquirer");
const { ethers } = require("ethers");
require("dotenv").config();
const { CHAINS } = require("../config/chains");

const POLYMER_API_URL = "https://proof.testnet.polymer.zone/";
const BASE_CHAIN_ID = 84532;  // Base Sepolia

async function testApiCall(description, requestData) {
    console.log(chalk.yellow(`\n🧪 Testing: ${description}`));
    console.log(chalk.gray("Request:"), JSON.stringify(requestData, null, 2));
    
    try {
        const response = await axios.post(
            POLYMER_API_URL,
            requestData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.POLYMER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(chalk.green("✅ Success:"));
        console.log(chalk.gray("Response:"), response.data);
        return response.data;
    } catch (error) {
        console.log(chalk.red("❌ Error:"));
        console.log(chalk.cyan(">  Status:"), error.response?.status);
        console.log(chalk.cyan(">  Error:"), error.response?.data);
        return null;
    }
}

async function findBlockWithReceipts(provider, startBlock) {
    console.log(chalk.yellow("\n🔍 Searching for a block with receipts..."));
    let currentBlock = startBlock;
    const maxAttempts = 10; // Try up to 10 blocks
    
    for (let i = 0; i < maxAttempts; i++) {
        console.log(chalk.gray(`>  Checking block ${currentBlock}...`));
        const block = await provider.getBlock(currentBlock, true);
        
        if (block.transactions.length >= 2) {
            // Get the second transaction
            const txHash = block.transactions[1];
            const receipt = await provider.getTransactionReceipt(txHash);
            
            if (receipt && receipt.logs.length > 0) {
                console.log(chalk.green("✅ Found suitable block:"));
                console.log(chalk.cyan(">  Block Number:"), currentBlock);
                console.log(chalk.cyan(">  Transaction Count:"), block.transactions.length);
                console.log(chalk.cyan(">  Logs in TX[1]:"), receipt.logs.length);
                return {
                    blockNumber: currentBlock,
                    txIndex: 1,
                    logIndex: 0
                };
            }
        }
        
        currentBlock--;
        console.log(chalk.gray(">  No suitable receipts, trying previous block..."));
    }
    
    throw new Error("Could not find a block with sufficient receipts and logs");
}

async function main() {
    // Get chain ID and block confirmations from user
    const { chainId, confirmations } = await inquirer.prompt([
        {
            type: 'input',
            name: 'chainId',
            message: 'Enter chain ID (e.g., 84532 for Base Sepolia):',
            default: '84532',
            validate: (input) => {
                const num = parseInt(input);
                if (isNaN(num) || num <= 0) {
                    return 'Please enter a valid chain ID';
                }
                return true;
            },
            filter: (input) => parseInt(input)
        },
        {
            type: 'input',
            name: 'confirmations',
            message: 'Enter number of block confirmations:',
            default: '5',
            validate: (input) => {
                const num = parseInt(input);
                if (isNaN(num) || num <= 0) {
                    return 'Please enter a positive number';
                }
                return true;
            },
            filter: (input) => parseInt(input)
        }
    ]);

    // Select RPC based on chain ID
    const chainConfig = Object.values(CHAINS).find(chain => chain.chainId === chainId);
    if (!chainConfig) {
        throw new Error(`Unsupported chain ID: ${chainId}. Supported chains: ${Object.values(CHAINS).map(c => `${c.name} (${c.chainId})`).join(', ')}`);
    }

    // Get latest block and calculate target block
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
    const latestBlock = await provider.getBlockNumber();
    const targetBlock = latestBlock - confirmations;

    console.log(chalk.cyan("\n>  Chain ID:"), chainId);
    console.log(chalk.cyan(">  Latest Block:"), latestBlock);
    console.log(chalk.cyan(">  Target Block:"), targetBlock);
    console.log(chalk.cyan(">  Confirmations:"), confirmations);

    // Find suitable block
    const { blockNumber, txIndex, logIndex } = await findBlockWithReceipts(provider, targetBlock);

    // Request proof with validated indices
    try {
        const response = await testApiCall("Proof with Confirmations", {
            jsonrpc: "2.0",
            id: 1,
            method: "log_requestProof",
            params: [
                chainId,
                blockNumber,
                txIndex,
                logIndex
            ]
        });

        const jobId = response?.result;
        if (jobId) {
            console.log(chalk.yellow("\n🔍 Got job ID:", jobId));
            
            // Poll for result
            console.log(chalk.yellow("\n🔍 Polling proof status for 1 minute..."));
            const startTime = Date.now();
            const timeoutMs = 60 * 1000;  // 1 minute timeout
            
            // First poll after 2 seconds
            console.log(chalk.gray("\n>  Waiting initial 2 seconds..."));
            await new Promise(resolve => setTimeout(resolve, 2000));

            while (Date.now() - startTime < timeoutMs) {
                console.log(chalk.gray("\n>  Checking status..."));
                const statusResponse = await testApiCall(`Query Proof Status for Job ${jobId}`, {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "log_queryProof",
                    params: [jobId]
                });

                if (statusResponse?.result?.status === 'error') {
                    console.log(chalk.red("\n❌ Proof Generation Failed:"));
                    console.log(chalk.cyan(">  Reason:"), statusResponse.result.failureReason);
                    const duration = (Date.now() - startTime) / 1000;
                    console.log(chalk.cyan(">  Time to Error:"), `${duration.toFixed(2)} seconds`);
                    break;
                }

                if (statusResponse?.result?.status === 'complete') {
                    console.log(chalk.green("\n✅ Proof Generation Successful!"));
                    console.log(chalk.cyan(">  Block Number:"), statusResponse.result.blockNumber);
                    console.log(chalk.cyan(">  Chain ID:"), statusResponse.result.chainId);
                    console.log(chalk.cyan(">  Receipt Index:"), statusResponse.result.receiptIndex);
                    console.log(chalk.cyan(">  Log Index:"), statusResponse.result.logIndex);
                    const duration = (Date.now() - startTime) / 1000;
                    console.log(chalk.cyan(">  Time to Complete:"), `${duration.toFixed(2)} seconds`);
                    break;
                }

                // Wait 1 second before next check
                console.log(chalk.gray(">  Waiting 1 second..."));
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } catch (error) {
        console.log(chalk.red("\n❌ Test failed"));
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(chalk.red("Error:"), error);
        process.exit(1);
    });