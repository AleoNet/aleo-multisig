import { Field, Plaintext, BHP256 } from '@provablehq/sdk';
import * as AleoUtils from './lib/aleo-test-utils.js';
import * as MultiSig from './contracts/multisig.js';
import { Wallet, getBytes } from "ethers";


describe('Multisig Tests', () => {
    beforeAll(async() => {
        const programSettings = await MultiSig.getProgramSettings();
        if (programSettings === null) {
            throw 'The multisig_core program has not been initialized yet.'
        }

        if (programSettings.guard_create_wallet !== false) {
            throw 'The tests can only run when the guard_create_wallet is set to false.'
        }
    });

    test('Can update threshold', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], [], true);

        // Get initial wallet settings
        const initialWallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(initialWallet).not.toBeNull();
        expect(initialWallet.threshold).toBe(2);
        expect(initialWallet.num_signers).toBe(2);

        console.log(`Initial wallet threshold: ${initialWallet.threshold}`);

        // Generate a unique signing operation ID
        const signingOpId = Field.random();
        const newThreshold = 1; // Change from 2 to 1

        // Step 1: Initiate the admin operation to change threshold (provides first signature)
        console.log(`Initiating admin operation to change threshold from ${initialWallet.threshold} to ${newThreshold}...`);
        const initTx = await MultiSig.adminOpSetThreshold(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId, newThreshold);

        // After init, we should have 1 signature, but signing should not be complete yet (threshold is 2)
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing not complete after init (as expected)');

        // Step 2: Test that we cannot execute without sufficient signatures
        console.log('Testing that execution fails without sufficient signatures...');
        try {
            await MultiSig.execAdminOpSetThreshold(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId, newThreshold);
            fail('Expected execution to fail without sufficient signatures');
        } catch (error) {
            console.log('Execution correctly failed without sufficient signatures:', error.message);
        }

        // Step 3: Test that signing with an unrelated signer doesn't help
        console.log('Testing that unrelated signer cannot sign...');
        try {
            // accounts[2] is not a signer for this wallet
            await MultiSig.sign(AleoUtils.accounts[2], TEST_WALLET_ID, signingOpId.toString());
            fail('Expected signing with unrelated account to fail');
        } catch (error) {
            console.log('Unrelated signer correctly rejected:', error.message);
        }

        // Verify signing is still not complete
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);

        // Step 4: Add the second signature from a valid signer
        console.log('Adding second signature from valid signer...');
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString());

        // Step 5: Verify signing is now complete
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Signing operation completed');

        // Step 6: Execute the admin operation
        console.log('Executing admin operation to change threshold...');
        const execTx = await MultiSig.execAdminOpSetThreshold(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId, newThreshold);

        // Step 7: Verify the threshold was actually changed
        const updatedWallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(updatedWallet).not.toBeNull();
        expect(updatedWallet.threshold).toBe(newThreshold);
        expect(updatedWallet.num_signers).toBe(2); // Number of signers should remain the same

        console.log(`Updated wallet threshold: ${updatedWallet.threshold}`);
        console.log('Threshold update test completed successfully!');
    });

    test('Can add and remove Aleo signers', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], [], true);

        // Test address to add/remove as signer
        const newSignerAddress = AleoUtils.addresses[2]; // accounts[2] address

        // Step 1: Verify the new address is not currently a signer
        let isAleoSignerBefore = await MultiSig.isAleoSigner(TEST_WALLET_ID, newSignerAddress);
        expect(isAleoSignerBefore).toBe(false);
        console.log(`Address ${newSignerAddress} is not a signer (as expected)`);

        // Get initial wallet settings
        const initialWallet = await MultiSig.getWallet(TEST_WALLET_ID);
        console.log(`Initial wallet: threshold=${initialWallet.threshold}, num_signers=${initialWallet.num_signers}`);

        // === ADD SIGNER TEST ===

        // Step 2: Initiate admin operation to add signer
        const addSigningOpId = Field.random();
        console.log(`Initiating admin operation to add signer ${newSignerAddress}...`);
        await MultiSig.adminOpAddAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, newSignerAddress);

        // Step 3: Add second signature to reach threshold (current threshold is 1 from previous test)
        console.log('Adding signature to complete add signer operation...');
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, addSigningOpId.toString());

        // Step 4: Verify signing is complete
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, addSigningOpId.toString());
        expect(isComplete).toBe(true);

        // Step 5: Execute the add signer operation
        console.log('Executing add signer operation...');
        await MultiSig.execAdminOpAddAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, newSignerAddress);

        // Step 6: Verify the signer was added
        let isAleoSignerAfterAdd = await MultiSig.isAleoSigner(TEST_WALLET_ID, newSignerAddress);
        expect(isAleoSignerAfterAdd).toBe(true);
        console.log(`Address ${newSignerAddress} is now a signer!`);

        // Step 7: Verify wallet settings updated
        const walletAfterAdd = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(walletAfterAdd.threshold).toBe(2); // Should remain the same
        expect(walletAfterAdd.num_signers).toBe(3); // Should increase by 1
        console.log(`Wallet after add: threshold=${walletAfterAdd.threshold}, num_signers=${walletAfterAdd.num_signers}`);

        // === REMOVE SIGNER TEST ===

        // Step 8: Initiate admin operation to remove the signer we just added
        const removeSigningOpId = Field.random();
        console.log(`Initiating admin operation to remove signer ${newSignerAddress}...`);
        await MultiSig.adminOpRemoveAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, removeSigningOpId, newSignerAddress);

        // Step 9: Add second signature to reach threshold
        console.log('Adding signature to complete remove signer operation...');
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, removeSigningOpId.toString());

        // Step 10: Verify signing is complete
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, removeSigningOpId.toString());
        expect(isComplete).toBe(true);

        // Step 11: Execute the remove signer operation
        console.log('Executing remove signer operation...');
        await MultiSig.execAdminOpRemoveAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, removeSigningOpId, newSignerAddress);

        // Step 12: Verify the signer was removed
        let isAleoSignerAfterRemove = await MultiSig.isAleoSigner(TEST_WALLET_ID, newSignerAddress);
        expect(isAleoSignerAfterRemove).toBe(false);
        console.log(`Address ${newSignerAddress} is no longer a signer!`);

        // Step 13: Verify wallet settings updated
        const walletAfterRemove = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(walletAfterRemove.threshold).toBe(2); // Should remain the same
        expect(walletAfterRemove.num_signers).toBe(2); // Should be back to original
        console.log(`Wallet after remove: threshold=${walletAfterRemove.threshold}, num_signers=${walletAfterRemove.num_signers}`);

        // === RE-EXECUTION PREVENTION TEST ===

        // Step 14: Try to re-execute the add signer operation (should fail)
        console.log('Testing that re-executing add signer operation fails...');
        await expect(
            MultiSig.execAdminOpAddAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, newSignerAddress)
        ).rejects.toThrow();

        // Step 15: Verify the signer status hasn't changed (still false after removal)
        let isAleoSignerAfterReexec = await MultiSig.isAleoSigner(TEST_WALLET_ID, newSignerAddress);
        expect(isAleoSignerAfterReexec).toBe(false);
        console.log(`Address ${newSignerAddress} is still not a signer (re-execution prevented)`);

        // Step 16: Verify wallet settings haven't changed
        const walletAfterReexec = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(walletAfterReexec.threshold).toBe(2);
        expect(walletAfterReexec.num_signers).toBe(2);

        console.log('Add/remove signer test completed successfully!');
    });

    test('Wallet isolation', async () => {
        // Create two wallets with different configurations
        const WALLET_1_ID = AleoUtils.randomAddress();
        const WALLET_2_ID = AleoUtils.randomAddress();

        console.log(`Creating Wallet 1: ${WALLET_1_ID}`);
        console.log(`Creating Wallet 2: ${WALLET_2_ID}`);

        // Wallet 1: threshold=1, signers=accounts[0],accounts[1]
        await MultiSig.createWallet(AleoUtils.accounts[0], WALLET_1_ID, 1, [AleoUtils.addresses[0], AleoUtils.addresses[1]]);

        // Wallet 2: threshold=3, signers=accounts[1],accounts[2],accounts[3]
        await MultiSig.createWallet(AleoUtils.accounts[1], WALLET_2_ID, 3, [AleoUtils.addresses[1], AleoUtils.addresses[2], AleoUtils.addresses[3]]);

        // === VERIFY WALLET SETTINGS ===

        // Verify Wallet 1 settings
        const wallet1Settings = await MultiSig.getWallet(WALLET_1_ID);
        expect(wallet1Settings).not.toBeNull();
        expect(wallet1Settings.threshold).toBe(1);
        expect(wallet1Settings.num_signers).toBe(2);
        console.log(`Wallet 1 settings: threshold=${wallet1Settings.threshold}, num_signers=${wallet1Settings.num_signers}`);

        // Verify Wallet 2 settings
        const wallet2Settings = await MultiSig.getWallet(WALLET_2_ID);
        expect(wallet2Settings).not.toBeNull();
        expect(wallet2Settings.threshold).toBe(3);
        expect(wallet2Settings.num_signers).toBe(3);
        console.log(`Wallet 2 settings: threshold=${wallet2Settings.threshold}, num_signers=${wallet2Settings.num_signers}`);

        // === VERIFY SIGNER ISOLATION ===

        // Verify Wallet 1 signers
        expect(await MultiSig.isAleoSigner(WALLET_1_ID, AleoUtils.addresses[0])).toBe(true);
        expect(await MultiSig.isAleoSigner(WALLET_1_ID, AleoUtils.addresses[1])).toBe(true);
        expect(await MultiSig.isAleoSigner(WALLET_1_ID, AleoUtils.addresses[2])).toBe(false);
        expect(await MultiSig.isAleoSigner(WALLET_1_ID, AleoUtils.addresses[3])).toBe(false);
        console.log('Wallet 1 signer verification passed');

        // Verify Wallet 2 signers
        expect(await MultiSig.isAleoSigner(WALLET_2_ID, AleoUtils.addresses[0])).toBe(false);
        expect(await MultiSig.isAleoSigner(WALLET_2_ID, AleoUtils.addresses[1])).toBe(true);
        expect(await MultiSig.isAleoSigner(WALLET_2_ID, AleoUtils.addresses[2])).toBe(true);
        expect(await MultiSig.isAleoSigner(WALLET_2_ID, AleoUtils.addresses[3])).toBe(true);
        console.log('Wallet 2 signer verification passed');

        // === TEST SIGNING OPERATION ISOLATION ===

        // Start a signing operation on Wallet 1
        const wallet1SigningOpId = Field.random();
        console.log('Initiating signing operation on Wallet 1...');
        await MultiSig.initiateSigningOp(AleoUtils.accounts[0], WALLET_1_ID, wallet1SigningOpId);

        // Verify signing is complete for Wallet 1 (threshold=1, but initiate provides 1 signature, so it should be complete)
        let wallet1Complete = await MultiSig.isSigningComplete(WALLET_1_ID, wallet1SigningOpId.toString());
        expect(wallet1Complete).toBe(true); // Threshold=1, initiate provides 1 signature
        console.log('Wallet 1 signing operation completed (threshold=1)');

        // Start a signing operation on Wallet 2
        const wallet2SigningOpId = Field.random();
        console.log('Initiating signing operation on Wallet 2...');
        await MultiSig.initiateSigningOp(AleoUtils.accounts[1], WALLET_2_ID, wallet2SigningOpId);

        // Verify signing is not complete yet for Wallet 2 (threshold=3, initiate provides 1 signature)
        let wallet2Complete = await MultiSig.isSigningComplete(WALLET_2_ID, wallet2SigningOpId.toString());
        expect(wallet2Complete).toBe(false); // Need 2 more signatures
        console.log('Wallet 2 signing operation not yet complete (1/3 signatures)');

        // === TEST CROSS-WALLET SIGNING REJECTION ===

        // Try to sign Wallet 1's operation with a signer from Wallet 2 only (accounts[2])
        console.log('Testing cross-wallet signing rejection...');
        await expect(
            MultiSig.sign(AleoUtils.accounts[2], WALLET_1_ID, wallet1SigningOpId.toString())
        ).rejects.toThrow();

        // Try to sign Wallet 2's operation with a signer from Wallet 1 only (accounts[0])
        await expect(
            MultiSig.sign(AleoUtils.accounts[0], WALLET_2_ID, wallet2SigningOpId.toString())
        ).rejects.toThrow();

        // === TEST VALID SIGNING WITHIN WALLET BOUNDARIES ===

        // Complete signing for Wallet 2 with its valid signers
        console.log('Completing Wallet 2 signing operation with valid signers...');
        await MultiSig.sign(AleoUtils.accounts[2], WALLET_2_ID, wallet2SigningOpId.toString());

        // Check if complete after 2nd signature
        wallet2Complete = await MultiSig.isSigningComplete(WALLET_2_ID, wallet2SigningOpId.toString());
        expect(wallet2Complete).toBe(false); // Still need 1 more signature (2/3)
        console.log('Wallet 2 signing operation still not complete (2/3 signatures)');

        // Add final signature
        await MultiSig.sign(AleoUtils.accounts[3], WALLET_2_ID, wallet2SigningOpId.toString());

        // Now it should be complete
        wallet2Complete = await MultiSig.isSigningComplete(WALLET_2_ID, wallet2SigningOpId.toString());
        expect(wallet2Complete).toBe(true); // All 3 signatures collected
        console.log('Wallet 2 signing operation completed (3/3 signatures)');

        // === VERIFY OPERATIONS DON'T INTERFERE ===

        // Verify that Wallet 1's operation is still complete and unaffected
        wallet1Complete = await MultiSig.isSigningComplete(WALLET_1_ID, wallet1SigningOpId.toString());
        expect(wallet1Complete).toBe(true);

        // Verify wallet settings haven't changed
        const finalWallet1Settings = await MultiSig.getWallet(WALLET_1_ID);
        expect(finalWallet1Settings.threshold).toBe(1);
        expect(finalWallet1Settings.num_signers).toBe(2);

        const finalWallet2Settings = await MultiSig.getWallet(WALLET_2_ID);
        expect(finalWallet2Settings.threshold).toBe(3);
        expect(finalWallet2Settings.num_signers).toBe(3);

        console.log('Wallet isolation test completed successfully!');
    });

    test('Cannot add the same signer twice', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], []);

        const signerToAdd = AleoUtils.addresses[1];

        // Try to add the same signer again (should fail)
        const addSigningOpId = Field.random();
        console.log(`Attempting to add the same signer ${signerToAdd} again...`);

        await MultiSig.adminOpAddAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, signerToAdd);
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, addSigningOpId.toString());

        const isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, addSigningOpId.toString());
        expect(isComplete).toBe(true);

        // The execution should fail because signer already exists
        console.log('Testing that execution fails when adding duplicate signer...');
        try {
            await MultiSig.execAdminOpAddAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, signerToAdd);
            fail('Expected adding duplicate signer to fail');
        } catch (error) {
            console.log('Adding duplicate signer correctly failed:', error.message);
        }

        // Verify wallet state is unchanged
        const finalWallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(finalWallet.num_signers).toBe(2); // Should still be 2, not 3

        const isAleoSigner = await MultiSig.isAleoSigner(TEST_WALLET_ID, signerToAdd);
        expect(isAleoSigner).toBe(true); // Should still be a signer

        console.log('Duplicate signer prevention test completed successfully!');
    });

    test('Cannot create wallet with the same address twice', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();

        // Step 1: Create a wallet (should succeed)
        console.log(`Creating wallet ${TEST_WALLET_ID} for the first time...`);
        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], []);

        // Verify wallet was created
        const wallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet).not.toBeNull();
        expect(wallet.threshold).toBe(2);
        expect(wallet.num_signers).toBe(2);
        console.log('Wallet created successfully');

        // Step 2: Try to create the same wallet again (should fail)
        console.log(`Attempting to create wallet ${TEST_WALLET_ID} again...`);
        await expect(
            MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 3, [AleoUtils.addresses[1], AleoUtils.addresses[2], AleoUtils.addresses[3]], [])
        ).rejects.toThrow();

        // Verify original wallet settings are unchanged
        const finalWallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(finalWallet).not.toBeNull();
        expect(finalWallet.threshold).toBe(2); // Should still be original threshold
        expect(finalWallet.num_signers).toBe(2); // Should still be original num_signers

        console.log('Duplicate wallet prevention test completed successfully!');
    });

    test('Cannot create wallet with threshold greater than number of signers', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();

        // Test case 1: threshold=3, but only 2 signers provided
        console.log('Testing threshold=3 with only 2 signers...');
        try {
            await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 3, [AleoUtils.addresses[0], AleoUtils.addresses[1]], []);
            fail('Expected wallet creation with threshold > signers to fail');
        } catch (error) {
            console.log('Invalid threshold correctly rejected (3 > 2):', error.message);
        }

        // Verify wallet was not created
        const wallet1 = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet1).toBeNull();

        // Test case 2: threshold=4, but only 3 signers provided (one ALEO_ZERO_ADDR)
        const TEST_WALLET_ID_2 = AleoUtils.randomAddress();
        console.log('Testing threshold=4 with only 3 signers...');
        try {
            await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID_2, 4, [AleoUtils.addresses[0], AleoUtils.addresses[1], AleoUtils.addresses[2]], []);
            fail('Expected wallet creation with threshold > signers to fail');
        } catch (error) {
            console.log('Invalid threshold correctly rejected (4 > 3):', error.message);
        }

        // Verify wallet was not created
        const wallet2 = await MultiSig.getWallet(TEST_WALLET_ID_2);
        expect(wallet2).toBeNull();

        // Test case 3: threshold=0 should also fail
        const TEST_WALLET_ID_3 = AleoUtils.randomAddress();
        console.log('Testing threshold=0...');
        try {
            await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID_3, 0, [AleoUtils.addresses[0], AleoUtils.addresses[1]], []);
            fail('Expected wallet creation with threshold=0 to fail');
        } catch (error) {
            console.log('Zero threshold correctly rejected:', error.message);
        }

        // Verify wallet was not created
        const wallet3 = await MultiSig.getWallet(TEST_WALLET_ID_3);
        expect(wallet3).toBeNull();

        console.log('Invalid threshold prevention test completed successfully!');
    });

    test('Cannot add zero address as signer', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], []);

        const addSigningOpId = Field.random();
        console.log('Attempting to add zero address as signer...');

        try {
            await MultiSig.adminOpAddAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, AleoUtils.ALEO_ZERO_ADDR);
            fail('should not be able to add zero address as signer');
        } catch (error) {
            expect(error).toContain('Failed to evaluate instruction');
        }
    });

    test('Can sign with ECDSA signers', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();

        // Create two random Ethereum wallets to act as ECDSA signers
        const ethWallet1 = Wallet.createRandom();
        const ethWallet2 = Wallet.createRandom();

        console.log(`ECDSA Signer 1: ${ethWallet1.address}`);
        console.log(`ECDSA Signer 2: ${ethWallet2.address}`);

        // Create wallet with threshold=2 and two ECDSA signers
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [], // No Aleo signers
            [ethWallet1.address, ethWallet2.address], // Two ECDSA signers
            false,
        );

        // Verify wallet was created with correct settings
        const wallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet).not.toBeNull();
        expect(wallet.threshold).toBe(2);
        expect(wallet.num_signers).toBe(2);
        console.log(`Wallet created: threshold=${wallet.threshold}, num_signers=${wallet.num_signers}`);

        // Step 1: Initiate a signing operation
        const signingOpId = Field.random();
        console.log(`Initiating signing operation ${signingOpId.toString()}...`);
        await MultiSig.initiateSigningOp(AleoUtils.accounts[3], TEST_WALLET_ID, signingOpId);

        // Step 2: Verify signing is not complete initially (threshold=2, initiate provides 0 for ECDSA)
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing not complete after initiation (0/2 signatures)');

        // Step 3: Add first ECDSA signature
        console.log('Adding first ECDSA signature...');
        await MultiSig.signEcdsa(AleoUtils.accounts[3], ethWallet1, TEST_WALLET_ID, signingOpId.toString());

        // Step 4: Verify signing is still not complete (1/2 signatures)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing not complete after first signature (1/2 signatures)');

        // Step 5: Test that signing with an unrelated ECDSA signer fails
        console.log('Testing that unrelated ECDSA signer cannot sign...');
        const unrelatedEthWallet = Wallet.createRandom();
        console.log(`Unrelated ECDSA signer: ${unrelatedEthWallet.address}`);
        try {
            await MultiSig.signEcdsa(AleoUtils.accounts[3], unrelatedEthWallet, TEST_WALLET_ID, signingOpId.toString());
            fail('Expected signing with unrelated ECDSA wallet to fail');
        } catch (error) {
            console.log('Unrelated ECDSA signer correctly rejected:', error.message);
        }

        // Verify signing is still not complete after failed attempt
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);

        // Step 6: Add second ECDSA signature from valid signer
        console.log('Adding second ECDSA signature from valid signer...');
        await MultiSig.signEcdsa(AleoUtils.accounts[3], ethWallet2, TEST_WALLET_ID, signingOpId.toString());

        // Step 7: Verify signing is now complete (2/2 signatures)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Signing operation completed (2/2 signatures)');
    });

    test('Cannot sign twice with the same ECDSA signer', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();

        // Create two random Ethereum wallets to act as ECDSA signers
        const ethWallet1 = Wallet.createRandom();
        const ethWallet2 = Wallet.createRandom();

        console.log(`ECDSA Signer 1: ${ethWallet1.address}`);
        console.log(`ECDSA Signer 2: ${ethWallet2.address}`);

        // Create wallet with threshold=2 and two ECDSA signers
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [], // No Aleo signers
            [ethWallet1.address, ethWallet2.address], // Two ECDSA signers
            false,
        );

        // Step 1: Initiate a signing operation
        const signingOpId = Field.random();
        console.log(`Initiating signing operation ${signingOpId.toString()}...`);
        await MultiSig.initiateSigningOp(AleoUtils.accounts[3], TEST_WALLET_ID, signingOpId);

        // Step 2: Add first ECDSA signature
        console.log('Adding first ECDSA signature...');
        await MultiSig.signEcdsa(AleoUtils.accounts[3], ethWallet1, TEST_WALLET_ID, signingOpId.toString());

        // Step 3: Verify signing is not complete (1/2 signatures)
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing not complete after first signature (1/2 signatures)');

        // Step 4: Try to sign again with the same ECDSA signer (should fail)
        console.log('Attempting to sign again with the same ECDSA signer...');
        await expect(
            MultiSig.signEcdsa(AleoUtils.accounts[3], ethWallet1, TEST_WALLET_ID, signingOpId.toString())
        ).rejects.toThrow();

        // Step 5: Verify signing is still not complete (still 1/2 signatures)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing still not complete after duplicate attempt (1/2 signatures)');

        // Step 6: Add second ECDSA signature from different valid signer
        console.log('Adding second ECDSA signature from different signer...');
        await MultiSig.signEcdsa(AleoUtils.accounts[3], ethWallet2, TEST_WALLET_ID, signingOpId.toString());

        // Step 7: Verify signing is now complete (2/2 signatures)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Signing operation completed (2/2 signatures)');
    });

    test('Cannot sign twice with the same Aleo signer', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        // Create wallet with 3 signers and threshold 3
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            3,
            [AleoUtils.addresses[0], AleoUtils.addresses[1], AleoUtils.addresses[2]],
            []
        );

        const signingOpId = Field.random();

        // Step 1: Initiate signing operation with a known signer (counts as first signature)
        console.log('Initiating signing operation with first signer...');
        await MultiSig.initiateSigningOp(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId);

        // Step 2: Try to sign again with the first signer (should fail)
        console.log('Attempting to sign again with the first signer (who initiated)...');
        await expect(
            MultiSig.sign(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId.toString())
        ).rejects.toThrow();

        // Step 3: Verify signing is not complete (1/3)
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);

        // Step 4: Sign with second signer
        console.log('Signing with second signer...');
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString());

        // Step 5: Try to sign again with the second signer (should fail)
        console.log('Attempting to sign again with the second signer...');
        await expect(
            MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString())
        ).rejects.toThrow();

        // Step 6: Verify signing is still not complete (2/3)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);

        // Step 7: Sign with third signer to complete
        console.log('Signing with third signer...');
        await MultiSig.sign(AleoUtils.accounts[2], TEST_WALLET_ID, signingOpId.toString());

        // Step 8: Verify signing is complete
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);

        console.log('Duplicate Aleo signature prevention test completed successfully!');
    });

    test('Can initiate signing operation with unknown signer', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(AleoUtils.accounts[2], TEST_WALLET_ID, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], []);

        // Step 1: Initiate signing operation with unknown signer (accounts[3])
        const signingOpId = Field.random();
        console.log('Initiating signing operation with unknown signer...');
        await MultiSig.initiateSigningOp(AleoUtils.accounts[3], TEST_WALLET_ID, signingOpId);

        // Step 2: Verify signing is not complete (unknown signer doesn't count towards threshold)
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing not complete after unknown signer initiated (0/2 signatures)');

        // Step 3: Add signature from first valid signer
        console.log('Adding signature from first valid signer...');
        await MultiSig.sign(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId.toString());

        // Step 4: Verify still not complete (1/2 signatures)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing not complete after first valid signature (1/2 signatures)');

        // Step 5: Add signature from second valid signer
        console.log('Adding signature from second valid signer...');
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString());

        // Step 6: Verify signing is now complete (2/2 signatures)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Signing operation completed (2/2 valid signatures)');
    });

    test('Can sign with mixture of Aleo and ECDSA signers', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();

        // Create two random Ethereum wallets to act as ECDSA signers
        const ethWallet1 = Wallet.createRandom();
        const ethWallet2 = Wallet.createRandom();

        console.log(`Aleo Signer 1: ${AleoUtils.addresses[0]}`);
        console.log(`Aleo Signer 2: ${AleoUtils.addresses[1]}`);
        console.log(`ECDSA Signer 1: ${ethWallet1.address}`);
        console.log(`ECDSA Signer 2: ${ethWallet2.address}`);

        // Create wallet with threshold=3 and mixed signers (2 Aleo + 2 ECDSA)
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            3,
            [AleoUtils.addresses[0], AleoUtils.addresses[1]], // Two Aleo signers
            [ethWallet1.address, ethWallet2.address], // Two ECDSA signers
            false,
        );

        // Verify wallet was created with correct settings
        const wallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet).not.toBeNull();
        expect(wallet.threshold).toBe(3);
        expect(wallet.num_signers).toBe(4); // 2 Aleo + 2 ECDSA
        console.log(`Wallet created: threshold=${wallet.threshold}, num_signers=${wallet.num_signers}`);

        // Step 1: Initiate a signing operation
        const signingOpId = Field.random();
        console.log(`Initiating signing operation ${signingOpId.toString()}...`);
        await MultiSig.initiateSigningOp(AleoUtils.accounts[3], TEST_WALLET_ID, signingOpId);

        // Step 2: Verify signing is not complete initially
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing not complete after initiation (0/3 signatures)');

        // Step 3: Add first Aleo signature
        console.log('Adding first Aleo signature...');
        await MultiSig.sign(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId.toString());

        // Step 4: Verify signing is still not complete (1/3 signatures)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing not complete after first Aleo signature (1/3 signatures)');

        // Step 5: Add first ECDSA signature
        console.log('Adding first ECDSA signature...');
        await MultiSig.signEcdsa(AleoUtils.accounts[3], ethWallet1, TEST_WALLET_ID, signingOpId.toString());

        // Step 6: Verify signing is still not complete (2/3 signatures)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing not complete after first ECDSA signature (2/3 signatures)');

        // Step 7: Add second ECDSA signature to reach threshold
        console.log('Adding second ECDSA signature to reach threshold...');
        await MultiSig.signEcdsa(AleoUtils.accounts[3], ethWallet2, TEST_WALLET_ID, signingOpId.toString());

        // Step 8: Verify signing is now complete (3/3 signatures: 1 Aleo + 2 ECDSA)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Signing operation completed (3/3 signatures: 1 Aleo + 2 ECDSA)');
    });

    test('Cannot sign with invalid ECDSA signature', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();

        // Create two random Ethereum wallets - one as valid signer, one to provide invalid signature
        const ethWallet1 = Wallet.createRandom();
        const ethWallet2 = Wallet.createRandom();

        console.log(`Valid ECDSA Signer: ${ethWallet1.address}`);
        console.log(`Invalid signature provider: ${ethWallet2.address}`);

        // Create wallet with threshold=1 and one ECDSA signer
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            1,
            [], // No Aleo signers
            [ethWallet1.address], // Only ethWallet1 is a valid signer
            false,
        );

        // Step 1: Initiate a signing operation
        const signingOpId = Field.random();
        console.log(`Initiating signing operation ${signingOpId.toString()}...`);
        await MultiSig.initiateSigningOp(AleoUtils.accounts[3], TEST_WALLET_ID, signingOpId);

        // Step 2: Try to sign with ethWallet1's address but using ethWallet2's private key (invalid signature)
        console.log('Attempting to sign with invalid ECDSA signature...');

        // We'll manually create an invalid signature by signing with the wrong wallet
        // The signEcdsa function will use ethWallet2's key to sign, but we claim it's from ethWallet1
        const wrongWallet = ethWallet2;

        try {
            await MultiSig.signEcdsa(AleoUtils.accounts[3], wrongWallet, TEST_WALLET_ID, signingOpId.toString());
            fail('Expected signing with invalid ECDSA signature to fail');
        } catch (error) {
            console.log('Invalid ECDSA signature correctly rejected:', error.message);
        }

        // Step 3: Verify signing is still not complete (no valid signatures)
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);
        console.log('Signing still not complete after invalid signature (0/1 signatures)');

        // Step 4: Sign with valid signature to confirm the operation can still succeed
        console.log('Adding valid ECDSA signature...');
        await MultiSig.signEcdsa(AleoUtils.accounts[3], ethWallet1, TEST_WALLET_ID, signingOpId.toString());

        // Step 5: Verify signing is now complete
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Signing operation completed with valid signature (1/1 signatures)');
    });

    test('Can add and remove ECDSA signers', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();

        // Create initial ECDSA signers
        const ethWallet1 = Wallet.createRandom();
        const ethWallet2 = Wallet.createRandom();

        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 2, [], [ethWallet1.address, ethWallet2.address], true);

        // Test address to add/remove as signer
        const newEthWallet = Wallet.createRandom();
        const newSignerAddress = newEthWallet.address;

        // Step 1: Verify the new address is not currently a signer
        let isEcdsaSignerBefore = await MultiSig.isEcdsaSigner(TEST_WALLET_ID, newSignerAddress);
        expect(isEcdsaSignerBefore).toBe(false);
        console.log(`Address ${newSignerAddress} is not a signer (as expected)`);

        // Get initial wallet settings
        const initialWallet = await MultiSig.getWallet(TEST_WALLET_ID);
        console.log(`Initial wallet: threshold=${initialWallet.threshold}, num_signers=${initialWallet.num_signers}`);

        // === ADD SIGNER TEST ===

        // Step 2: Initiate admin operation to add ECDSA signer
        const addSigningOpId = Field.random();
        console.log(`Initiating admin operation to add ECDSA signer ${newSignerAddress}...`);
        await MultiSig.adminOpAddEcdsaSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, newSignerAddress);

        // Step 3: Add signatures to reach threshold
        console.log('Adding signatures to complete add signer operation...');
        await MultiSig.signEcdsa(AleoUtils.accounts[0], ethWallet1, TEST_WALLET_ID, addSigningOpId.toString());
        await MultiSig.signEcdsa(AleoUtils.accounts[0], ethWallet2, TEST_WALLET_ID, addSigningOpId.toString());

        // Step 4: Verify signing is complete
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, addSigningOpId.toString());
        expect(isComplete).toBe(true);

        // Step 5: Execute the add signer operation
        console.log('Executing add ECDSA signer operation...');
        await MultiSig.execAdminOpAddEcdsaSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, newSignerAddress);

        // Step 6: Verify the signer was added
        let isEcdsaSignerAfterAdd = await MultiSig.isEcdsaSigner(TEST_WALLET_ID, newSignerAddress);
        expect(isEcdsaSignerAfterAdd).toBe(true);
        console.log(`Address ${newSignerAddress} is now a signer!`);

        // Step 7: Verify wallet settings updated
        const walletAfterAdd = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(walletAfterAdd.threshold).toBe(2); // Should remain the same
        expect(walletAfterAdd.num_signers).toBe(3); // Should increase by 1
        console.log(`Wallet after add: threshold=${walletAfterAdd.threshold}, num_signers=${walletAfterAdd.num_signers}`);

        // === REMOVE SIGNER TEST ===

        // Step 8: Initiate admin operation to remove the ECDSA signer we just added
        const removeSigningOpId = Field.random();
        console.log(`Initiating admin operation to remove ECDSA signer ${newSignerAddress}...`);
        await MultiSig.adminOpRemoveEcdsaSigner(AleoUtils.accounts[0], TEST_WALLET_ID, removeSigningOpId, newSignerAddress);

        // Step 9: Add signatures to reach threshold (using the newly added signer)
        console.log('Adding signatures to complete remove signer operation (including signature from the signer being removed)...');
        await MultiSig.signEcdsa(AleoUtils.accounts[0], newEthWallet, TEST_WALLET_ID, removeSigningOpId.toString());
        await MultiSig.signEcdsa(AleoUtils.accounts[0], ethWallet1, TEST_WALLET_ID, removeSigningOpId.toString());

        // Step 10: Verify signing is complete
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, removeSigningOpId.toString());
        expect(isComplete).toBe(true);

        // Step 11: Execute the remove signer operation
        console.log('Executing remove ECDSA signer operation...');
        await MultiSig.execAdminOpRemoveEcdsaSigner(AleoUtils.accounts[0], TEST_WALLET_ID, removeSigningOpId, newSignerAddress);

        // Step 12: Verify the signer was removed
        let isEcdsaSignerAfterRemove = await MultiSig.isEcdsaSigner(TEST_WALLET_ID, newSignerAddress);
        expect(isEcdsaSignerAfterRemove).toBe(false);
        console.log(`Address ${newSignerAddress} is no longer a signer!`);

        // Step 13: Verify wallet settings updated
        const walletAfterRemove = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(walletAfterRemove.threshold).toBe(2); // Should remain the same
        expect(walletAfterRemove.num_signers).toBe(2); // Should be back to original
        console.log(`Wallet after remove: threshold=${walletAfterRemove.threshold}, num_signers=${walletAfterRemove.num_signers}`);

        // === RE-EXECUTION PREVENTION TEST ===

        // Step 14: Try to re-execute the add signer operation (should fail)
        console.log('Testing that re-executing add ECDSA signer operation fails...');
        try {
            await MultiSig.execAdminOpAddEcdsaSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, newSignerAddress);
            fail('Expected re-execution of add ECDSA signer operation to fail');
        } catch (error) {
            console.log('Re-execution correctly failed:', error.message);
        }

        // Step 15: Verify the signer status hasn't changed (still false after removal)
        let isEcdsaSignerAfterReexec = await MultiSig.isEcdsaSigner(TEST_WALLET_ID, newSignerAddress);
        expect(isEcdsaSignerAfterReexec).toBe(false);
        console.log(`Address ${newSignerAddress} is still not a signer (re-execution prevented)`);

        // Step 16: Verify wallet settings haven't changed
        const walletAfterReexec = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(walletAfterReexec.threshold).toBe(2);
        expect(walletAfterReexec.num_signers).toBe(2);

        console.log('Add/remove ECDSA signer test completed successfully!');
    });

    test('Cannot execute ECDSA admin operation with different parameters than init', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();

        // Create initial ECDSA signers
        const ethWallet1 = Wallet.createRandom();
        const ethWallet2 = Wallet.createRandom();

        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 2, [], [ethWallet1.address, ethWallet2.address], true);

        // Two different addresses - one for init, one for (attempted) exec
        const signerToAdd = Wallet.createRandom();
        const differentSigner = Wallet.createRandom();

        console.log(`Signer used in init: ${signerToAdd.address}`);
        console.log(`Different signer for exec: ${differentSigner.address}`);

        // Step 1: Initiate admin operation to add first ECDSA signer
        const addSigningOpId = Field.random();
        console.log(`Initiating admin operation to add ECDSA signer ${signerToAdd.address}...`);
        await MultiSig.adminOpAddEcdsaSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, signerToAdd.address);

        // Step 2: Add signatures to reach threshold
        console.log('Adding signatures to complete add signer operation...');
        await MultiSig.signEcdsa(AleoUtils.accounts[0], ethWallet1, TEST_WALLET_ID, addSigningOpId.toString());
        await MultiSig.signEcdsa(AleoUtils.accounts[0], ethWallet2, TEST_WALLET_ID, addSigningOpId.toString());

        // Step 3: Verify signing is complete
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, addSigningOpId.toString());
        expect(isComplete).toBe(true);

        // Step 4: Try to execute with a different signer address (should fail)
        console.log('Testing that execution with different signer address fails...');
        try {
            await MultiSig.execAdminOpAddEcdsaSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, differentSigner.address);
            fail('Expected execution with different signer address to fail');
        } catch (error) {
            console.log('Execution with different parameters correctly failed:', error.message);
        }

        // Step 5: Verify neither signer was added
        let isOriginalSignerAdded = await MultiSig.isEcdsaSigner(TEST_WALLET_ID, signerToAdd.address);
        let isDifferentSignerAdded = await MultiSig.isEcdsaSigner(TEST_WALLET_ID, differentSigner.address);
        expect(isOriginalSignerAdded).toBe(false);
        expect(isDifferentSignerAdded).toBe(false);
        console.log('Neither signer was added (as expected)');

        // Step 6: Verify wallet settings unchanged
        const wallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet.num_signers).toBe(2); // Should still be 2, not 3
        console.log(`Wallet signers: ${wallet.num_signers} (unchanged)`);

        // Step 7: Execute with the correct signer address (should succeed)
        console.log('Executing with correct signer address...');
        await MultiSig.execAdminOpAddEcdsaSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, signerToAdd.address);

        // Step 8: Verify the correct signer was added
        isOriginalSignerAdded = await MultiSig.isEcdsaSigner(TEST_WALLET_ID, signerToAdd.address);
        expect(isOriginalSignerAdded).toBe(true);
        console.log(`Correct signer ${signerToAdd.address} was added successfully`);

        console.log('ECDSA parameter mismatch prevention test completed successfully!');
    });

    test('Cannot execute Aleo admin operation with different parameters than init', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();

        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], [], true);

        // Two different addresses - one for init, one for (attempted) exec
        const signerToAdd = AleoUtils.addresses[2];
        const differentSigner = AleoUtils.addresses[3];

        console.log(`Signer used in init: ${signerToAdd}`);
        console.log(`Different signer for exec: ${differentSigner}`);

        // Step 1: Initiate admin operation to add first Aleo signer
        const addSigningOpId = Field.random();
        console.log(`Initiating admin operation to add Aleo signer ${signerToAdd}...`);
        await MultiSig.adminOpAddAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, signerToAdd);

        // Step 2: Add signatures to reach threshold
        console.log('Adding signatures to complete add signer operation...');
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, addSigningOpId.toString());

        // Step 3: Verify signing is complete
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, addSigningOpId.toString());
        expect(isComplete).toBe(true);

        // Step 4: Try to execute with a different signer address (should fail)
        console.log('Testing that execution with different signer address fails...');
        try {
            await MultiSig.execAdminOpAddAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, differentSigner);
            fail('Expected execution with different signer address to fail');
        } catch (error) {
            console.log('Execution with different parameters correctly failed:', error.message);
        }

        // Step 5: Verify neither signer was added
        let isOriginalSignerAdded = await MultiSig.isAleoSigner(TEST_WALLET_ID, signerToAdd);
        let isDifferentSignerAdded = await MultiSig.isAleoSigner(TEST_WALLET_ID, differentSigner);
        expect(isOriginalSignerAdded).toBe(false);
        expect(isDifferentSignerAdded).toBe(false);
        console.log('Neither signer was added (as expected)');

        // Step 6: Verify wallet settings unchanged
        const wallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet.num_signers).toBe(2); // Should still be 2, not 3
        console.log(`Wallet signers: ${wallet.num_signers} (unchanged)`);

        // Step 7: Execute with the correct signer address (should succeed)
        console.log('Executing with correct signer address...');
        await MultiSig.execAdminOpAddAleoSigner(AleoUtils.accounts[0], TEST_WALLET_ID, addSigningOpId, signerToAdd);

        // Step 8: Verify the correct signer was added
        isOriginalSignerAdded = await MultiSig.isAleoSigner(TEST_WALLET_ID, signerToAdd);
        expect(isOriginalSignerAdded).toBe(true);
        console.log(`Correct signer ${signerToAdd} was added successfully`);

        console.log('Aleo parameter mismatch prevention test completed successfully!');
    });

    test('Signing operation expires after block limit', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            4,
            [AleoUtils.addresses[0], AleoUtils.addresses[1], AleoUtils.addresses[2], AleoUtils.addresses[3]],
            [],
        );

        const signingOpId = Field.random();
        const blockExpiration = 2;

        // Step 1: Initiate signing op with short expiration
        // This transaction will be in Block N
        // Expiration block = N + 2
        console.log(`Initiating signing operation with expiration in ${blockExpiration} blocks...`);
        await MultiSig.initiateSigningOp(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            blockExpiration,
        );

        // Step 2: Add signature from second signer
        // This transaction will be in Block N + 1
        // N + 1 <= N + 2, so this should succeed
        console.log('Adding signature from signer 2 (should succeed)...');
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString());

        // Step 3: Add signature from third signer
        // This transaction will be in Block N + 2
        // N + 2 <= N + 2, so this should succeed (last valid block)
        console.log('Adding signature from signer 3 (should succeed)...');
        await MultiSig.sign(AleoUtils.accounts[2], TEST_WALLET_ID, signingOpId.toString());

        // Step 4: Try to sign after expiration (should fail)
        // This transaction will be in Block N + 3
        // N + 3 > N + 2, so this should fail
        console.log('Attempting to sign after expiration (should fail)...');
        await expect(
            MultiSig.sign(AleoUtils.accounts[3], TEST_WALLET_ID, signingOpId.toString())
        ).rejects.toThrow();
    });

    test('Cannot initiate signing operation with zero block expiration', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            1,
            [AleoUtils.addresses[0]],
            [],
        );

        const signingOpId = Field.random();

        console.log('Attempting to initiate signing operation with 0 block expiration...');
        let error;
        try {
            await MultiSig.initiateSigningOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                0, // Invalid expiration
            );
        } catch (e) {
            error = e;
        }
        expect(error).toBeDefined();
        console.log('Zero block expiration correctly rejected');
    });

    test('Can reuse signing_op_id after expiration if signing is incomplete', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            // Need to have 2 signers since if only have a single one, and initiateSigningOp from a known
            // signer account, then the signing will be marked as completed.
            2,
            [AleoUtils.addresses[0], AleoUtils.addresses[1]],
            [],
        );

        const signingOpId = Field.random();
        const blockExpiration = 1;

        // Step 1: Initiate signing op
        console.log('Initiating first signing operation...');
        await MultiSig.initiateSigningOp(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            blockExpiration,
        );

        // Step 2: Let it expire
        await AleoUtils.advanceBlocks(blockExpiration + 2);

        const pendingSigningOp1 = await MultiSig.getPendingSigningOp(
            TEST_WALLET_ID,
            signingOpId,
        );
        expect(pendingSigningOp1.confirmations).toBe(1);
        expect(pendingSigningOp1.round).toBe(1);

        // Step 3: Reuse the same signing_op_id
        console.log('Attempting to reuse expired signing_op_id...');
        try {
            await MultiSig.initiateSigningOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                blockExpiration,
            );
            console.log('Reuse of expired signing_op_id succeeded');
        } catch (error) {
            throw new Error(`Expected reuse of expired signing_op_id to succeed, but failed: ${error.message}`);
        }

        const pendingSigningOp2 = await MultiSig.getPendingSigningOp(
            TEST_WALLET_ID,
            signingOpId,
        );
        expect(pendingSigningOp2.confirmations).toBe(1);
        expect(pendingSigningOp2.round).toBe(2);

        // Step 4: Reusing it again while not expired will fail.
        let error;
        try {
            await MultiSig.initiateSigningOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                blockExpiration
            );
        } catch (e) {
            error = e;
        }
        expect(error).toBeDefined();

        const pendingSigningOp3 = await MultiSig.getPendingSigningOp(
            TEST_WALLET_ID,
            signingOpId,
        );
        expect(pendingSigningOp3.confirmations).toBe(1);
        expect(pendingSigningOp3.round).toBe(2);
     });

    test('Cannot reuse signing_op_id before expiration', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            3,
            [AleoUtils.addresses[0], AleoUtils.addresses[1], AleoUtils.addresses[2]],
            [],
        );

        const signingOpId = Field.random();
        const blockExpiration = 4;

        // Step 1: Initiate signing op and add a signature
        console.log('Initiating first signing operation...');
        await MultiSig.initiateSigningOp(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            blockExpiration,
        );

        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString());

        // Step 2: Try to reuse immediately (before expiration)
        console.log('Attempting to reuse active signing_op_id...');
        await expect(
            MultiSig.initiateSigningOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                blockExpiration,
            )
        ).rejects.toThrow();

        // Advance by 1 block, should still fail.
        await AleoUtils.advanceBlocks(1);

        await expect(
            MultiSig.initiateSigningOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                blockExpiration,
            )
        ).rejects.toThrow();

        // Check the current state of pending_signing_ops
        const pendingSigningOp1 = await MultiSig.getPendingSigningOp(
            TEST_WALLET_ID,
            signingOpId,
        );
        expect(pendingSigningOp1.confirmations).toBe(2);
        expect(pendingSigningOp1.round).toBe(1);

        // We now did 3 transactions (counting hte failed ones as well), so we should be able to reinitiate.
        await MultiSig.initiateSigningOp(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            blockExpiration,
        );

        const pendingSigningOp2 = await MultiSig.getPendingSigningOp(
            TEST_WALLET_ID,
            signingOpId,
        );
        expect(pendingSigningOp2.confirmations).toBe(1);
        expect(pendingSigningOp2.round).toBe(2);
    });

    test('Cannot reuse signing_op_id after completion', async () => {
        const blockExpiration = 5;

        // Scenario 1: Threshold 1, known signer initiates (completes immediately)
        {
            const walletId = AleoUtils.randomAddress();
            await MultiSig.createWallet(AleoUtils.accounts[0], walletId, 1, [AleoUtils.addresses[0]], []);

            const signingOpId = Field.random();
            await MultiSig.initiateSigningOp(AleoUtils.accounts[0], walletId, signingOpId, blockExpiration);

            expect(await MultiSig.isSigningComplete(walletId, signingOpId.toString())).toBe(true);

            // Let it expire
            await AleoUtils.advanceBlocks(blockExpiration + 1);

            // Attempt to reuse
            await expect(
                MultiSig.initiateSigningOp(AleoUtils.accounts[0], walletId, signingOpId, blockExpiration)
            ).rejects.toThrow();

            console.log('Scenario 1 passed: Cannot reuse completed op (immediate completion)');
        }

        // Scenario 2: Threshold 2, unknown signer initiates (needs signatures)
        {
            const walletId = AleoUtils.randomAddress();
            await MultiSig.createWallet(AleoUtils.accounts[0], walletId, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], []);

            const signingOpId = Field.random();
            // account[2] is not a signer
            await MultiSig.initiateSigningOp(AleoUtils.accounts[2], walletId, signingOpId, blockExpiration);

            await MultiSig.sign(AleoUtils.accounts[0], walletId, signingOpId.toString());
            await MultiSig.sign(AleoUtils.accounts[1], walletId, signingOpId.toString());

            expect(await MultiSig.isSigningComplete(walletId, signingOpId.toString())).toBe(true);

            // Let it expire
            await AleoUtils.advanceBlocks(blockExpiration + 1);

            // Attempt to reuse
            await expect(
                MultiSig.initiateSigningOp(AleoUtils.accounts[0], walletId, signingOpId, blockExpiration)
            ).rejects.toThrow();
             console.log('Scenario 2 passed: Cannot reuse completed op (unknown signer init)');
        }

        // Scenario 3: Threshold 2, known signer initiates (needs 1 more signature)
        {
            const walletId = AleoUtils.randomAddress();
            await MultiSig.createWallet(AleoUtils.accounts[0], walletId, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], []);

            const signingOpId = Field.random();
            await MultiSig.initiateSigningOp(AleoUtils.accounts[0], walletId, signingOpId, blockExpiration);

            await MultiSig.sign(AleoUtils.accounts[1], walletId, signingOpId.toString());

            expect(await MultiSig.isSigningComplete(walletId, signingOpId.toString())).toBe(true);

            // Let it expire
            await AleoUtils.advanceBlocks(blockExpiration + 1);

            // Attempt to reuse
            await expect(
                MultiSig.initiateSigningOp(AleoUtils.accounts[0], walletId, signingOpId, blockExpiration)
            ).rejects.toThrow();
             console.log('Scenario 3 passed: Cannot reuse completed op (known signer init)');
        }

        // Scenario 4: ECDSA signer
        {
            const walletId = AleoUtils.randomAddress();
            const ethWallet = Wallet.createRandom();
            await MultiSig.createWallet(AleoUtils.accounts[0], walletId, 1, [], [ethWallet.address], false);

            const signingOpId = Field.random();
            await MultiSig.initiateSigningOp(AleoUtils.accounts[0], walletId, signingOpId, blockExpiration);

            await MultiSig.signEcdsa(AleoUtils.accounts[0], ethWallet, walletId, signingOpId.toString());

            expect(await MultiSig.isSigningComplete(walletId, signingOpId.toString())).toBe(true);

            // Let it expire
            await AleoUtils.advanceBlocks(blockExpiration + 1);

            // Attempt to reuse
            await expect(
                MultiSig.initiateSigningOp(AleoUtils.accounts[0], walletId, signingOpId, blockExpiration)
            ).rejects.toThrow();
             console.log('Scenario 4 passed: Cannot reuse completed op (ECDSA)');
        }
    });

    test('Cannot sign for an incorrect round', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        // Create wallet with 2 signers, threshold 2
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [AleoUtils.addresses[0], AleoUtils.addresses[1]],
            [],
        );

        const signingOpId = Field.random();
        const blockExpiration = 5;

        // Step 1: Initiate signing op. This is round 1.
        console.log('Initiating signing operation (round 1)...');
        await MultiSig.initiateSigningOp(
            AleoUtils.accounts[0], // a signer initiates, so we have 1 confirmation.
            TEST_WALLET_ID,
            signingOpId,
            blockExpiration,
        );

        const pendingOp = await MultiSig.getPendingSigningOp(TEST_WALLET_ID, signingOpId);
        expect(pendingOp.round).toBe(1);

        // Step 2: Try to sign for round 2 (should fail)
        console.log('Attempting to sign for round 2 (should fail)...');
        await expect(
            MultiSig.signForRound(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString(), 2)
        ).rejects.toThrow();

        // Step 3: Verify signing is not complete
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);

        // Step 4: Sign for round 1 (should succeed)
        console.log('Signing for round 1 (should succeed)...');
        await MultiSig.signForRound(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString(), 1);

        // Step 5: Verify signing is complete
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Correct round signing test completed successfully!');
    });

    test('Cannot sign with ECDSA for an incorrect round', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        const ethWallet1 = Wallet.createRandom();
        const ethWallet2 = Wallet.createRandom();

        // Create wallet with 2 ECDSA signers, threshold 2
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [],
            [ethWallet1.address, ethWallet2.address],
            false,
        );

        const signingOpId = Field.random();
        const blockExpiration = 5;

        // Step 1: Initiate signing op. This is round 1.
        console.log('Initiating signing operation (round 1)...');
        // Initiate with a non-signer account so confirmations start at 0.
        await MultiSig.initiateSigningOp(
            AleoUtils.accounts[3],
            TEST_WALLET_ID,
            signingOpId,
            blockExpiration,
        );

        const pendingOp = await MultiSig.getPendingSigningOp(TEST_WALLET_ID, signingOpId);
        expect(pendingOp.round).toBe(1);
        expect(pendingOp.confirmations).toBe(0);

        // Step 2: Try to sign with ECDSA for round 2 (should fail)
        console.log('Attempting to sign with ECDSA for round 2 (should fail)...');
        await expect(
            MultiSig.signEcdsaForRound(AleoUtils.accounts[3], ethWallet1, TEST_WALLET_ID, signingOpId.toString(), 2)
        ).rejects.toThrow();

        // Step 3: Verify signing is not complete
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);

        // Step 4: Sign with ECDSA for round 1 (should succeed)
        console.log('Signing with ECDSA for round 1 (should succeed)...');
        await MultiSig.signEcdsaForRound(AleoUtils.accounts[3], ethWallet1, TEST_WALLET_ID, signingOpId.toString(), 1);

        // Still not complete (1/2)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);

        // Step 5: Sign again with the other signer, but for the wrong round (round 2)
        console.log('Attempting to sign again with another ECDSA for round 2 (should fail)...');
        await expect(
             MultiSig.signEcdsaForRound(AleoUtils.accounts[3], ethWallet2, TEST_WALLET_ID, signingOpId.toString(), 2)
        ).rejects.toThrow();

        // Still not complete (1/2)
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);

        // Step 6: Sign again with the other signer for the correct round (round 1)
        console.log('Signing again with another ECDSA for round 1 (should succeed)...');
        await MultiSig.signEcdsaForRound(AleoUtils.accounts[3], ethWallet2, TEST_WALLET_ID, signingOpId.toString(), 1);

        // Step 7: Verify signing is complete
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);
        console.log('Correct round ECDSA signing test completed successfully!');
    });

    test('Admin operation can expire and be re-initiated', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        // Create wallet with threshold 2
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [AleoUtils.addresses[0], AleoUtils.addresses[1]],
            [],
        );

        const signingOpId = Field.random();
        const newThreshold = 1;
        const blockExpiration = 1;

        // Step 1: Initiate admin op with short expiration
        console.log('Initiating admin op that will expire...');
        await MultiSig.adminOpSetThreshold(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            newThreshold,
            blockExpiration
        );

        // Step 2: Let it expire
        console.log('Waiting for expiration...');
        await AleoUtils.advanceBlocks(blockExpiration + 1);

        // Step 2b: Verify operations fail on expired op
        console.log('Verifying operations fail on expired op...');

        // Try to sign (should fail because it's expired)
        await expect(
            MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString())
        ).rejects.toThrow();

        // Verify not complete
        const isCompleteBeforeReinit = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isCompleteBeforeReinit).toBe(false);

        // Try to execute (should fail because not complete)
        await expect(
            MultiSig.execAdminOpSetThreshold(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                newThreshold
            )
        ).rejects.toThrow();

        // Step 3: Re-initiate the same admin op
        console.log('Re-initiating the admin op...');
        await MultiSig.adminOpSetThreshold(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            newThreshold,
            blockExpiration
        );

        // Step 4: Add signatures (requires 2, one provided by init)
        console.log('Adding signature...');
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString());

        // Verify complete
        const isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);

        // Step 5: Execute
        console.log('Executing re-initiated admin op...');
        await MultiSig.execAdminOpSetThreshold(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            newThreshold
        );

        // Step 6: Verify effect
        const wallet = await MultiSig.getWallet(TEST_WALLET_ID);
        expect(wallet.threshold).toBe(newThreshold);
        console.log('Admin op successfully executed after re-initiation');
    });

    test('Cannot add signer with both Aleo and ECDSA signers set', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 1, [AleoUtils.addresses[0]], []);

        const signingOpId = Field.random();
        const aleoSigner = AleoUtils.addresses[1];
        const ethWallet = Wallet.createRandom();

        console.log('Attempting to add signer with both Aleo and ECDSA set...');
        try {
            await MultiSig.initAdminOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId.toString(),
                MultiSig.ADMIN_OP_ADD_SIGNER,
                0,
                aleoSigner,
                ethWallet.address
            );
            fail('Should have failed to add signer with both Aleo and ECDSA set');
        } catch (error) {
            expect(error).toContain('Failed to evaluate instruction');
        }
    });

    test('Cannot add signer with neither Aleo nor ECDSA signers set', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 1, [AleoUtils.addresses[0]], []);

        const signingOpId = Field.random();

        console.log('Attempting to add signer with neither Aleo nor ECDSA set...');
        try {
            await MultiSig.initAdminOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId.toString(),
                MultiSig.ADMIN_OP_ADD_SIGNER,
                0,
                AleoUtils.ALEO_ZERO_ADDR,
                AleoUtils.ETH_ZERO_ADDR
            );
            fail('Should have failed to add signer with neither Aleo nor ECDSA set');
        } catch (error) {
            expect(error).toContain('Failed to evaluate instruction');
        }
    });

    test('Cannot remove signer with both Aleo and ECDSA signers set', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        const ethWallet = Wallet.createRandom();
        // Create wallet with Aleo address[0] and the ethWallet as signers
        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 1, [AleoUtils.addresses[0], AleoUtils.addresses[1]], [ethWallet.address]);

        const signingOpId = Field.random();
        const aleoSigner = AleoUtils.addresses[0];

        console.log('Attempting to remove signer with both Aleo and ECDSA set...');
        try {
            await MultiSig.initAdminOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId.toString(),
                MultiSig.ADMIN_OP_REMOVE_SIGNER,
                0,
                aleoSigner,
                ethWallet.address
            );
            fail('Should have failed to remove signer with both Aleo and ECDSA set');
        } catch (error) {
            expect(error).toContain('Failed to evaluate instruction');
        }
    });

    test('Cannot remove signer with neither Aleo nor ECDSA signers set', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 1, [AleoUtils.addresses[0]], []);

        const signingOpId = Field.random();

        console.log('Attempting to remove signer with neither Aleo nor ECDSA set...');
        try {
            await MultiSig.initAdminOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId.toString(),
                MultiSig.ADMIN_OP_REMOVE_SIGNER,
                0,
                AleoUtils.ALEO_ZERO_ADDR,
                AleoUtils.ETH_ZERO_ADDR
            );
            fail('Should have failed to remove signer with neither Aleo nor ECDSA set');
        } catch (error) {
            expect(error).toContain('Failed to evaluate instruction');
        }
    });

    test('Expired non-admin-op signing op cannot be re-initiated as an admin op', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [AleoUtils.addresses[0], AleoUtils.addresses[1]],
            [],
        );

        const signingOpId = Field.random();
        const blockExpiration = 1;

        // Step 1: Initiate a regular (non-admin) signing operation
        console.log('Initiating regular signing operation...');
        await MultiSig.initiateSigningOp(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            blockExpiration,
        );

        // Step 2: Let it expire
        console.log('Waiting for expiration...');
        await AleoUtils.advanceBlocks(blockExpiration + 1);

        // Step 3: Try to re-initiate as an admin operation (should fail)
        console.log('Attempting to re-initiate as admin op (should fail)...');
        await expect(
            MultiSig.adminOpSetThreshold(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                1,
                blockExpiration,
            )
        ).rejects.toThrow();

        // Step 4: Verify we can still re-initiate as a regular signing op
        console.log('Re-initiating as regular signing op (should succeed)...');
        await MultiSig.initiateSigningOp(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            blockExpiration,
        );

        console.log('Test passed: expired non-admin-op cannot be upgraded to admin op');
    });

    test('Expired admin op can only be re-initiated as the same admin op', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [AleoUtils.addresses[0], AleoUtils.addresses[1]],
            [],
        );

        const signingOpId = Field.random();
        const blockExpiration = 1;

        // Step 1: Initiate an admin operation (set threshold to 1)
        console.log('Initiating admin op to set threshold to 1...');
        await MultiSig.adminOpSetThreshold(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            1,
            blockExpiration,
        );

        // Step 2: Let it expire
        console.log('Waiting for expiration...');
        await AleoUtils.advanceBlocks(blockExpiration + 1);

        // Step 3: Try to re-initiate as a different admin op (should fail)
        console.log('Attempting to re-initiate as add signer admin op (should fail)...');
        await expect(
            MultiSig.adminOpAddAleoSigner(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                AleoUtils.addresses[2],
                blockExpiration,
            )
        ).rejects.toThrow();

        // Step 4: Try to re-initiate as the same admin op but with different value (should fail)
        console.log('Attempting to re-initiate as set threshold with different value (should fail)...');
        await expect(
            MultiSig.adminOpSetThreshold(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                2, // Different threshold value
                blockExpiration,
            )
        ).rejects.toThrow();

        // Step 5: Try to re-initiate as a regular signing op (should fail)
        console.log('Attempting to re-initiate as regular signing op (should fail)...');
        await expect(
            MultiSig.initiateSigningOp(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                blockExpiration,
            )
        ).rejects.toThrow();

        // Step 6: Re-initiate as the same admin op with same values (should succeed)
        console.log('Re-initiating as the same admin op (should succeed)...');
        await MultiSig.adminOpSetThreshold(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            1,
            blockExpiration,
        );

        console.log('Test passed: expired admin op can only be re-initiated as the same admin op');
    });

    test('Can use MAX_BLOCK_HEIGHT for block expiration', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        const MAX_BLOCK_HEIGHT = 4294967295; // u32 max value

        await MultiSig.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [AleoUtils.addresses[0], AleoUtils.addresses[1]],
            [],
        );

        const signingOpId = Field.random();

        // Step 1: Initiate signing op with MAX_BLOCK_HEIGHT
        console.log(`Initiating signing operation with MAX_BLOCK_HEIGHT=${MAX_BLOCK_HEIGHT}...`);
        await MultiSig.initiateSigningOp(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            MAX_BLOCK_HEIGHT,
        );

        // Step 2: Verify it's pending and not complete (1/2 signatures)
        let isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(false);

        const pendingOp = await MultiSig.getPendingSigningOp(TEST_WALLET_ID, signingOpId);
        expect(pendingOp).not.toBeNull();

        console.log(`Pending op expiration from chain: ${pendingOp.expires_at_block}`);

        // Step 3: Add second signature
        console.log('Adding second signature...');
        await MultiSig.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId.toString());

        // Step 4: Verify signing is complete
        isComplete = await MultiSig.isSigningComplete(TEST_WALLET_ID, signingOpId.toString());
        expect(isComplete).toBe(true);

        console.log('MAX_BLOCK_HEIGHT expiration test completed successfully!');
    });
});
