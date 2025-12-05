import { Address, Account, BHP256, Plaintext, initThreadPool, ProgramManager, AleoKeyProvider, Group } from "@provablehq/sdk";
import { getOrInitConsensusVersionTestHeights } from "@provablehq/sdk";

// Attempt to set the default test heights for the consensus versions from the CONSENSUS_VERSION_HEIGHTS envar when nodeJS loads its wasm module.
function setDefaultTestHeights() {
    const consensusVersionHeights = process.env["CONSENSUS_VERSION_HEIGHTS"];
    if (consensusVersionHeights) {
        getOrInitConsensusVersionTestHeights(consensusVersionHeights)
    }
}

setDefaultTestHeights()

await initThreadPool();

/**
 * Common Aleo addresses and identifiers used in testing
 */
export const ALEO_ZERO_ADDR = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';
export const ETH_ZERO_ADDR = '0x0000000000000000000000000000000000000000';
export const CREDITS_RESERVED_TOKEN_ID = '3443843282313283355522573239085696902919850365217539366784739393210722344986field';
export const TEST_TOKEN_ID = '1751493913335802797273486270793650302076377624243810059080883537084141842600field';

/**
 * Default test accounts with predefined private keys
 * These accounts are the default ones the local devnet starts with.
 */
export const accounts = [
    new Account({ privateKey: "APrivateKey1zkp8CZNn3yeCseEtxuVPbDCwSyhGW6yZKUYKfgXmcpoGPWH" }),
    new Account({ privateKey: "APrivateKey1zkp2RWGDcde3efb89rjhME1VYA8QMxcxep5DShNBR6n8Yjh" }),
    new Account({ privateKey: "APrivateKey1zkp2GUmKbVsuc1NSj28pa1WTQuZaK5f1DQJAT6vPcHyWokG" }),
    new Account({ privateKey: "APrivateKey1zkpBjpEgLo4arVUkQmcLdKQMiAKGaHAQVVwmF8HQby8vdYs" }),
];

/**
 * Array of account addresses as strings for convenience
 */
export const addresses = accounts.map(account => account.address().to_string());

/**
 * Default network configuration
 */
export const NETWORK_URL = "http://127.0.0.1:3030";

/**
 * Initialize and configure the Aleo program manager
 * @returns {ProgramManager} Configured program manager instance
 */
export function initProgramManager() {
    const keyProvider = new AleoKeyProvider();
    keyProvider.useCache(true);

    const programManager = new ProgramManager(NETWORK_URL, keyProvider);
    programManager.setAccount(accounts[0]);

    return programManager;
}

/**
 * Default program manager instance
 */
export const programManager = initProgramManager();

/**
 * Build an execution transaction without submitting it to the network
 * @param {Account} account - The account to execute with
 * @param {string} programName - Name of the program to execute
 * @param {string} functionName - Name of the function to execute
 * @param {Array} inputs - Array of input parameters for the function
 * @returns {Promise<Object>} The built transaction object
 */
export async function execute(account, programName, functionName, inputs, skipProof = true) {
    // Convert array inputs to strings by joining with commas
    const processedInputs = inputs.map(input =>
        Array.isArray(input) ? `[${input.join(',')}]` : input
    );

    const transaction = await programManager.buildExecutionTransaction({
        programName,
        functionName,
        priorityFee: 0,
        privateFee: false,
        inputs: processedInputs,
        privateKey: account.privateKey(),
        keySearchParams: { "cacheKey": `${programName}:${functionName}` },
	    skipProof,
    });
    return transaction;
}

/**
 * Execute a transaction and wait for confirmation on the network
 * @param {Account} account - The account to execute with
 * @param {string} programName - Name of the program to execute
 * @param {string} functionName - Name of the function to execute
 * @param {Array} inputs - Array of input parameters for the function
 * @param {number} maxRetries - Maximum number of retry attempts (default: 30)
 * @param {number} retryDelayMs - Delay between retries in milliseconds (default: 1000)
 * @returns {Promise<Object>} The confirmed transaction object
 * @throws {Error} If transaction fails or times out after max retries
 */
export async function transact(account, programName, functionName, inputs, maxRetries = 30, retryDelayMs = 1000) {
    const transaction = await execute(account, programName, functionName, inputs);
    const transactionId = await programManager.networkClient.submitTransaction(transaction);

    console.log(`Transaction submitted: ${transactionId}`);

    let confirmedTransaction;
    let retries = maxRetries;

    while (retries > 0) {
        try {
            confirmedTransaction = await programManager.networkClient.getTransactionObject(transactionId);
            if (confirmedTransaction) {
                console.log(`Transaction confirmed: ${transactionId}`);
                break;
            }
        } catch (error) {
            console.error(`Transaction confirmation attempt failed: ${error.message}`);
        }

        retries--;
        if (retries > 0) {
            console.log(`Retrying... (${retries} attempts remaining)`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        } else {
            throw new Error(`Transaction failed to confirm after ${maxRetries} attempts: ${transactionId}`);
        }
    }

    if (confirmedTransaction.summary().type !== 'execute') {
        throw new Error( `Transaction failed: ${JSON.stringify(confirmedTransaction.summary(true), (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
    }

    return confirmedTransaction;
}

/**
 * Get the program manager's network client for direct network operations
 * @returns {Object} The network client instance
 */
export function getNetworkClient() {
    return programManager.networkClient;
}

/**
 * Log account information for debugging purposes
 */
export function logAccountInfo() {
    console.log('Test Accounts:');
    addresses.forEach((address, index) => {
        console.log(`  Account ${index}: ${address}`);
    });
}

/**
 * Generate a random address
 */
export function randomAddress() {
    let g = Group.random();
    return Address.fromGroup(g).to_string();
}

/**
 * Return a flat array of all transition outputs from a transaction, after decrypting any private ones.
 */
export function getAllTransactionOutputs(transaction, account) {
    const decryptedTransitions = transaction.execution().transitions().map((transition) => {
        return transition.decryptTransition(transition.tvk(account.viewKey()));
    })
    let allOutputs = [];
    decryptedTransitions.forEach((transition) => {
        allOutputs = allOutputs.concat(transition.outputs(true));
    });
    return allOutputs;
}

/**
 * Calculate the BHP256 hash of a plaintext input
 * @param {string} input - The input string to hash
 * @returns {string} The resulting hash as a string
 */
export function BHP256Hash(input) {
    const hasher = new BHP256();
    return hasher.hash(Plaintext.fromString(input).toBitsLe()).toString();
}

/**
 * Convert a byte array to Leo/Aleo plaintext array format
 *
 * @param {Uint8Array|Array<number>} input - The byte array to convert
 * @returns {string} A string representation of the array in Leo format (e.g., "[1u8, 2u8, 3u8]")
 *
 * @example
 * const bytes = new Uint8Array([0x12, 0x34, 0x56]);
 * const plaintext = bytesToPlaintext(bytes);
 * // Returns: "[18u8, 52u8, 86u8]"
 *
 * @example
 * import { getBytes } from "ethers";
 * const ethAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb";
 * const addressBytes = getBytes(ethAddress);
 * const plaintext = bytesToPlaintext(addressBytes);
 * // Returns: "[116u8, 45u8, 53u8, ...]" (20 bytes total)
 */
export function bytesToPlaintext(input) {
    const arr = Array.isArray(input) ? input : Array.from(input);
    const body = arr.map(b => `${b}u8`).join(", ");
    return `[${body}]`;
}

/**
 * Advance the chain by a specified number of blocks
 * @param {number} numBlocks - Number of blocks to advance
 */
export async function advanceBlocks(numBlocks) {
    console.log(`Advancing chain by ${numBlocks} blocks...`);
    for (let i = 0; i < numBlocks; i++) {
        await transact(
            accounts[0],
            "credits.aleo",
            "transfer_public",
            [addresses[0], "1u64"]
        );
    }
}
