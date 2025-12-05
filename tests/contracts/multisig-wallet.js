import { Account, Plaintext, BHP256 } from "@provablehq/sdk";
import * as AleoUtils from '../lib/aleo-test-utils.js';

import { createWallet, getWallet, sign, signEcdsa, getSigningOpIdHash, isSigningComplete, DEFAULT_BLOCK_EXPIRATION } from './multisig.js';
export { createWallet, getWallet, sign, signEcdsa, getSigningOpIdHash, isSigningComplete };



/**
 * MSW Credits Multiwallet JavaScript Interface
 *
 * This module provides a convenient JavaScript interface for interacting with the
 * multisig_wallet.aleo program, which enables multisig wallet functionality
 * for both Aleo credits and custom tokens.
 *
 * The multisig wallet supports:
 * - Public and private transfers of Aleo credits
 * - Public and private transfers of custom tokens through token_registry.aleo
 * - k-of-n signature requirements for transaction authorization
 * - Administrative operations (threshold changes, signer management)
 */

/**
 * Deposit public Aleo credits into the multisig wallet
 *
 * @param {Account} senderAccount - Account sending the credits
 * @param {string} walletId - Target wallet identifier
 * @param {string} amount - Amount to deposit (as u128 string, e.g., "1000u128")
 * @returns {Promise<Object>} The deposit transaction object
 *
 * @example
 * await depositPublicAleoCredits(accounts[0], walletId, "5000u128");
 */
export async function depositPublicAleoCredits(senderAccount, walletId, amount) {
    console.log(`Depositing ${amount} public Aleo credits to wallet ${walletId}...`);

    const transaction = await AleoUtils.transact(
        senderAccount,
        "multisig_wallet.aleo",
        "deposit_public_aleo_credits",
        [walletId, amount]
    );

    console.log(`Successfully deposited ${amount} credits to wallet ${walletId}`);
    return transaction;
}

/**
 * Deposit private Aleo credits into the multisig wallet
 *
 * @param {Account} senderAccount - Account sending the credits
 * @param {string} walletId - Target wallet identifier
 * @param {string} amount - Amount to deposit (as u128 string, e.g., "1000u128")
 * @param {string} creditsRecord - Private credits record to deposit
 * @returns {Promise<Object>} Transaction with remaining credits record
 *
 * @example
 * const remainingCredits = await depositPrivateCredits(accounts[0], walletId, "1000u128", creditsRecord);
 */
export async function depositPrivateCredits(senderAccount, walletId, amount, creditsRecord) {
    console.log(`Depositing ${amount} private Aleo credits to wallet ${walletId}...`);
    if (typeof creditsRecord !== 'string') {
        creditsRecord = creditsRecord.toString();
    }

    const transaction = await AleoUtils.transact(
        senderAccount,
        "multisig_wallet.aleo",
        "deposit_private_aleo_credits",
        [walletId, amount, creditsRecord]
    );

    console.log(`Successfully deposited ${amount} private credits to wallet ${walletId}`);
    return transaction;
}

/**
 * Initialize a public transfer from the multisig wallet
 * This creates a signing operation that requires threshold signatures before execution
 *
 * @param {Account} initiatorAccount - Account initiating the transfer
 * @param {string} walletId - Source wallet identifier
 * @param {string} signingOpId - Unique identifier for this signing operation (use Field.random())
 * @param {string} tokenId - Token ID
 * @param {string} destination - Recipient address
 * @param {string} amount - Amount to transfer (as u128 string)
 * @param {number} blockExpiration - Number of blocks until the signing operation expires
 * @returns {Promise<Object>} Transaction object with signing operation hash
 *
 * @example
 * const signingOpId = Field.random().toString();
 * const tx = await initPublicTransfer(accounts[0], walletId, signingOpId, CREDITS_RESERVED_TOKEN_ID, "aleo1recipient...", "100u128");
 * const signingOpIdHash = AleoUtils.getAllTransactionOutputs(tx, accounts[0])[0].value;
 */
export async function initPublicTransfer(initiatorAccount, walletId, signingOpId, tokenId, destination, amount, blockExpiration = DEFAULT_BLOCK_EXPIRATION) {
    const transferStruct = `{token_id: ${tokenId}, destination: ${destination}, amount: ${amount}}`;

    const transaction = await AleoUtils.transact(
        initiatorAccount,
        "multisig_wallet.aleo",
        "init_public_transfer",
        [walletId, signingOpId, `${blockExpiration}u32`, transferStruct]
    );

    return transaction;
}

/**
 * Execute a public credits transfer after sufficient signatures are collected
 *
 * @param {Account} executorAccount - Account executing the transfer
 * @param {string} walletId - Source wallet identifier
 * @param {string} signingOpId - The signed operation identifier
 * @param {string} tokenId - Must be CREDITS_RESERVED_TOKEN_ID
 * @param {string} destination - Recipient address
 * @param {string} amount - Amount to transfer (as u128 string)
 * @returns {Promise<Object>} The execution transaction object
 */
export async function execPublicCreditsTransfer(executorAccount, walletId, signingOpId, tokenId, destination, amount) {
    const transferStruct = `{token_id: ${tokenId}, destination: ${destination}, amount: ${amount}}`;

    const transaction = await AleoUtils.transact(
        executorAccount,
        "multisig_wallet.aleo",
        "exec_public_credits_transfer",
        [walletId, signingOpId, transferStruct]
    );

    console.log(`Public credits transfer executed successfully`);
    return transaction;
}

/**
 * Execute a public token transfer after sufficient signatures are collected
 *
 * @param {Account} executorAccount - Account executing the transfer
 * @param {string} walletId - Source wallet identifier
 * @param {string} signingOpId - The signed operation identifier
 * @param {string} tokenId - Token identifier (must NOT be CREDITS_RESERVED_TOKEN_ID)
 * @param {string} destination - Recipient address
 * @param {string} amount - Amount to transfer (as u128 string)
 * @returns {Promise<Object>} The execution transaction object
 */
export async function execPublicTokenTransfer(executorAccount, walletId, signingOpId, tokenId, destination, amount) {
    console.log(`Executing public token transfer for token ${tokenId}...`);

    const transferStruct = `{token_id: ${tokenId}, destination: ${destination}, amount: ${amount}}`;

    const transaction = await AleoUtils.transact(
        executorAccount,
        "multisig_wallet.aleo",
        "exec_public_token_transfer",
        [walletId, signingOpId, transferStruct]
    );

    console.log(`Public token transfer executed successfully`);
    return transaction;
}

/**
 * Deposit public tokens (from token registry) into the multisig wallet
 *
 * @param {Account} senderAccount - Account sending the tokens
 * @param {string} walletId - Target wallet identifier
 * @param {string} tokenId - Token identifier from token registry
 * @param {string} amount - Amount to deposit (as u128 string)
 * @returns {Promise<Object>} The deposit transaction object
 */
export async function depositPublicToken(senderAccount, walletId, tokenId, amount) {
    console.log(`Depositing ${amount} of token ${tokenId} to wallet ${walletId}...`);

    if (tokenId === AleoUtils.CREDITS_RESERVED_TOKEN_ID) {
        throw new Error("Use depositPublicAleoCredits for Aleo credits");
    }

    const transaction = await AleoUtils.transact(
        senderAccount,
        "multisig_wallet.aleo",
        "deposit_public_token",
        [walletId, tokenId, amount]
    );

    console.log(`Successfully deposited ${amount} tokens to wallet ${walletId}`);
    return transaction;
}

/**
 * Initialize a private transfer from the multisig wallet
 * Private transfers hide the transfer details from public view
 *
 * @param {Account} initiatorAccount - Account initiating the transfer
 * @param {string} walletId - Source wallet identifier
 * @param {string} signingOpId - Unique identifier for this signing operation
 * @param {string} tokenId - Token ID
 * @param {string} destination - Recipient address
 * @param {string} amount - Amount to transfer (as u128 string)
 * @param {number} blockExpiration - Number of blocks until the signing operation expires
 * @returns {Promise<Object>} The transaction and ExecutePrivateTransfer record
 */
export async function initPrivateTransfer(initiatorAccount, walletId, signingOpId, tokenId, destination, amount, blockExpiration = DEFAULT_BLOCK_EXPIRATION) {
    console.log(`Initiating private transfer from wallet ${walletId}...`);
    console.log(`Signing operation ID: ${signingOpId}`);

    const transferStruct = `{token_id: ${tokenId}, destination: ${destination}, amount: ${amount}}`;

    const transaction = await AleoUtils.transact(
        initiatorAccount,
        "multisig_wallet.aleo",
        "init_private_transfer",
        [walletId, signingOpId, `${blockExpiration}u32`, transferStruct]
    );

    const transactionRecords = transaction.ownedRecords(initiatorAccount.viewKey());

    if (!transactionRecords || transactionRecords.length === 0) {
        throw new Error('No records returned from initializing private transfer');
    }

    return {transaction, record: transactionRecords[0]};
}

/**
 * Execute a private credits transfer after sufficient signatures
 *
 * @param {Account} executorAccount - Account executing the transfer
 * @param {string} executionRecord - The execution record from initPrivateTransfer
 * @returns {Promise<Object>} The transaction object containing the recipient's received credits record
 */
export async function execPrivateCreditsTransfer(executorAccount, executionRecord) {
    console.log(`Executing private credits transfer...`);
    if (typeof executionRecord !== 'string') {
        executionRecord = executionRecord.toString();
    }

    const transaction = await AleoUtils.transact(
        executorAccount,
        "multisig_wallet.aleo",
        "exec_private_credits_transfer",
        [executionRecord]
    );

    return transaction;
}

/**
 * Deposit private tokens into the multisig wallet
 *
 * @param {Account} senderAccount - Account sending the private tokens
 * @param {string} walletId - Target wallet identifier
 * @param {string} amount - Amount to deposit (as u128 string, e.g., "1000u128")
 * @param {string|Object} tokenRecord - Private token record to deposit
 * @returns {Promise<Object>} Transaction with remaining token record
 *
 * @example
 * const remainingToken = await depositPrivateToken(accounts[0], walletId, "1000u128", tokenRecord);
 */
export async function depositPrivateToken(senderAccount, walletId, amount, tokenRecord) {
    console.log(`Depositing ${amount} private tokens to wallet ${walletId}...`);
    if (typeof tokenRecord !== 'string') {
        tokenRecord = tokenRecord.toString();
    }

    const transaction = await AleoUtils.transact(
        senderAccount,
        "multisig_wallet.aleo",
        "deposit_private_token",
        [walletId, amount, tokenRecord]
    );

    console.log(`Successfully deposited ${amount} private tokens`);
    return transaction;
}

/**
 * Execute a private token transfer after sufficient signatures
 *
 * @param {Account} executorAccount - Account executing the transfer
 * @param {string} executionRecord - The execution record from initPrivateTransfer
 * @returns {Promise<Object>} The transaction object containing the recipient's received record
 */
export async function execPrivateTokenTransfer(executorAccount, executionRecord) {
    console.log(`Executing private token transfer...`);
    if (typeof executionRecord !== 'string') {
        executionRecord = executionRecord.toString();
    }

    const transaction = await AleoUtils.transact(
        executorAccount,
        "multisig_wallet.aleo",
        "exec_private_token_transfer",
        [executionRecord]
    );

    return transaction;
}

/**
 * Get the current balance of a wallet for a specific token
 *
 * @param {string} walletId - Wallet identifier
 * @param {string} tokenId - Token identifier (use CREDITS_RESERVED_TOKEN_ID for Aleo credits)
 * @returns {Promise<string|null>} Current balance or null if no balance found
 */
export async function getWalletBalance(walletId, tokenId) {
    const balanceKeyStruct = Plaintext.fromString(`{ wallet_id: ${walletId}, token_id: ${tokenId} }`);
    const hasher = new BHP256();
    const balanceKey = hasher.hash(balanceKeyStruct.toBitsLe()).toString();

    const balance = await AleoUtils.getNetworkClient().getProgramMappingValue(
        "multisig_wallet.aleo",
        "balances",
        balanceKey
    );

    if (balance == null) return 0n;
    return Plaintext.fromString(balance).toObject();
}

/**
 * Verify private transfer details by checking the stored hash
 * This allows signers to confirm they're signing the expected transaction
 *
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - Signing operation identifier
 * @param {string} tokenId - Token identifier
 * @param {string} destination - Recipient address
 * @param {string} amount - Amount to transfer (as u128 string)
 * @returns {Promise<boolean>} True if details match, false otherwise
 */
export async function verifyPrivateTransferDetails(walletId, signingOpId, tokenId, destination, amount) {
    const walletSigningOpIdHash = getSigningOpIdHash(walletId, signingOpId);

    const privateTransferDetails = `{wallet_id: ${walletId}, signing_op_id: ${signingOpId}, transfer: {token_id: ${tokenId}, destination: ${destination}, amount: ${amount}}}`;
    const expectedHash = AleoUtils.BHP256Hash(privateTransferDetails);

    const networkClient = AleoUtils.getNetworkClient();
    const storedHash = await networkClient.getProgramMappingValue(
        "multisig_wallet.aleo",
        "private_transfers",
        walletSigningOpIdHash
    );

    console.log('stored', storedHash)
    console.log('expected', expectedHash)
    const matches = storedHash === expectedHash;
    console.log(`Private transfer details verification: ${matches ? 'CONFIRMED' : 'MISMATCH'}`);
    return matches;
}
