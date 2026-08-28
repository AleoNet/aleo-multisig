// The 'test_msw_multisig_impl' test program.
import multisig_core.aleo;

const TEST_WALLET_ID: address = aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px;

program test_msw_multisig_impl.aleo {
    @test
    fn test_get_signing_op_id_hash() {
        let first = multisig_core.aleo::get_signing_op_id_hash(TEST_WALLET_ID, 1field);
        let second = multisig_core.aleo::get_signing_op_id_hash(TEST_WALLET_ID, 2field);
        assert_neq(first, second);
    }

    @test
    @should_fail
    fn test_signing_hash_mismatch() {
        let first = multisig_core.aleo::get_signing_op_id_hash(TEST_WALLET_ID, 1field);
        let second = multisig_core.aleo::get_signing_op_id_hash(TEST_WALLET_ID, 2field);
        assert_eq(first, second);
    }

    @noupgrade
    constructor() {}
}
