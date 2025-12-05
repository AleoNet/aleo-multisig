// The 'test_msw_credits_multiwallet' test program.
import msw_credits_multiwallet.aleo;
import token_registry.aleo;

program test_msw_credits_multiwallet.aleo {
    const TEST_TOKEN_ID: field = 1751493913335802797273486270793650302076377624243810059080883537084141842600field;

    const ADDR1: address = aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px;

    @test(private_key="APrivateKey1zkp8CZNn3yeCseEtxuVPbDCwSyhGW6yZKUYKfgXmcpoGPWH") // ADDR1
    script test_setup() {
        let f1 = token_registry.aleo/initialize();
        f1.await();

        let f2 = token_registry.aleo/register_token(TEST_TOKEN_ID, 123u128, 123u128, 6u8, 1_000_000_000u128, false, ADDR1);
        f2.await();
    }

    @test
    transition do_nothing() { }

    // @test
    // @should_fail
    // transition do_nothing() {
    //     let result: u32 = msw_credits_multiwallet.aleo/main(2u32, 3u32);
    //     assert_eq(result, 3u32);
    // }

    @noupgrade
    async constructor() {}
}
