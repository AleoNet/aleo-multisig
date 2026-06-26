// A unique identifier for a signing operation. Combining the user-provided signing_op_id
// together with the wallet_id lets different wallets use the same signing_op_id across
// different wallets.
struct WalletSigningOpId {
    wallet_id: address,
    signing_op_id: field,
}

// A version of the above struct that includes a nonce.
struct WalletSigningOpIdNonce {
    wallet_id: address,
    signing_op_id: field,
    nonce: u64,
}

// Data stored for a signing operation
struct WalletSigningOp {
    // Number of valid signatures received so far.
    confirmations: u8,
    // The block height the signing op was initiated at.
    initiated_at_block: u32,
    // The last block.height we will accept signatures at.
    // If set to MAX_BLOCK_HEIGHT, the signing operation will never expire.
    expires_at_block: u32,
    // Round number: This starts at 1 and increases every time signing is initiated using the same signing_op_id.
    // (a previously-used signing_op_id can only be used again after expiration)
    round: u32,
}

// A confirmation that a specific signing operation (identified by a hash of
// WalletSigningOpId) has been signed by a specific user (identified by a hash of WalletAleoSigner/WalletEcdsaSigner)
struct SigningOpConfirmation {
    wallet_signing_op_id_hash: field,
    wallet_signer_hash: field,
}
