/**
 * Polymer Proof Inspector Test
 * ===========================
 * 
 * Tests the new prover contract inspection functions:
 * - inspectLogIdentifier
 * - inspectPolymerState
 * 
 * Setup:
 * ------
 * npm install inquirer@8.2.4
 * 
 * Usage:
 * ------
 * npx hardhat run scripts/quickInspectTest.js
 * 
 * Required Environment Variables:
 * -----------------------------
 * - POLYMER_PROVER_BASE_TESTNET_CONTRACT_ADDRESS
 * - BASE_SEPOLIA_RPC
 * - POLYMER_API_KEY
 */

const { ethers } = require("hardhat");
const axios = require("axios");
const chalk = require("chalk");
const inquirer = require("inquirer");
require('dotenv').config();

// Configuration
const POLYMER_API_URL = "https://proof.testnet.polymer.zone/";
const PROVER_ADDRESS = process.env.POLYMER_PROVER_BASE_TESTNET_CONTRACT_ADDRESS;

// ABI for the new functions
const PROVER_ABI = [
    "function inspectLogIdentifier(bytes calldata proof) external view returns (uint32 srcChain, uint64 blockNumber, uint16 receiptIndex, uint8 logIndex)",
    "function inspectPolymerState(bytes calldata proof) external view returns (bytes32 stateRoot, uint64 height, bytes calldata signature)"
];

async function main() {
    console.log(chalk.gray("====================================="));
    console.log(chalk.blue("\n🔍 Polymer Proof Inspector"));
    console.log(chalk.gray("====================================="));

    // Prompt for Job ID
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'jobId',
            message: 'Enter the Polymer job ID to inspect:',
            validate: (input) => {
                const num = parseInt(input);
                if (isNaN(num)) {
                    return 'Please enter a valid number';
                }
                return true;
            },
            filter: (input) => parseInt(input) // Convert to number
        }
    ]);

    const JOB_ID = answers.jobId;
    console.log("Job ID:", chalk.cyan(JOB_ID));

    try {
        // Setup Base Sepolia provider and contract
        const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);
        const prover = new ethers.Contract(PROVER_ADDRESS, PROVER_ABI, provider);

        // Poll for proof
        console.log(chalk.yellow("\n⏳ Polling for proof..."));
        let proof;
        let attempts = 0;
        const maxAttempts = 20;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                const response = await axios.post(
                    POLYMER_API_URL,
                    {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "log_queryProof",
                        params: [JOB_ID]
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.POLYMER_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                console.log(`\nAttempt ${attempts}/${maxAttempts}`);
                console.log('Response:', response.data);  // Debug the full response

                if (!response.data || !response.data.result) {
                    console.log(chalk.yellow('No result in response'));
                    continue;
                }

                const result = response.data.result;
                console.log('Status:', chalk.cyan(result.status));

                if (result.status === 'complete' && result.proof) {
                    proof = '0x' + Buffer.from(result.proof, 'base64').toString('hex');
                    console.log(chalk.green("\n✅ Proof received!"));
                    console.log('Size:', chalk.cyan(`${Math.floor(proof.length / 2)} bytes`));
                    break;
                } else if (result.status === 'error') {
                    throw new Error(`Proof generation failed: ${result.error || 'Unknown error'}`);
                }

            } catch (error) {
                console.error(chalk.red(`❌ Error in attempt ${attempts}:`));
                if (error.response) {
                    console.error('API Error:', error.response.data);
                } else {
                    console.error(error.message);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (!proof) {
            throw new Error("Failed to get proof after maximum attempts");
        }

        // Inspect Log Identifier
        console.log(chalk.yellow("\n📋 Inspecting Log Identifier"));
        console.log(chalk.gray("------------------------"));
        const logId = await prover.inspectLogIdentifier(proof);
        console.log('Source Chain ID:', chalk.cyan(logId[0]));
        console.log('Block Number:', chalk.cyan(logId[1]));
        console.log('Receipt Index:', chalk.cyan(logId[2]));
        console.log('Log Index:', chalk.cyan(logId[3]));

        // Inspect Polymer State
        console.log(chalk.yellow("\n🔐 Inspecting Polymer State"));
        console.log(chalk.gray("------------------------"));
        const state = await prover.inspectPolymerState(proof);
        console.log('State Root:', chalk.cyan(state[0]));
        console.log('Height:', chalk.cyan(state[1]));
        console.log('Signature:', chalk.cyan(state[2]));

    } catch (error) {
        console.error(chalk.red("\n❌ Error:"));
        if (error.response) {
            console.error('API Error:', error.response.data);
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });