/**
 * Polymer API Error Response Test
 * ==============================
 * 
 * Interactive test script for Polymer API validation:
 * 1. Chain ID validation
 * 2. Block number validation
 * 
 * Setup:
 * ------
 * npm install chalk axios inquirer ethers
 * 
 * Usage:
 * ------
 * node scripts/quickApiErrorTest.js
 * 
 * Required Environment Variables:
 * -----------------------------
 * - POLYMER_API_KEY
 * - BASE_SEPOLIA_RPC
 */

const axios = require("axios");
const chalk = require("chalk");
const inquirer = require("inquirer");
const { ethers } = require("ethers");
require("dotenv").config();

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

async function main() {
    // Test 1: Chain ID Validation
    console.log(chalk.blue("\n🔍 Testing Chain ID Validation"));
    console.log(chalk.gray("====================================="));

    await testApiCall("Random Chain ID (123456789)", {
        jsonrpc: "2.0",
        id: 1,
        method: "log_requestProof",
        params: [
            123456789,       // Random chain ID
            12345,          // Some block number
            0,              // Tx index
            0               // Log index
        ]
    });

    console.log(chalk.gray("\n====================================="));
    console.log(chalk.green("✅ Chain ID Test Complete!"));

    // Prompt to continue
    const { proceed } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed with Block Number validation test?',
            default: true
        }
    ]);

    if (!proceed) {
        console.log(chalk.yellow("\nTest stopped by user."));
        return;
    }

    // Test 2: Block Number Validation
    console.log(chalk.blue("\n🔍 Testing Block Number Validation"));
    console.log(chalk.gray("====================================="));

    // Get latest block from Base Sepolia
    const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);
    const latestBlock = await provider.getBlockNumber();
    console.log(chalk.cyan(">  Latest Block:"), latestBlock);

    // Test future block
    const futureBlock = latestBlock + 1000;
    console.log(chalk.cyan(">  Testing Future Block:"), futureBlock);

    try {
        const response = await testApiCall(`Future Block Number (${futureBlock})`, {
            jsonrpc: "2.0",
            id: 1,
            method: "log_requestProof",
            params: [
                BASE_CHAIN_ID,
                futureBlock,
                0,
                0
            ]
        });
        
        const jobId = response?.result;
        if (jobId) {
            console.log(chalk.yellow("\n🤔 Interesting! Got a job ID even for a future block!"));
            
            // Prompt to poll
            const { shouldPoll } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'shouldPoll',
                    message: 'Would you like to poll for results?',
                    default: true
                }
            ]);

            if (shouldPoll) {
                console.log(chalk.yellow("\n🔍 Polling proof status for 1 minute..."));
                const startTime = Date.now();
                const timeoutMs = 60 * 1000; // 1 minute
                const intervalMs = 10 * 1000; // 10 seconds

                while (Date.now() - startTime < timeoutMs) {
                    console.log(chalk.gray("\n>  Checking status..."));
                    const statusResponse = await testApiCall(`Query Proof Status for Job ${jobId}`, {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "log_queryProof",
                        params: [jobId]
                    });

                    // Check for error status
                    if (statusResponse?.result?.status === 'error') {
                        console.log(chalk.red("\n❌ Proof Generation Failed:"));
                        console.log(chalk.cyan(">  Reason:"), statusResponse.result.failureReason);
                        console.log(chalk.cyan(">  Block Number:"), statusResponse.result.blockNumber);
                        console.log(chalk.cyan(">  Latest Block:"), latestBlock);
                        break; // Exit polling loop on error
                    }

                    // Wait 10 seconds before next check
                    console.log(chalk.gray(`>  Waiting ${intervalMs/1000} seconds...`));
                    await new Promise(resolve => setTimeout(resolve, intervalMs));
                }
                
                console.log(chalk.yellow("\n⏰ Polling complete after 1 minute"));
            }
        }
    } catch (error) {
        console.log(chalk.red(">  Initial request failed"));
    }

    console.log(chalk.gray("\n====================================="));
    console.log(chalk.green("✅ Block Number Test Complete!"));

    // Prompt to continue with receipt index test
    const { proceedToReceipt } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'proceedToReceipt',
            message: 'Proceed with Receipt Index validation test?',
            default: true
        }
    ]);

    if (!proceedToReceipt) {
        console.log(chalk.yellow("\nTest stopped by user."));
        return;
    }

    // Test 3: Receipt Index Validation
    console.log(chalk.blue("\n🔍 Testing Receipt Index Validation"));
    console.log(chalk.gray("====================================="));

    // Get a valid block number (current - 10 for safety)
    const testBlock = latestBlock - 10;
    console.log(chalk.cyan(">  Using Block Number:"), testBlock);
    
    // Test with extremely large receipt index
    const invalidReceiptIndex = 99999;
    console.log(chalk.cyan(">  Testing Invalid Receipt Index:"), invalidReceiptIndex);

    try {
        const response = await testApiCall(`Invalid Receipt Index (${invalidReceiptIndex})`, {
            jsonrpc: "2.0",
            id: 1,
            method: "log_requestProof",
            params: [
                BASE_CHAIN_ID,
                testBlock,
                invalidReceiptIndex,  // Invalid receipt index
                0                     // Log index
            ]
        });
        
        const jobId = response?.result;
        if (jobId) {
            console.log(chalk.yellow("\n🤔 Interesting! Got a job ID for invalid receipt index!"));
            
            // Prompt to poll
            const { shouldPoll } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'shouldPoll',
                    message: 'Would you like to poll for results?',
                    default: true
                }
            ]);

            if (shouldPoll) {
                console.log(chalk.yellow("\n🔍 Polling proof status for 1 minute..."));
                const startTime = Date.now();
                const timeoutMs = 60 * 1000; // 1 minute
                const intervalMs = 10 * 1000; // 10 seconds

                while (Date.now() - startTime < timeoutMs) {
                    console.log(chalk.gray("\n>  Checking status..."));
                    const statusResponse = await testApiCall(`Query Proof Status for Job ${jobId}`, {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "log_queryProof",
                        params: [jobId]
                    });

                    // Check for error status
                    if (statusResponse?.result?.status === 'error') {
                        console.log(chalk.red("\n❌ Proof Generation Failed:"));
                        console.log(chalk.cyan(">  Reason:"), statusResponse.result.failureReason);
                        console.log(chalk.cyan(">  Block Number:"), statusResponse.result.blockNumber);
                        break; // Exit polling loop on error
                    }

                    // Wait 10 seconds before next check
                    console.log(chalk.gray(`>  Waiting ${intervalMs/1000} seconds...`));
                    await new Promise(resolve => setTimeout(resolve, intervalMs));
                }
                
                console.log(chalk.yellow("\n⏰ Polling complete after 1 minute"));
            }
        }
    } catch (error) {
        console.log(chalk.red(">  Initial request failed"));
    }

    console.log(chalk.gray("\n====================================="));
    console.log(chalk.green("✅ Receipt Index Test Complete!"));

    // Prompt to continue with log index test
    const { proceedToLog } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'proceedToLog',
            message: 'Proceed with Log Index validation test?',
            default: true
        }
    ]);

    if (!proceedToLog) {
        console.log(chalk.yellow("\nTest stopped by user."));
        return;
    }

    // Test 4: Log Index Validation
    console.log(chalk.blue("\n🔍 Testing Log Index Validation"));
    console.log(chalk.gray("====================================="));

    // Use same block as before
    console.log(chalk.cyan(">  Using Block Number:"), testBlock);
    
    // Test with extremely large log index
    const invalidLogIndex = 999;
    console.log(chalk.cyan(">  Testing Invalid Log Index:"), invalidLogIndex);

    try {
        const response = await testApiCall(`Invalid Log Index (${invalidLogIndex})`, {
            jsonrpc: "2.0",
            id: 1,
            method: "log_requestProof",
            params: [
                BASE_CHAIN_ID,
                testBlock,
                0,              // Use first transaction
                invalidLogIndex // Invalid log index
            ]
        });
        
        const jobId = response?.result;
        if (jobId) {
            console.log(chalk.yellow("\n🤔 Interesting! Got a job ID for invalid log index!"));
            
            // Prompt to poll
            const { shouldPoll } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'shouldPoll',
                    message: 'Would you like to poll for results?',
                    default: true
                }
            ]);

            if (shouldPoll) {
                console.log(chalk.yellow("\n🔍 Polling proof status for 1 minute..."));
                const startTime = Date.now();
                const timeoutMs = 60 * 1000; // 1 minute
                const intervalMs = 10 * 1000; // 10 seconds

                while (Date.now() - startTime < timeoutMs) {
                    console.log(chalk.gray("\n>  Checking status..."));
                    const statusResponse = await testApiCall(`Query Proof Status for Job ${jobId}`, {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "log_queryProof",
                        params: [jobId]
                    });

                    // Check for error status
                    if (statusResponse?.result?.status === 'error') {
                        console.log(chalk.red("\n❌ Proof Generation Failed:"));
                        console.log(chalk.cyan(">  Reason:"), statusResponse.result.failureReason);
                        console.log(chalk.cyan(">  Block Number:"), statusResponse.result.blockNumber);
                        break; // Exit polling loop on error
                    }

                    // Wait 10 seconds before next check
                    console.log(chalk.gray(`>  Waiting ${intervalMs/1000} seconds...`));
                    await new Promise(resolve => setTimeout(resolve, intervalMs));
                }
                
                console.log(chalk.yellow("\n⏰ Polling complete after 1 minute"));
            }
        }
    } catch (error) {
        console.log(chalk.red(">  Initial request failed"));
    }

    console.log(chalk.gray("\n====================================="));
    console.log(chalk.green("✅ Log Index Test Complete!"));
    console.log(chalk.yellow("\nAll tests completed!"));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(chalk.red("\n❌ Test Error:"), error);
        process.exit(1);
    });