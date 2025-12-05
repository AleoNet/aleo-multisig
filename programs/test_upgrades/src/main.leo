import multisig_core.aleo;

// An example showing how to use the multisig wallet for gating program upgrades.
// In order to try out this example, take the following steps:
// 1. Start a devnode: $LEO devnode start
// 2. Advance consensus height: $LEO devnode advance 20
// 3. Deploy the multisig_core program (cd multisig/programs/multisig_core && $LEO deploy --broadcast --consensus-heights 0,1,2,3,4,5,6,7,8,9,10,11 -y)
// 4. Create the multisig wallet for the test_upgrades.aleo program: ./exec_create_wallet.sh
// 5. Deploy the test_upgrades program: $LEO deploy --broadcast --consensus-heights 0,1,2,3,4,5,6,7,8,9,10,11 -y --skip multisig_core
// 6. Do a multisig operation followed by an upgrade: ./exec_sign_upgrade.sh (note that the program checksum is hardcoded, if you edit the program
//    you will need to update the checksum in the script)
program test_upgrades.aleo {
    struct ChecksumEdition {
        checksum: [u8; 32],
        edition: u16,
    }

    // A helper for calculating a signing_op_id from the program's checksum and edition.
    // By deriving the signing_op_id from both we ensure that downgrades cannot take place.
    transition get_signing_op_id_for_deploy(checksum: [u8; 32], edition: u16) -> field {
        return BHP256::hash_to_field(ChecksumEdition { checksum: checksum, edition: edition });
    }

    @custom
    async constructor() {
        // Only require multisig for upgrades - initial deployment has no checks.
        if self.edition > 0u16 {
            let signing_op_id = BHP256::hash_to_field(ChecksumEdition { checksum: self.checksum, edition: self.edition });

            let wallet_signing_op_id_hash = BHP256::hash_to_field(WalletSigningOpId { wallet_id: self.address, signing_op_id: signing_op_id });
            let signing_complete = multisig_core.aleo/completed_signing_ops.contains(wallet_signing_op_id_hash);
            assert(signing_complete);
        }
    }

    transition main(public a: u32, b: u32) -> u32 {
        let c: u32 = a + b;
        return c;
    }
}
