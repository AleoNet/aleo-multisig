const ADMIN_OP_INVALID: u8 = 0;
const ADMIN_OP_CHANGE_THRESHOLD: u8 = 1;
const ADMIN_OP_ADD_SIGNER: u8 = 2;
const ADMIN_OP_REMOVE_SIGNER: u8 = 3;

// An administrative operation
struct AdminOp {
    op: u8,
    // Only used for ADMIN_OP_CHANGE_THRESHOLD
    threshold: u8,
    // Only used for ADMIN_OP_ADD_SIGNER and ADMIN_OP_REMOVE_SIGNER.
    // Only one of the two can be provided, the other has to be set to the zero address.
    aleo_signer: address,
    ecdsa_signer: [u8; 20],
}
