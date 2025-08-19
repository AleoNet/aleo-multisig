import { BHP256, Plaintext } from "@provablehq/sdk";
import * as AleoUtils from '../lib/aleo-test-utils.js';

/**
 * Initialize the token registry program
 * Checks if the registry is already initialized before attempting initialization
 * @returns {Promise<Object|null>} The initialization transaction if performed, null if already initialized
 */
export async function initRegistry() {
    const networkClient = AleoUtils.getNetworkClient();

    try {
        const registeredToken = await networkClient.getProgramMappingValue(
            "token_registry.aleo",
            "registered_tokens",
            AleoUtils.CREDITS_RESERVED_TOKEN_ID
        );

        if (registeredToken) {
            console.log('Token registry already initialized:', registeredToken);
            return null;
        }
    } catch (error) {
        console.log('Token registry not initialized, proceeding with initialization');
    }

    console.log('Initializing token registry...');
    const transaction = await AleoUtils.transact(
        AleoUtils.accounts[0],
        "token_registry.aleo",
        "initialize",
        []
    );
    console.log('Token registry initialized successfully');
    return transaction;
}

/**
 * Register a new token in the token registry
 * @param {string} tokenId - The unique identifier for the token
 * @param {string} name - Token name parameter (as u128)
 * @param {string} symbol - Token symbol parameter (as u128)
 * @param {string} decimals - Number of decimal places (as u8)
 * @param {string} maxSupply - Maximum token supply (as u128)
 * @param {string} external - Whether token requires external authorization ('true' or 'false')
 * @param {string} admin - Address that can provide external authorization (if external auth is required)
 * @returns {Promise<Object|null>} The registration transaction if performed, null if already registered
 */
export async function registerToken(tokenId, name, symbol, decimals, maxSupply, external, admin) {
    const networkClient = AleoUtils.getNetworkClient();

    try {
        const registeredToken = await networkClient.getProgramMappingValue(
            "token_registry.aleo",
            "registered_tokens",
            tokenId
        );

        if (registeredToken) {
            console.log(`Token ${tokenId} already registered:`, registeredToken);
            return null;
        }
    } catch (error) {
        console.log(`Token ${tokenId} not registered, proceeding with registration`);
    }

    console.log(`Registering token ${tokenId}...`);
    const transaction = await AleoUtils.transact(
        AleoUtils.accounts[0],
        "token_registry.aleo",
        "register_token",
        [tokenId, name, symbol, decimals, maxSupply, external, admin]
    );
    console.log(`Token ${tokenId} registered successfully`);
    return transaction;
}

/**
 * Register the default test token
 * Convenience function that registers the TEST_TOKEN_ID with predefined parameters
 * @returns {Promise<Object|null>} The registration transaction if performed, null if already registered
 */
export async function registerTestToken() {
    return await registerToken(
        AleoUtils.TEST_TOKEN_ID,
        '123u128',      // name
        '123u128',      // symbol
        '6u8',          // decimals
        '10000000000u128', // maxSupply
        'false',        // external
        AleoUtils.addresses[0] // external_authorization_party
    );
}

/**
 * Mint private tokens to a recipient
 *
 * @param {string} tokenId - The token identifier to mint
 * @param {Account} recipientAccount - The recipient account object
 * @param {string} amount - Amount to mint (as u128 string, e.g., "1000u128")
 * @returns {Promise<Object>} The token record from the minting transaction
 *
 * @example
 * const tokenRecord = await mintPrivateToken(TEST_TOKEN_ID, accounts[1], "1000u128");
 */
export async function mintPrivateToken(tokenId, recipientAccount, amount) {
    const recipient = recipientAccount.address().to_string();
    console.log(`Minting ${amount} of token ${tokenId} to ${recipient}...`);

    const transaction = await AleoUtils.transact(
        AleoUtils.accounts[0],
        "token_registry.aleo",
        "mint_private",
        [tokenId, recipient, amount, 'false', '0u32']
    );

    const transactionRecords = transaction.ownedRecords(recipientAccount.viewKey());

    if (!transactionRecords || transactionRecords.length === 0) {
        throw new Error('No records returned from minting transaction');
    }

    console.log(`Successfully minted private token record`);
    return transactionRecords[0];
}

/**
 * Mint public tokens to a recipient's public balance
 *
 * @param {string} tokenId - The token identifier to mint
 * @param {string} recipientAddress - The recipient's address (as string)
 * @param {string} amount - Amount to mint (as u128 string, e.g., "1000u128")
 * @param {string} [authorizedUntil='0u32'] - Block height until which tokens are authorized (as u32)
 * @returns {Promise<Object>} The minting transaction object
 *
 * @example
 * const tx = await mintPublicToken(TEST_TOKEN_ID, "aleo1recipient...", "1000u128");
 */
export async function mintPublicToken(tokenId, recipientAddress, amount, authorizedUntil = '0u32') {
    console.log(`Minting ${amount} of public token ${tokenId} to ${recipientAddress}...`);

    const transaction = await AleoUtils.transact(
        AleoUtils.accounts[0],
        "token_registry.aleo",
        "mint_public",
        [tokenId, recipientAddress, amount, authorizedUntil]
    );

    console.log(`Successfully minted public tokens:`, transaction.summary());
    return transaction;
}

/**
 * Transfer private tokens to a public balance
 *
 * @param {Account} senderAccount - The account sending the private tokens
 * @param {string|Object} inputRecord - The private token record to transfer from
 * @param {string} recipient - The recipient's address
 * @param {string} amount - Amount to transfer (as u128 string, e.g., "100u128")
 * @returns {Promise<Object>} The transfer transaction object
 *
 * @example
 * const tx = await transferPrivateToPublic(accounts[0], tokenRecord, "aleo1recipient...", "100u128");
 */
export async function transferPrivateToPublic(senderAccount, inputRecord, recipient, amount) {
    // TODO check type is Record
    if (typeof inputRecord !== 'string') {
        inputRecord = inputRecord.toString();
    }

    console.log(`Transferring ${amount} private tokens to public balance for ${recipient}...`);

    const transaction = await AleoUtils.transact(
        senderAccount,
        "token_registry.aleo",
        "transfer_private_to_public",
        [recipient, amount, inputRecord]
    );

    console.log('Private to public transfer completed:', transaction.summary());
    return transaction;
}

/**
 * Get the public balance of a token for a specific account
 *
 * @param {string} tokenId - The token identifier
 * @param {string} accountAddress - The account address to check
 * @returns {Promise<bigint>} The balance amount as bigint, or 0n if no balance found
 *
 * @example
 * const balance = await getPublicBalance(TEST_TOKEN_ID, "aleo1address...");
 * console.log(`Balance: ${balance}`);
 */
export async function getPublicBalance(tokenId, accountAddress) {
    try {
        // Create the balance key by hashing the account and token_id struct
        const accountTokenStruct = Plaintext.fromString(`{account: ${accountAddress}, token_id: ${tokenId}}`);
        const hasher = new BHP256();
        const balanceKey = hasher.hash(accountTokenStruct.toBitsLe()).toString();

        const networkClient = AleoUtils.getNetworkClient();
        const balance = await networkClient.getProgramMappingValue(
            "token_registry.aleo",
            "authorized_balances",
            balanceKey
        );

        console.log(`Public balance for ${accountAddress}: ${balance}`);
        if (balance == null) return 0n;
        return Plaintext.fromString(balance).toObject().balance;
    } catch (error) {
        console.log(`No public balance found for ${accountAddress}:`, error.message);
        return null;
    }
}

/**
 * Get token registration details
 * @param {string} tokenId - The token identifier
 * @returns {Promise<Object|null>} Token registration details or null if not found
 */
export async function getTokenInfo(tokenId) {
    try {
        const networkClient = AleoUtils.getNetworkClient();
        const tokenInfo = await networkClient.getProgramMappingValue(
            "token_registry.aleo",
            "registered_tokens",
            tokenId
        );

        console.log(`Token ${tokenId} info:`, tokenInfo);
        return tokenInfo;
    } catch (error) {
        console.log(`Token ${tokenId} not found:`, error.message);
        return null;
    }
}

/**
 * Complete token setup workflow for testing
 * Initializes registry, registers test token, and optionally mints tokens
 * @param {boolean} mintTokens - Whether to mint test tokens (default: false)
 * @param {string} mintAmount - Amount to mint if mintTokens is true (default: '1000u128')
 * @returns {Promise<Object>} Object containing setup results
 */
export async function setupTestEnvironment(mintTokens = false, mintAmount = '1000u128') {
    console.log('Setting up token registry test environment...');

    const results = {
        registryInit: null,
        tokenRegistration: null,
        mintedRecord: null
    };

    // Initialize registry
    results.registryInit = await initRegistry();

    // Register test token
    results.tokenRegistration = await registerTestToken();

    // Optionally mint tokens
    if (mintTokens) {
        results.mintedRecord = await mintPrivateToken(
            AleoUtils.TEST_TOKEN_ID,
            AleoUtils.addresses[0],
            mintAmount
        );
    }

    console.log('Test environment setup completed');
    return results;
}
