/**
 * Polymer API Test Script
 * ======================
 * 
 * This script tests the Polymer API by requesting and validating proofs for events
 * from different source chains.
 * 
 * Usage:
 * ------
 * # Test with Optimism Sepolia (default)
 * npx hardhat run scripts/quickApiTestV2.js
 * 
 * # Test with specific chain
 * TEST_CHAIN=optimism-sepolia npx hardhat run scripts/quickApiTestV2.js
 * TEST_CHAIN=base-sepolia npx hardhat run scripts/quickApiTestV2.js
 * TEST_CHAIN=mantle-testnet npx hardhat run scripts/quickApiTestV2.js
 * 
 * Available Chains:
 * ---------------
 * - optimism-sepolia
 * - base-sepolia
 * - mantle-testnet
 * - mode-sepolia
 * - bob-sepolia
 * - ink-sepolia
 * - unichain-sepolia
 */

const { ethers } = require("hardhat");
const axios = require("axios");
const chalk = require("chalk");
const { CHAINS } = require("../config/chains");

// Get chain from environment variable, default to optimism-sepolia if none provided
const chainArg = process.env.TEST_CHAIN || "optimism-sepolia";
if (!CHAINS[chainArg]) {
    console.error(chalk.red(`\n❌ Invalid chain: ${chainArg}`));
    console.log(chalk.yellow('\nAvailable chains:'));
    Object.keys(CHAINS).forEach(chain => {
        console.log(`- ${chain}`);
    });
    process.exit(1);
}

// Configuration
const SOURCE_CHAIN = {
    id: CHAINS[chainArg].chainId,
    name: CHAINS[chainArg].name,
    rpcEnvKey: chainArg.toUpperCase().replace(/-/g, "_") + "_RPC"
};

const POLYMER_API_URL = "https://proof.testnet.polymer.zone/";

async function retryWithDelay(fn, retries = 3, delay = 5000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(chalk.yellow(`\nAPI returned ${error.response?.status}. Retrying in ${delay/1000} seconds... (Attempt ${i + 2}/${retries})`));
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function findBlockWithTransactions(provider, startBlock, maxAttempts = 10) {
    console.log(chalk.yellow('\nSearching for a block with transactions...'));
    
    for (let i = 0; i < maxAttempts; i++) {
        const blockNumber = startBlock - i;
        const block = await provider.getBlock(blockNumber, true);
        
        console.log(`Block ${blockNumber}: ${block.transactions.length} transactions`);
        
        if (block.transactions.length >= 2) {
            console.log(chalk.green(`\n✅ Found suitable block: ${blockNumber}`));
            return block;
        }
    }
    
    throw new Error(`No blocks with sufficient transactions found in last ${maxAttempts} blocks`);
}

async function main() {
    console.log(chalk.blue(`\n🔍 Testing Polymer API with Latest ${SOURCE_CHAIN.name} Block`));
    
    // Setup provider
    const provider = new ethers.JsonRpcProvider(process.env[SOURCE_CHAIN.rpcEnvKey]);
    
    // Get latest block
    const latestBlock = await provider.getBlock('latest');
    console.log('\nLatest Block:', chalk.cyan(latestBlock.number));
    
    // Find a block with transactions
    const block = await findBlockWithTransactions(provider, latestBlock.number);
    
    // Get transaction receipt to get the index
    const txHash = typeof block.transactions[1] === 'string'
        ? block.transactions[1]
        : block.transactions[1].hash;

    console.log('\nFetching receipt for transaction:', chalk.cyan(txHash));
    const receipt = await provider.getTransactionReceipt(txHash);
    
    console.log('\nTest Transaction:');
    console.log('Hash:', chalk.cyan(txHash));
    console.log('Block:', chalk.cyan(block.number));
    console.log('Transaction Index:', chalk.cyan(receipt.index));
    console.log('Number of Logs:', chalk.cyan(receipt.logs.length));

    // Check if transaction has logs
    if (!receipt.logs.length) {
        console.error(chalk.red('\n❌ Selected transaction has no logs. Cannot generate proof.'));
        console.log(chalk.yellow('Try running the script again to test with a different transaction.'));
        process.exit(1);
    }

    // Test Polymer API
    console.log(chalk.yellow('\n📤 Testing Polymer API...'));
    try {
        const startTime = Date.now();
        const proofRequest = await retryWithDelay(async () => {
            return axios.post(
                POLYMER_API_URL,
                {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "log_requestProof",
                    params: [
                        SOURCE_CHAIN.id,  // srcChainId [uint32]
                        block.number,     // srcBlockNumber [uint64]
                        receipt.index,    // txIndex [uint32]
                        0                 // localLogIndex [uint32]
                    ],
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.POLYMER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                }
            );
        }, 3, 2000);  // Reduced to 3 retries, 2 second delay

        const jobId = proofRequest.data.result;
        const requestTime = (Date.now() - startTime) / 1000;
        console.log(chalk.green('\n✅ Proof Request Submitted:'));
        console.log('Job ID:', chalk.cyan(jobId));
        console.log('Request Time:', chalk.cyan(`${requestTime.toFixed(2)}s`));

        // Poll for proof completion
        console.log(chalk.yellow('\n⏳ Waiting for Proof Generation...'));
        let proofResponse;
        let attempts = 0;
        const maxAttempts = 20;  // Increased max attempts since we're polling faster
        
        while (attempts < maxAttempts) {
            attempts++;
            console.log(chalk.yellow(`\nPolling Attempt ${attempts}/${maxAttempts}`));
            
            try {
                proofResponse = await axios.post(
                    POLYMER_API_URL,
                    {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "log_queryProof",
                        params: [jobId]
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.POLYMER_API_KEY}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    }
                );

                const result = proofResponse.data.result;
                const currentTime = (Date.now() - startTime) / 1000;
                console.log('Status:', chalk.cyan(result.status));
                console.log('Time Elapsed:', chalk.cyan(`${currentTime.toFixed(2)}s`));

                if (result.status === 'complete' && result.proof) {
                    const totalTime = (Date.now() - startTime) / 1000;
                    const proofHex = '0x' + Buffer.from(result.proof, 'base64').toString('hex');
                    const decodedLength = Buffer.from(result.proof, 'base64').length;
                    
                    console.log(chalk.green('\n✅ Proof Generation Complete!'));
                    console.log('Total Time:', chalk.cyan(`${totalTime.toFixed(2)}s`));
                    console.log('Proof Size:', chalk.cyan(`${decodedLength} bytes`));
                    
                    console.log('\nProof (base64):');
                    console.log(chalk.gray(result.proof.slice(0, 100) + '...')); // Show first 100 chars

                    console.log('\nProof (hex):');
                    console.log(chalk.gray('Note: Convert base64 to hex format when passing proof to on-chain functions'));
                    console.log(chalk.gray(proofHex.slice(0, 100) + '...')); // Show first 100 chars
                    break;
                } else if (result.status === 'error') {
                    console.error(chalk.red('\n❌ Proof Generation Failed:'));
                    console.error(result.error || 'Unknown error');
                    process.exit(1);
                }

                // Reduced wait time between polls
                await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
            } catch (error) {
                console.error(chalk.red('\n❌ Polling Error:'));
                console.error('Status:', error.response?.status);
                console.error('Data:', error.response?.data);
                throw error;
            }
        }

        if (attempts >= maxAttempts) {
            const timeoutTime = (Date.now() - startTime) / 1000;
            console.error(chalk.red('\n❌ Timeout waiting for proof generation'));
            console.error('Time Elapsed:', chalk.cyan(`${timeoutTime.toFixed(2)}s`));
            process.exit(1);
        }

    } catch (error) {
        console.error(chalk.red('\n❌ API Error:'));
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(chalk.red("Error:"), error);
        process.exit(1);
    });