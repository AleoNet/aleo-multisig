import { Account, Plaintext, BHP256, Field } from "@provablehq/sdk";
import { getBytes } from "ethers";
import * as AleoUtils from '../lib/aleo-test-utils.js';

/**
 * MSW Multisig JavaScript Interface
 *
 * This module provides a convenient interface for interacting with the multisig_core.aleo
 * program, which provides general-purpose multi-sig functionality that can easily be
 * leveraged by other programs.
 */

// Admin operation constants
export const ADMIN_OP_CHANGE_THRESHOLD = 1;
export const ADMIN_OP_ADD_SIGNER = 2;
export const ADMIN_OP_REMOVE_SIGNER = 3;

// Default block expiration value
export const DEFAULT_BLOCK_EXPIRATION = 100;

/**
 * Create a new multisig wallet with specified threshold and signers
 *
 * @param {Account} creatorAccount - The account creating the wallet
 * @param {string} walletId - Unique identifier for the wallet (address format)
 * @param {number} threshold - Minimum number of signatures required (1-4)
 * @param {string[]} aleoSigners - Array of Aleo signer addresses (max 4, use ALEO_ZERO_ADDR for unused slots)
 * @param {string[]} ecdsaSigners - Array of ETH signer addresses (max 4, use ETH_ZERO_ADDR for unused slots)
 * @param {boolean} [skipIfExists=false] - If true, skip creation and return null if wallet already exists
 * @returns {Promise<Object|null>} The transaction object containing wallet creation details, or null if skipped
 *
 * @example
 * const wallet = await createWallet(
 *   accounts[0],
 *   "aleo1example...",
 *   2, // 2-of-3 multisig
 *   [address1, address2, address3, ALEO_ZERO_ADDR],
 * );
 */
export async function createWallet(creatorAccount, walletId, threshold, aleoSigners = [], ecdsaSigners = [], skipIfExists = false) {
    console.log(`Creating multisig wallet ${walletId} with threshold ${threshold} and ${aleoSigners}...`);

    // Check if wallet already exists when skipIfExists is true
    if (skipIfExists) {
        const existingWallet = await getWallet(walletId);
        if (existingWallet !== null) {
            console.log(`Wallet ${walletId} already exists, skipping creation`);
            return null;
        }
    }

    // Ensure signers array is exactly 4 elements, padding with ALEO_ZERO_ADDR if needed
    const paddedAleoSigners = [...aleoSigners];
    while (paddedAleoSigners.length < 4) {
        paddedAleoSigners.push(AleoUtils.ALEO_ZERO_ADDR);
    }

    const paddedEcdsaSigners = [...ecdsaSigners];
    while (paddedEcdsaSigners.length < 4) {
        paddedEcdsaSigners.push(AleoUtils.ETH_ZERO_ADDR);
    }
    const paddedPlaintextEcdsaSigners = paddedEcdsaSigners.map((addrStr) => AleoUtils.bytesToPlaintext(getBytes(addrStr)));

    const transaction = await AleoUtils.transact(
        creatorAccount,
        "multisig_core.aleo",
        "create_wallet",
        [walletId, `${threshold}u8`, paddedAleoSigners, paddedPlaintextEcdsaSigners]
    );

    console.log(`Multisig wallet ${walletId} created successfully`);
    return transaction;
}

/**
 * Retrieve wallet information and settings from the blockchain
 *
 * @param {string} walletId - The wallet identifier to look up
 * @returns {Promise<Object|null>} Wallet settings object containing threshold and num_signers, or null if wallet doesn't exist
 *
 * @example
 * const walletInfo = await getWallet("aleo1example...");
 * if (walletInfo) {
 *   console.log(`Threshold: ${walletInfo.threshold}, Signers: ${walletInfo.num_signers}`);
 * } else {
 *   console.log("Wallet not found");
 * }
 *
 * @example
 * // Check if wallet exists before creating
 * const existingWallet = await getWallet(walletId);
 * if (!existingWallet) {
 *   await createWallet(account, walletId, 2, signers);
 * }
 */
export async function getWallet(walletId) {
    const wallet = await AleoUtils.getNetworkClient().getProgramMappingValue(
        "multisig_core.aleo",
        "wallets_map",
        walletId,
    );
    if (wallet == null) return null;

    return Plaintext.fromString(wallet).toObject();
}

/**
 * Retrieve global program settings
 *
 * @returns {Promise<Object|null>} Program settings object containing guard_create_wallet, or null if program not initialized
 */
export async function getProgramSettings() {
    const settings = await AleoUtils.getNetworkClient().getProgramMappingValue(
        "multisig_core.aleo",
        "program_settings_map",
        "true",
    );
    if (settings == null) return null;

    return Plaintext.fromString(settings).toObject();
}

/**
 * Initiate a signing operation in the multisig wallet
 * This creates a new signing operation that signers can then sign
 *
 * @param {Account} initiatorAccount - Account initiating the signing operation (must be a signer)
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - Unique identifier for the signing operation (use Field.random())
 * @param {number} blockExpiration - Number of blocks until the signing operation expires
 * @returns {Promise<Object>} The transaction object
 *
 * @example
 * import { Field } from "@provablehq/sdk";
 *
 * const signingOpId = Field.random();
 * await initiateSigningOp(accounts[0], walletId, signingOpId);
 */
export async function initiateSigningOp(initiatorAccount, walletId, signingOpId, blockExpiration = DEFAULT_BLOCK_EXPIRATION) {
    console.log(`Account ${initiatorAccount.address().to_string()} initiating signing operation ${signingOpId.toString()}...`);

    const transaction = await AleoUtils.transact(
        initiatorAccount,
        "multisig_core.aleo",
        "initiate_signing_op",
        [walletId, signingOpId.toString(), `${blockExpiration}u32`]
    );

    console.log(`Successfully initiated signing operation ${signingOpId.toString()}`);
    return transaction;
}

/**
 * Sign a pending operation in the multisig wallet
 * Each signer must call this function to approve a transaction
 *
 * @param {Account} signerAccount - Account of the signer
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - The signing operation identifier to sign
 * @returns {Promise<Object>} The signature transaction object
 *
 * @example
 * // Each required signer calls this function
 * await sign(accounts[1], walletId, signingOpId);
 * await sign(accounts[2], walletId, signingOpId);
 */
export async function sign(signerAccount, walletId, signingOpId) {
    console.log(`Account ${signerAccount.address().to_string()} signing operation ${signingOpId}...`);

    const transaction = await AleoUtils.transact(
        signerAccount,
        "multisig_core.aleo",
        "sign",
        [walletId, signingOpId]
    );

    console.log(`Successfully signed operation ${signingOpId}`);
    return transaction;
}

/**
 * Helper for generating the signing operation ID hash with nonce
 * This is used for ECDSA signatures which include a nonce to prevent replay attacks
 *
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - Signing operation identifier
 * @param {bigint} nonce - Unique nonce value
 * @returns {string} The hashed signing operation ID with nonce
 */
export function getSigningOpIdNonceHash(walletId, signingOpId, nonce) {
    return AleoUtils.BHP256Hash(`{wallet_id: ${walletId}, signing_op_id: ${signingOpId}, nonce: ${nonce}u64}`);
}

/**
 * Sign a pending operation with an ECDSA signature from an Ethereum wallet
 *
 * @param {Account} executorAccount - Account executing the transaction (pays fees, doesn't need to be a signer)
 * @param {Wallet} ethWallet - Ethers.js Wallet that will sign the operation
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - The signing operation identifier to sign
 * @param {bigint} [nonce] - Optional nonce to prevent replay attacks (random if not provided)
 * @returns {Promise<Object>} The signature transaction object
 *
 * @example
 * import { Wallet } from "ethers";
 *
 * const ethWallet = Wallet.createRandom();
 * await signEcdsa(accounts[0], ethWallet, walletId, signingOpId);
 */
export async function signEcdsa(executorAccount, ethWallet, walletId, signingOpId, nonce = null) {
    console.log(`Ethereum wallet ${ethWallet.address} signing operation ${signingOpId}...`);

    // Use provided nonce or generate a random one
    if (nonce === null) {
        nonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
    }

    // Get the hash that includes the nonce - this is what gets signed
    const nonceHash = getSigningOpIdNonceHash(walletId, signingOpId, nonce);

    // Convert the hash to 32 bytes for ECDSA signing
    const hashField = Field.fromString(nonceHash);
    const msg32 = hashField.toBytesLe();

    // Sign the message with the Ethereum wallet
    const sigHex = ethWallet.signMessageSync(msg32);
    const sigBytes = getBytes(sigHex);

    // Get the Ethereum address bytes
    const ethAddrBytes = getBytes(ethWallet.address);

    const transaction = await AleoUtils.transact(
        executorAccount,
        "multisig_core.aleo",
        "sign_ecdsa",
        [walletId, signingOpId, AleoUtils.bytesToPlaintext(ethAddrBytes), AleoUtils.bytesToPlaintext(sigBytes), `${nonce}u64`]
    );

    console.log(`Successfully signed operation ${signingOpId} with ECDSA`);
    return transaction;
}

/**
 * Sign a pending operation in the multisig wallet for a specific round
 *
 * @param {Account} signerAccount - Account of the signer
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - The signing operation identifier to sign
 * @param {number} round - The specific round number to sign for
 * @returns {Promise<Object>} The signature transaction object
 */
export async function signForRound(signerAccount, walletId, signingOpId, round) {
    console.log(`Account ${signerAccount.address().to_string()} signing operation ${signingOpId} for round ${round}...`);

    const transaction = await AleoUtils.transact(
        signerAccount,
        "multisig_core.aleo",
        "sign_for_round",
        [walletId, signingOpId, `${round}u32`]
    );

    console.log(`Successfully signed operation ${signingOpId} for round ${round}`);
    return transaction;
}

/**
 * Sign a pending operation with an ECDSA signature from an Ethereum wallet for a specific round
 *
 * @param {Account} executorAccount - Account executing the transaction (pays fees, doesn't need to be a signer)
 * @param {Wallet} ethWallet - Ethers.js Wallet that will sign the operation
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - The signing operation identifier to sign
 * @param {number} round - The specific round number to sign for
 * @param {bigint} [nonce] - Optional nonce to prevent replay attacks (random if not provided)
 * @returns {Promise<Object>} The signature transaction object
 */
export async function signEcdsaForRound(executorAccount, ethWallet, walletId, signingOpId, round, nonce = null) {
    console.log(`Ethereum wallet ${ethWallet.address} signing operation ${signingOpId} for round ${round}...`);

    // Use provided nonce or generate a random one
    if (nonce === null) {
        nonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
    }

    // Get the hash that includes the nonce - this is what gets signed
    const nonceHash = getSigningOpIdNonceHash(walletId, signingOpId, nonce);

    // Convert the hash to 32 bytes for ECDSA signing
    const hashField = Field.fromString(nonceHash);
    const msg32 = hashField.toBytesLe();

    // Sign the message with the Ethereum wallet
    const sigHex = ethWallet.signMessageSync(msg32);
    const sigBytes = getBytes(sigHex);

    // Get the Ethereum address bytes
    const ethAddrBytes = getBytes(ethWallet.address);

    const transaction = await AleoUtils.transact(
        executorAccount,
        "multisig_core.aleo",
        "sign_ecdsa_for_round",
        [walletId, signingOpId, AleoUtils.bytesToPlaintext(ethAddrBytes), AleoUtils.bytesToPlaintext(sigBytes), `${nonce}u64`, `${round}u32`]
    );

    console.log(`Successfully signed operation ${signingOpId} with ECDSA for round ${round}`);
    return transaction;
}

/**
 * Helper for generating the signing operation ID hash
 * This is used to track signing operations in the multisig wallet
 *
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - Signing operation identifier
 * @returns {string} The hashed signing operation ID
 */
export function getSigningOpIdHash(walletId, signingOpId) {
    return AleoUtils.BHP256Hash(`{wallet_id: ${walletId}, signing_op_id: ${signingOpId}}`);
}

/**
 * Check if a signing operation has been completed (threshold reached)
 *
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - Signing operation identifier
 * @returns {Promise<boolean>} True if signing is complete, false otherwise
 */
export async function isSigningComplete(walletId, signingOpId) {
    const signingOpIdHash = getSigningOpIdHash(walletId, signingOpId);
    const completedAtBlockHeight = await AleoUtils.getNetworkClient().getProgramMappingValue(
        "multisig_core.aleo",
        "completed_signing_ops",
        signingOpIdHash
    );

    if (completedAtBlockHeight == null) return false;

    return Plaintext.fromString(completedAtBlockHeight).toObject() > 0;
}

/**
 * Get details of a pending signing operation
 *
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - Signing operation identifier
 * @returns {Promise<Object|null>} The pending signing operation object {confirmations, expires_at_block, round}, or null if not found
 */
export async function getPendingSigningOp(walletId, signingOpId) {
    const signingOpIdHash = getSigningOpIdHash(walletId, signingOpId);
    const op = await AleoUtils.getNetworkClient().getProgramMappingValue(
        "multisig_core.aleo",
        "pending_signing_ops",
        signingOpIdHash
    );

    if (op == null) return null;

    return Plaintext.fromString(op).toObject();
}

/**
 * Check if a given Aleo address is a signer for the specified wallet
 *
 * @param {string} walletId - Wallet identifier
 * @param {string} userAddress - Address to check if it's a signer
 * @returns {Promise<boolean>} True if the address is a signer, false otherwise
 *
 * @example
 * const isAleoSignerResult = await isAleoSigner(walletId, "aleo1example...");
 * if (isAleoSignerResult) {
 *   console.log("Address is a signer for this wallet");
 * } else {
 *   console.log("Address is not a signer for this wallet");
 * }
 */
export async function isAleoSigner(walletId, userAddress) {
    // Create the WalletAleoSigner struct to match Leo code structure
    const walletSignerStruct = Plaintext.fromString(`{wallet_id: ${walletId}, aleo_signer: ${userAddress} }`);

    // Hash it to get the key used in signers_map
    const hasher = new BHP256();
    const walletSignerHash = hasher.hash(walletSignerStruct.toBitsLe()).toString();

    // Check if this hash exists in the signers_map
    const signerEntry = await AleoUtils.getNetworkClient().getProgramMappingValue(
        "multisig_core.aleo",
        "signers_map",
        walletSignerHash
    );

    // If the entry exists and is 'true', then this address is a signer
    return signerEntry === 'true';
}

/**
 * Check if a given Ethereum address is a signer for the specified wallet
 *
 * @param {string} walletId - Wallet identifier
 * @param {string} ethAddress - Ethereum address to check if it's a signer (e.g., "0x...")
 * @returns {Promise<boolean>} True if the address is a signer, false otherwise
 *
 * @example
 * const isEcdsaSignerResult = await isEcdsaSigner(walletId, "0x1234...");
 * if (isEcdsaSignerResult) {
 *   console.log("Address is a signer for this wallet");
 * } else {
 *   console.log("Address is not a signer for this wallet");
 * }
 */
export async function isEcdsaSigner(walletId, ethAddress) {
    // Convert Ethereum address to bytes
    const ethAddrBytes = getBytes(ethAddress);
    const ethAddrPlaintext = AleoUtils.bytesToPlaintext(ethAddrBytes);

    // Create the WalletEcdsaSigner struct to match Leo code structure
    const walletSignerStruct = Plaintext.fromString(`{wallet_id: ${walletId}, ecdsa_signer: ${ethAddrPlaintext} }`);

    // Hash it to get the key used in signers_map
    const hasher = new BHP256();
    const walletSignerHash = hasher.hash(walletSignerStruct.toBitsLe()).toString();

    // Check if this hash exists in the signers_map
    const signerEntry = await AleoUtils.getNetworkClient().getProgramMappingValue(
        "multisig_core.aleo",
        "signers_map",
        walletSignerHash
    );

    // If the entry exists and is 'true', then this address is a signer
    return signerEntry === 'true';
}

/**
 * Generic function to initiate an admin operation
 *
 * @param {Account} adminAccount - Account initiating the admin operation (must be a signer)
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - Unique identifier for this admin operation (use Field.random().toString())
 * @param {number} op - Admin operation type (1=threshold, 2=add signer, 3=remove signer)
 * @param {number} threshold - Threshold value (only used for op=1, set to 0 for others)
 * @param {string} aleoSigner - Aleo user address to add as signer (only used for op=2,3, set to ALEO_ZERO_ADDR for op=1)
 * @param {string} ecdsaSigner - Eth user address to add as signer (only used for op=2,3, set to ETH_ZERO_ADDR for op=1)
 * @param {number} blockExpiration - Number of blocks until the signing operation expires
 * @returns {Promise<Object>} The transaction object containing admin operation initiation details
 */
export async function initAdminOp(adminAccount, walletId, signingOpId, op, threshold = 0, aleoSigner = null, ecdsaSigner = null, blockExpiration = DEFAULT_BLOCK_EXPIRATION) {
    console.log(`Initiating admin operation ${op} for wallet ${walletId}...`);

    const aleoAddr = aleoSigner || AleoUtils.ALEO_ZERO_ADDR;
    const ethAddr = AleoUtils.bytesToPlaintext(getBytes(ecdsaSigner || AleoUtils.ETH_ZERO_ADDR));

    const adminOp = `{ op: ${op}u8, threshold: ${threshold}u8, aleo_signer: ${aleoAddr}, ecdsa_signer: ${ethAddr} }`;

    const transaction = await AleoUtils.transact(
        adminAccount,
        "multisig_core.aleo",
        "init_admin_op",
        [walletId, signingOpId, `${blockExpiration}u32`, adminOp]
    );

    console.log(`Admin operation ${op} initiated for wallet ${walletId}`);
    return transaction;
}

/**
 * Generic function to execute an admin operation (after required signatures collected)
 *
 * @param {Account} executorAccount - Account executing the admin operation
 * @param {string} walletId - Wallet identifier
 * @param {string} signingOpId - The signing operation identifier used in initAdminOp
 * @param {number} op - Admin operation type (1=threshold, 2=add signer, 3=remove signer)
 * @param {number} threshold - Threshold value (only used for op=1, set to 0 for others)
 * @param {string} aleoSigner - Aleo user address to add as signer (only used for op=2,3, set to ALEO_ZERO_ADDR for op=1)
 * @param {string} ecdsaSigner - Eth user address to add as signer (only used for op=2,3, set to ETH_ZERO_ADDR for op=1)
 * @returns {Promise<Object>} The transaction object containing admin operation execution details
 */
async function execAdminOp(executorAccount, walletId, signingOpId, op, threshold = 0, aleoSigner = null, ecdsaSigner = null) {
    console.log(`Executing admin operation ${op} for wallet ${walletId}...`);

    const aleoAddr = aleoSigner || AleoUtils.ALEO_ZERO_ADDR;
    const ethAddr = AleoUtils.bytesToPlaintext(getBytes(ecdsaSigner || AleoUtils.ETH_ZERO_ADDR));

    const adminOp = `{ op: ${op}u8, threshold: ${threshold}u8, aleo_signer: ${aleoAddr}, ecdsa_signer: ${ethAddr} }`;

    const transaction = await AleoUtils.transact(
        executorAccount,
        "multisig_core.aleo",
        "exec_admin_op",
        [walletId, signingOpId, adminOp]
    );

    console.log(`Admin operation ${op} executed for wallet ${walletId}`);
    return transaction;
}

/**
 * Administrative operation: Set threshold for the multisig wallet
 *
 * @param {Account} adminAccount - Account initiating the admin operation (must be a signer)
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - Unique identifier for this admin operation (use Field.random())
 * @param {number} newThreshold - New threshold value (1-4)
 * @returns {Promise<Object>} The transaction object containing admin operation initiation details
 *
 * @example
 * import { Field } from "@provablehq/sdk";
 *
 * const signingOpId = Field.random();
 * await adminOpSetThreshold(accounts[0], walletId, signingOpId, 3);
 */
export async function adminOpSetThreshold(adminAccount, walletId, signingOpId, newThreshold, blockExpiration = DEFAULT_BLOCK_EXPIRATION) {
    return await initAdminOp(
        adminAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_CHANGE_THRESHOLD,
        newThreshold,
        AleoUtils.ALEO_ZERO_ADDR,
        null,
        blockExpiration
    );
}

/**
 * Execute administrative operation: Set threshold (after required signatures collected)
 *
 * @param {Account} executorAccount - Account executing the admin operation
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - The signing operation identifier used in adminOpSetThreshold
 * @param {number} newThreshold - New threshold value (must match the one used in init)
 * @returns {Promise<Object>} The transaction object containing admin operation execution details
 *
 * @example
 * await execAdminOpSetThreshold(accounts[0], walletId, signingOpId, 3);
 */
export async function execAdminOpSetThreshold(executorAccount, walletId, signingOpId, newThreshold) {
    return await execAdminOp(
        executorAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_CHANGE_THRESHOLD,
        newThreshold,
        AleoUtils.ALEO_ZERO_ADDR
    );
}

/**
 * Administrative operation: Add Aleo signer to the multisig wallet
 *
 * @param {Account} adminAccount - Account initiating the admin operation (must be a signer)
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - Unique identifier for this admin operation (use Field.random())
 * @param {string} newSignerAddress - Aleo address of the new signer to add
 * @returns {Promise<Object>} The transaction object containing admin operation initiation details
 *
 * @example
 * import { Field } from "@provablehq/sdk";
 *
 * const signingOpId = Field.random();
 * await adminOpAddAleoSigner(accounts[0], walletId, signingOpId, "aleo1new...");
 */
export async function adminOpAddAleoSigner(adminAccount, walletId, signingOpId, newSignerAddress, blockExpiration = DEFAULT_BLOCK_EXPIRATION) {
    return await initAdminOp(
        adminAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_ADD_SIGNER,
        0,
        newSignerAddress,
        null,
        blockExpiration
    );
}

/**
 * Execute administrative operation: Add Aleo signer (after required signatures collected)
 *
 * @param {Account} executorAccount - Account executing the admin operation
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - The signing operation identifier used in adminOpAddAleoSigner
 * @param {string} newSignerAddress - Aleo address of the new signer (must match the one used in init)
 * @returns {Promise<Object>} The transaction object containing admin operation execution details
 *
 * @example
 * await execAdminOpAddAleoSigner(accounts[0], walletId, signingOpId, "aleo1new...");
 */
export async function execAdminOpAddAleoSigner(executorAccount, walletId, signingOpId, newSignerAddress) {
    return await execAdminOp(
        executorAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_ADD_SIGNER,
        0,
        newSignerAddress,
        null,
    );
}

/**
 * Administrative operation: Remove Aleo signer from the multisig wallet
 *
 * @param {Account} adminAccount - Account initiating the admin operation (must be a signer)
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - Unique identifier for this admin operation (use Field.random())
 * @param {string} signerToRemove - Aleo address of the signer to remove
 * @returns {Promise<Object>} The transaction object containing admin operation initiation details
 *
 * @example
 * import { Field } from "@provablehq/sdk";
 *
 * const signingOpId = Field.random();
 * await adminOpRemoveAleoSigner(accounts[0], walletId, signingOpId, "aleo1remove...");
 */
export async function adminOpRemoveAleoSigner(adminAccount, walletId, signingOpId, signerToRemove, blockExpiration = DEFAULT_BLOCK_EXPIRATION) {
    return await initAdminOp(
        adminAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_REMOVE_SIGNER,
        0,
        signerToRemove,
        null,
        blockExpiration
    );
}

/**
 * Execute administrative operation: Remove signer (after required signatures collected)
 *
 * @param {Account} executorAccount - Account executing the admin operation
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - The signing operation identifier used in adminOpRemoveAleoSigner
 * @param {string} signerToRemove - Aleo address of the signer to remove (must match the one used in init)
 * @returns {Promise<Object>} The transaction object containing admin operation execution details
 *
 * @example
 * await execAdminOpRemoveAleoSigner(accounts[0], walletId, signingOpId, "aleo1remove...");
 */
export async function execAdminOpRemoveAleoSigner(executorAccount, walletId, signingOpId, signerToRemove) {
    return await execAdminOp(
        executorAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_REMOVE_SIGNER,
        0,
        signerToRemove
    );
}

/**
 * Administrative operation: Add ECDSA signer to the multisig wallet
 *
 * @param {Account} adminAccount - Account initiating the admin operation (must be a signer)
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - Unique identifier for this admin operation (use Field.random())
 * @param {string} ethAddress - Ethereum address of the new signer to add (e.g., "0x...")
 * @returns {Promise<Object>} The transaction object containing admin operation initiation details
 *
 * @example
 * import { Field } from "@provablehq/sdk";
 *
 * const signingOpId = Field.random();
 * await adminOpAddEcdsaSigner(accounts[0], walletId, signingOpId, "0x1234...");
 */
export async function adminOpAddEcdsaSigner(adminAccount, walletId, signingOpId, ethAddress, blockExpiration = DEFAULT_BLOCK_EXPIRATION) {
    return await initAdminOp(
        adminAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_ADD_SIGNER,
        0,
        null,
        ethAddress,
        blockExpiration
    );
}

/**
 * Execute administrative operation: Add ECDSA signer (after required signatures collected)
 *
 * @param {Account} executorAccount - Account executing the admin operation
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - The signing operation identifier used in adminOpAddEcdsaSigner
 * @param {string} ethAddress - Ethereum address of the new signer (must match the one used in init)
 * @returns {Promise<Object>} The transaction object containing admin operation execution details
 *
 * @example
 * await execAdminOpAddEcdsaSigner(accounts[0], walletId, signingOpId, "0x1234...");
 */
export async function execAdminOpAddEcdsaSigner(executorAccount, walletId, signingOpId, ethAddress) {
    return await execAdminOp(
        executorAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_ADD_SIGNER,
        0,
        null,
        ethAddress,
    );
}

/**
 * Administrative operation: Remove ECDSA signer from the multisig wallet
 *
 * @param {Account} adminAccount - Account initiating the admin operation (must be a signer)
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - Unique identifier for this admin operation (use Field.random())
 * @param {string} ethAddress - Ethereum address of the signer to remove (e.g., "0x...")
 * @returns {Promise<Object>} The transaction object containing admin operation initiation details
 *
 * @example
 * import { Field } from "@provablehq/sdk";
 *
 * const signingOpId = Field.random();
 * await adminOpRemoveEcdsaSigner(accounts[0], walletId, signingOpId, "0x1234...");
 */
export async function adminOpRemoveEcdsaSigner(adminAccount, walletId, signingOpId, ethAddress, blockExpiration = DEFAULT_BLOCK_EXPIRATION) {
    return await initAdminOp(
        adminAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_REMOVE_SIGNER,
        0,
        null,
        ethAddress,
        blockExpiration
    );
}

/**
 * Execute administrative operation: Remove ECDSA signer (after required signatures collected)
 *
 * @param {Account} executorAccount - Account executing the admin operation
 * @param {string} walletId - Wallet identifier
 * @param {Field} signingOpId - The signing operation identifier used in adminOpRemoveEcdsaSigner
 * @param {string} ethAddress - Ethereum address of the signer to remove (must match the one used in init)
 * @returns {Promise<Object>} The transaction object containing admin operation execution details
 *
 * @example
 * await execAdminOpRemoveEcdsaSigner(accounts[0], walletId, signingOpId, "0x1234...");
 */
export async function execAdminOpRemoveEcdsaSigner(executorAccount, walletId, signingOpId, ethAddress) {
    return await execAdminOp(
        executorAccount,
        walletId,
        signingOpId.toString(),
        ADMIN_OP_REMOVE_SIGNER,
        0,
        null,
        ethAddress,
    );
}

/**
 * Compute the signing_op_id for a guarded create_wallet operation.
 * This matches the hash computed in the Leo program for GuardedCreateWalletOp.
 *
 * @param {string} walletId - The wallet ID to be created
 * @param {number} threshold - The threshold for the new wallet
 * @param {string[]} aleoSigners - Array of Aleo signer addresses (max 4)
 * @param {string[]} ecdsaSigners - Array of ETH signer addresses (max 4)
 * @returns {string} The signing_op_id field value
 */
export function getGuardedCreateWalletSigningOpId(walletId, threshold, aleoSigners = [], ecdsaSigners = []) {
    const paddedAleoSigners = [...aleoSigners];
    while (paddedAleoSigners.length < 4) {
        paddedAleoSigners.push(AleoUtils.ALEO_ZERO_ADDR);
    }

    const paddedEcdsaSigners = [...ecdsaSigners];
    while (paddedEcdsaSigners.length < 4) {
        paddedEcdsaSigners.push(AleoUtils.ETH_ZERO_ADDR);
    }
    const paddedPlaintextEcdsaSigners = paddedEcdsaSigners.map((addrStr) => AleoUtils.bytesToPlaintext(getBytes(addrStr)));

    const struct = `{ wallet_id: ${walletId}, threshold: ${threshold}u8, aleo_signers: [${paddedAleoSigners.join(', ')}], ecdsa_signers: [${paddedPlaintextEcdsaSigners.join(', ')}] }`;
    return AleoUtils.BHP256Hash(struct);
}
