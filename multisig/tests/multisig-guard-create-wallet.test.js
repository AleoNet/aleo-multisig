import * as AleoUtils from './lib/aleo-test-utils.js';
import * as MultiSig from './contracts/multisig.js';

describe('Multisig Guard Create Wallet Tests', () => {
    beforeAll(async() => {
        const programSettings = await MultiSig.getProgramSettings();
        if (programSettings === null) {
            throw 'The multisig_core program has not been initialized yet.'
        }

        console.log('Program settings:', programSettings);

        if (programSettings.guard_create_wallet !== true) {
            throw 'The tests can only run when the guard_create_wallet is set to true.'
        }

        const guardWalletId = "multisig_core.aleo";
        const guardWallet = await MultiSig.getWallet(guardWalletId);

        if (guardWallet === null) {
            throw `The special guard wallet '${guardWalletId}' does not exist.`;
        }

        console.log('Guard wallet found:', guardWallet);
    });

    test('Cannot create wallet without signatures from guard wallet', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        const guardWalletId = "multisig_core.aleo";
        const threshold = 2;
        const aleoSigners = [AleoUtils.addresses[0], AleoUtils.addresses[1]];
        const ecdsaSigners = [];

        // Step 1: Try to create a wallet (should fail)
        console.log(`Attempting to create wallet ${TEST_WALLET_ID} (should fail without guard approval)...`);
        try {
            await MultiSig.createWallet(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                threshold,
                aleoSigners,
                ecdsaSigners
            );
            fail('Expected wallet creation to fail without guard wallet signature');
        } catch (error) {
            expect(error.message).toContain('Transaction failed');
        }

        // Verify wallet was not created
        let wallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet).toBeNull();

        // Step 2: Initiate signing operation on the guard wallet
        const signingOpId = MultiSig.getGuardedCreateWalletSigningOpId(TEST_WALLET_ID, threshold, aleoSigners, ecdsaSigners);

        console.log(`Initiating signing operation on guard wallet for new wallet ${TEST_WALLET_ID}...`);
        await MultiSig.initiateSigningOp(AleoUtils.accounts[0], guardWalletId, signingOpId);

        // Step 3: Verify create_wallet still fails (only 1 signature, threshold is 2)
        console.log('Attempting to create wallet again (should still fail - 1/2 signatures)...');
        try {
            await MultiSig.createWallet(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                threshold,
                aleoSigners,
                ecdsaSigners
            );
            fail('Expected wallet creation to fail with insufficient guard signatures');
        } catch (error) {
            console.log('Wallet creation correctly rejected:', error.message);
            expect(error.message).toContain('Transaction failed');
        }

        // Step 4: Add signature from unrelated signer
        console.log('Attempting to sign with unrelated signer...');
        try {
            // accounts[2] is not a signer for the guard wallet (assuming it uses accounts[0] and accounts[1])
            await MultiSig.sign(AleoUtils.accounts[2], guardWalletId, signingOpId.toString());
            fail('Expected signing with unrelated account to fail');
        } catch (error) {
            console.log('Unrelated signer correctly rejected:', error.message);
            expect(error.message).toContain('Transaction failed');
        }

        // Step 5: Add signature from second valid signer
        console.log('Adding second signature from valid signer (accounts[1])...');
        await MultiSig.sign(AleoUtils.accounts[1], guardWalletId, signingOpId.toString());

        // Verify signing is complete
        const isComplete = await MultiSig.isSigningComplete(guardWalletId, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Guard wallet signing operation completed');

        // Step 6: Create wallet (should succeed now)
        console.log('Attempting to create wallet again (should succeed)...');
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            threshold,
            aleoSigners,
            ecdsaSigners
        );

        // Verify wallet was created
        wallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet).not.toBeNull();
        expect(wallet.threshold).toBe(2);
        console.log('Wallet created successfully!');
    });

    test('Can create wallet after guard wallet approves with correct parameters', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        const guardWalletId = "multisig_core.aleo";
        const threshold = 1;
        const aleoSigners = [AleoUtils.addresses[2]];
        const ecdsaSigners = [];

        // Compute the signing_op_id for the guarded create wallet op
        const signingOpId = MultiSig.getGuardedCreateWalletSigningOpId(TEST_WALLET_ID, threshold, aleoSigners, ecdsaSigners);

        // Step 1: Initiate signing operation on the guard wallet
        console.log(`Initiating signing operation on guard wallet for new wallet ${TEST_WALLET_ID}...`);
        await MultiSig.initiateSigningOp(AleoUtils.accounts[0], guardWalletId, signingOpId);

        // Step 2: Add second signature to complete the signing
        console.log('Adding second signature from accounts[1]...');
        await MultiSig.sign(AleoUtils.accounts[1], guardWalletId, signingOpId.toString());

        // Verify signing is complete
        const isComplete = await MultiSig.isSigningComplete(guardWalletId, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Guard wallet signing operation completed');

        // Step 3: Create wallet (should succeed)
        console.log('Creating wallet...');
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            threshold,
            aleoSigners,
            ecdsaSigners
        );

        // Verify wallet was created
        const wallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet).not.toBeNull();
        expect(wallet.threshold).toBe(1);
        expect(wallet.num_signers).toBe(1);
        console.log('Wallet created successfully!');
    });

    test('Cannot call set_upgrader_address from non-upgrader address', async () => {
        // accounts[0] is not the upgrader (upgrader is accounts[1])
        try {
            await AleoUtils.transact(
                AleoUtils.accounts[0],
                "multisig_core.aleo",
                "set_upgrader_address",
                [AleoUtils.addresses[2]]
            );
            fail('Expected set_upgrader_address to fail when called from non-upgrader address');
        } catch (error) {
            expect(error.message).toContain('Transaction failed');
        }
    });

    test('Can change upgrader_address from valid upgrader', async () => {
        // Get initial settings to confirm upgrader is addresses[1]
        let settings = await MultiSig.getProgramSettings();
        expect(settings.upgrader_address).toBe(AleoUtils.addresses[1]);

        // Change upgrader to addresses[2]
        console.log('Changing upgrader_address to addresses[2]...');
        await AleoUtils.transact(
            AleoUtils.accounts[1],
            "multisig_core.aleo",
            "set_upgrader_address",
            [AleoUtils.addresses[2]]
        );

        // Verify the change
        settings = await MultiSig.getProgramSettings();
        expect(settings.upgrader_address).toBe(AleoUtils.addresses[2]);
        console.log('Upgrader address changed to:', settings.upgrader_address);

        // Change it back to addresses[1]
        console.log('Changing upgrader_address back to addresses[1]...');
        await AleoUtils.transact(
            AleoUtils.accounts[2],
            "multisig_core.aleo",
            "set_upgrader_address",
            [AleoUtils.addresses[1]]
        );

        // Verify the change back
        settings = await MultiSig.getProgramSettings();
        expect(settings.upgrader_address).toBe(AleoUtils.addresses[1]);
        console.log('Upgrader address restored to:', settings.upgrader_address);
    });

    test('Cannot initialize multisig_core twice', async () => {
        try {
            await AleoUtils.transact(
                AleoUtils.accounts[0],
                "multisig_core.aleo",
                "init",
                [AleoUtils.addresses[0], "true"]
            );
            fail('Expected re-initialization with true to fail');
        } catch (error) {
            expect(error.message).toContain('Transaction failed');
        }

        try {
             await AleoUtils.transact(
                AleoUtils.accounts[0],
                "multisig_core.aleo",
                "init",
                [AleoUtils.addresses[0], "false"]
            );
            fail('Expected re-initialization with false to fail');
        } catch (error) {
            expect(error.message).toContain('Transaction failed');
        }
    });
});
