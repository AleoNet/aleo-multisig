import { Field, Plaintext } from '@provablehq/sdk';
import * as AleoUtils from './lib/aleo-test-utils.js';
import * as TokenRegistry from './contracts/token-registry.js';
import * as MultiSig from './contracts/multisig.js';
import * as MSW from './contracts/multisig-wallet.js';
import * as Credits from './contracts/credits.js';
import { Wallet } from "ethers";

// TODO test wallet isolation (no cross-wallet interference)

describe('Multisig Wallet Tests', () => {
    const TEST_WALLET_ID = AleoUtils.randomAddress();
    //const TEST_WALLET_ID = 'aleo1qjeq80t550l6uuuc6ywe7ye6xaj5kapc0cg79nyxdtz5x2zdjgxsxy696j'

    beforeAll(async () => {
        AleoUtils.logAccountInfo();

        const programSettings = await MultiSig.getProgramSettings();
        if (programSettings === null) {
            throw 'The multisig_core program has not been initialized yet.'
        }

        if (programSettings.guard_create_wallet !== false) {
            throw 'The tests can only run when the guard_create_wallet is set to false.'
        }

        await TokenRegistry.initRegistry();
        await TokenRegistry.registerTestToken();
        await MSW.createWallet(AleoUtils.accounts[0], TEST_WALLET_ID, 2, [AleoUtils.addresses[0], AleoUtils.addresses[1]], [], true);

        // Ensure first account has some of the test token
        {
            const balance = await TokenRegistry.getPublicBalance(AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[0]);
            if (balance < 10000n) {
                console.log(`Minting test tokens to ${AleoUtils.addresses[0]}...`);
                await TokenRegistry.mintPublicToken(AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[0], '10000u128');
            }
        }

        // Ensure the wallet has aleo credits
        {
            const balance = await MSW.getWalletBalance(TEST_WALLET_ID, AleoUtils.CREDITS_RESERVED_TOKEN_ID);
            if (balance < 1000n) {
                console.log(`Depositing Aleo credits to wallet ${TEST_WALLET_ID}...`);
                await MSW.depositPublicAleoCredits(AleoUtils.accounts[0], TEST_WALLET_ID, '1000u128');
            }
        }

        // Ensure the wallet has test tokens
        {
            const balance = await MSW.getWalletBalance(TEST_WALLET_ID, AleoUtils.TEST_TOKEN_ID);
            if (balance < 1000n) {
                console.log(`Depositing test tokens to wallet ${TEST_WALLET_ID}...`);
                await MSW.depositPublicToken(AleoUtils.accounts[0], TEST_WALLET_ID, AleoUtils.TEST_TOKEN_ID, '1000u128');
            }
        }
    });

    test('Can deposit private credits to wallet', async () => {
        const transferTx = await Credits.transferPublicToPrivate(AleoUtils.accounts[1], AleoUtils.addresses[2], '123u64');
        const creditsRecord = transferTx.ownedRecords(AleoUtils.accounts[2].viewKey())[0].toString();
        console.log('Private credits record:', creditsRecord);

        const initialBalance = await MSW.getWalletBalance(TEST_WALLET_ID, AleoUtils.CREDITS_RESERVED_TOKEN_ID);
        console.log(`Initial wallet balance: ${initialBalance}`);

        const depositTx = await MSW.depositPrivateCredits(AleoUtils.accounts[2], TEST_WALLET_ID, '103u128', creditsRecord);
        const changeRecord = depositTx.ownedRecords(AleoUtils.accounts[2].viewKey())[0].toJsObject();
        console.log('Change record:', changeRecord);
        expect(changeRecord.owner).toBe(`${AleoUtils.addresses[2]}.private`);
        expect(changeRecord.microcredits).toBe(20n); // 123 - 103 = 20

        const currentBalance = await MSW.getWalletBalance(TEST_WALLET_ID, AleoUtils.CREDITS_RESERVED_TOKEN_ID);
        console.log(`Current wallet balance: ${currentBalance}`);

        const change = currentBalance - initialBalance;
        console.log(`Wallet balance change: ${change}`);

        expect(change).toBe(103n);
    });

    test('Can deposit private tokens to wallet', async () => {
        const tokenRecord = await TokenRegistry.mintPrivateToken(AleoUtils.TEST_TOKEN_ID, AleoUtils.accounts[1], '1000u128');
        console.log('Minted token record:', tokenRecord.toString());


        const initialBalance = await MSW.getWalletBalance(TEST_WALLET_ID, AleoUtils.TEST_TOKEN_ID);
        console.log(`Initial wallet balance: ${initialBalance}`);

        const depositTx = await MSW.depositPrivateToken(AleoUtils.accounts[1], TEST_WALLET_ID, '910u128', tokenRecord);
        const changeRecord = depositTx.ownedRecords(AleoUtils.accounts[1].viewKey())[0].toJsObject();
        console.log('Change record:', changeRecord);
        expect(changeRecord.owner).toBe(`${AleoUtils.addresses[1]}.private`);
        expect(changeRecord.amount).toBe(90n); // 1000 - 910 = 90
        expect(changeRecord.token_id).toBe(AleoUtils.TEST_TOKEN_ID);

        const currentBalance = await MSW.getWalletBalance(TEST_WALLET_ID, AleoUtils.TEST_TOKEN_ID);
        console.log(`Current wallet balance: ${currentBalance}`);

        const change = currentBalance - initialBalance;
        console.log(`Wallet balance change: ${change}`);

        expect(change).toBe(910n);
    });

    test('Private multisig Credits transfer', async () => {
        const signingOpId = Field.random().toString();

        expect(await MSW.verifyPrivateTransferDetails(TEST_WALLET_ID, signingOpId, AleoUtils.CREDITS_RESERVED_TOKEN_ID, AleoUtils.addresses[3], '14u128')).toBe(false);
        const { transaction: signingTx, record: execRecord } = await MSW.initPrivateTransfer(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId, AleoUtils.CREDITS_RESERVED_TOKEN_ID, AleoUtils.addresses[3], '14u128');
        expect(await MSW.verifyPrivateTransferDetails(TEST_WALLET_ID, signingOpId, AleoUtils.CREDITS_RESERVED_TOKEN_ID, AleoUtils.addresses[3], '14u128')).toBe(true);

        const signingOpIdHash = AleoUtils.getAllTransactionOutputs(signingTx, AleoUtils.accounts[0])[0].value;
        const expectedSigningOpIdHash = MSW.getSigningOpIdHash(TEST_WALLET_ID, signingOpId);
        expect(signingOpIdHash).toBe(expectedSigningOpIdHash);

        await MSW.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId);

        const transaction = await MSW.execPrivateCreditsTransfer(AleoUtils.accounts[0], execRecord);
        const recipientRecord = transaction.ownedRecords(AleoUtils.accounts[3].viewKey())[0].toJsObject();
        expect(recipientRecord.owner).toBe(`${AleoUtils.addresses[3]}.private`);
        expect(recipientRecord.microcredits).toBe(14n);
    });

    test('Private multisig Token transfer', async () => {
        const signingOpId = Field.random().toString();

        expect(await MSW.verifyPrivateTransferDetails(TEST_WALLET_ID, signingOpId, AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[3], '12u128')).toBe(false);
        const { transaction: signingTx, record: execRecord } = await MSW.initPrivateTransfer(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId, AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[3], '12u128');
        expect(await MSW.verifyPrivateTransferDetails(TEST_WALLET_ID, signingOpId, AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[3], '12u128')).toBe(true);

        const signingOpIdHash = AleoUtils.getAllTransactionOutputs(signingTx, AleoUtils.accounts[0])[0].value;
        const expectedSigningOpIdHash = MSW.getSigningOpIdHash(TEST_WALLET_ID, signingOpId);
        expect(signingOpIdHash).toBe(expectedSigningOpIdHash);

        await MSW.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId);

        const transaction = await MSW.execPrivateTokenTransfer(AleoUtils.accounts[0], execRecord);
        const recipientRecord = transaction.ownedRecords(AleoUtils.accounts[3].viewKey())[0].toJsObject();
        expect(recipientRecord.owner).toBe(`${AleoUtils.addresses[3]}.private`);
        expect(recipientRecord.amount).toBe(12n);
        expect(recipientRecord.token_id).toBe(AleoUtils.TEST_TOKEN_ID);
    });

    test('Public multisig Token transfer', async () => {
        const signingOpId = Field.random().toString();
        const signingTx = await MSW.initPublicTransfer(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId, AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[2], "17u128");

        const signingOpIdHash = AleoUtils.getAllTransactionOutputs(signingTx, AleoUtils.accounts[0])[0].value;
        const expectedSigningOpIdHash = MSW.getSigningOpIdHash(TEST_WALLET_ID, signingOpId);
        expect(signingOpIdHash).toBe(expectedSigningOpIdHash);

        await MSW.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId);

        const balance1 = await TokenRegistry.getPublicBalance(AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[2]);
        console.log(`Balance for ${AleoUtils.addresses[2]} before transfer:`, balance1);

        await MSW.execPublicTokenTransfer(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId, AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[2], "17u128");

        const balance2 = await TokenRegistry.getPublicBalance(AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[2]);
        console.log(`Balance for ${AleoUtils.addresses[2]} before transfer:`, balance2);

        expect(balance2 - balance1).toBe(17n);
    });

    test('Public multisig Credits transfer', async () => {
        const signingOpId = Field.random().toString();
        const signingTx = await MSW.initPublicTransfer(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId, AleoUtils.CREDITS_RESERVED_TOKEN_ID, AleoUtils.addresses[2], "3u128");

        const signingOpIdHash = AleoUtils.getAllTransactionOutputs(signingTx, AleoUtils.accounts[0])[0].value;
        const expectedSigningOpIdHash = MSW.getSigningOpIdHash(TEST_WALLET_ID, signingOpId);
        expect(signingOpIdHash).toBe(expectedSigningOpIdHash);

        await MSW.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId);

        const balance1 = Plaintext.fromString(await AleoUtils.getNetworkClient().getProgramMappingValue("credits.aleo", "account", AleoUtils.addresses[2])).toObject();
        console.log(`Balance for ${AleoUtils.addresses[2]} before transfer:`, balance1);

        await MSW.execPublicCreditsTransfer(AleoUtils.accounts[0], TEST_WALLET_ID, signingOpId, AleoUtils.CREDITS_RESERVED_TOKEN_ID, AleoUtils.addresses[2], "3u128");

        const balance2 = Plaintext.fromString(await AleoUtils.getNetworkClient().getProgramMappingValue("credits.aleo", "account", AleoUtils.addresses[2])).toObject();
        console.log(`Balance for ${AleoUtils.addresses[2]} before transfer:`, balance2);

        expect(balance2 - balance1).toBe(3n);
    });

    /*test('testPrivateToPublicTransfer', async () => {
        await TokenRegistry.initRegistry();
        await TokenRegistry.registerTestToken();
        const tokenRecord = await TokenRegistry.mintPrivateToken(AleoUtils.TEST_TOKEN_ID, AleoUtils.accounts[3], '1000u128');
        console.log('Minted token record:', tokenRecord.toString());

        const initialBalance = await TokenRegistry.getPublicBalance(AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[1]);

        await TokenRegistry.transferPrivateToPublic(AleoUtils.accounts[3], tokenRecord.toString(), AleoUtils.addresses[1], '123u128');

        const currentBalance = await TokenRegistry.getPublicBalance(AleoUtils.TEST_TOKEN_ID, AleoUtils.addresses[1]);

        const change = currentBalance - initialBalance;
        console.log(`Public balance change for ${AleoUtils.addresses[1]}:`, change);

        expect(change).toBe(123n);
    });*/

    test('Mixed Aleo and ECDSA signers can execute wallet operations', async () => {
        const MIXED_WALLET_ID = AleoUtils.randomAddress();

        // Create an Ethereum wallet for ECDSA signing
        const ethWallet = Wallet.createRandom();

        console.log(`Creating wallet with mixed signers:`);
        console.log(`  Aleo signer: ${AleoUtils.addresses[2]}`);
        console.log(`  ECDSA signer: ${ethWallet.address}`);

        // Create wallet with threshold=2, 1 Aleo signer, 1 ECDSA signer
        await MSW.createWallet(
            AleoUtils.accounts[0],
            MIXED_WALLET_ID,
            2,
            [AleoUtils.addresses[2]], // 1 Aleo signer
            [ethWallet.address],      // 1 ECDSA signer
            false
        );

        // Verify wallet was created with correct settings
        const wallet = await MSW.getWallet(MIXED_WALLET_ID);
        expect(wallet).not.toBeNull();
        expect(wallet.threshold).toBe(2);
        expect(wallet.num_signers).toBe(2);
        console.log(`Wallet created: threshold=${wallet.threshold}, num_signers=${wallet.num_signers}`);

        // Deposit test tokens to the wallet
        console.log('Depositing test tokens to mixed wallet...');
        await MSW.depositPublicToken(AleoUtils.accounts[0], MIXED_WALLET_ID, AleoUtils.TEST_TOKEN_ID, '500u128');

        const initialBalance = await MSW.getWalletBalance(MIXED_WALLET_ID, AleoUtils.TEST_TOKEN_ID);
        console.log(`Mixed wallet token balance: ${initialBalance}`);
        expect(initialBalance).toBeGreaterThanOrEqual(500n);

        // Execute a public token transfer with mixed signatures
        const signingOpId = Field.random().toString();
        const recipient = AleoUtils.addresses[3];
        const transferAmount = '25u128';

        console.log(`Initiating public token transfer of ${transferAmount} to ${recipient}...`);
        const signingTx = await MSW.initPublicTransfer(
            AleoUtils.accounts[0],
            MIXED_WALLET_ID,
            signingOpId,
            AleoUtils.TEST_TOKEN_ID,
            recipient,
            transferAmount
        );

        const signingOpIdHash = AleoUtils.getAllTransactionOutputs(signingTx, AleoUtils.accounts[0])[0].value;
        const expectedSigningOpIdHash = MSW.getSigningOpIdHash(MIXED_WALLET_ID, signingOpId);
        expect(signingOpIdHash).toBe(expectedSigningOpIdHash);

        // Verify signing is not yet complete
        let isComplete = await MSW.isSigningComplete(MIXED_WALLET_ID, signingOpId);
        expect(isComplete).toBe(false);
        console.log('Signing not complete after init (0/2 signatures)');

        // Add Aleo signature
        console.log('Adding Aleo signature...');
        await MSW.sign(AleoUtils.accounts[2], MIXED_WALLET_ID, signingOpId);

        // Verify still not complete (1/2 signatures)
        isComplete = await MSW.isSigningComplete(MIXED_WALLET_ID, signingOpId);
        expect(isComplete).toBe(false);
        console.log('Signing not complete after first signature (1/2 signatures)');

        // Add ECDSA signature
        console.log('Adding ECDSA signature...');
        await MSW.signEcdsa(AleoUtils.accounts[0], ethWallet, MIXED_WALLET_ID, signingOpId);

        // Verify signing is now complete
        isComplete = await MSW.isSigningComplete(MIXED_WALLET_ID, signingOpId);
        expect(isComplete).toBe(true);
        console.log('Signing operation completed (2/2 signatures: 1 Aleo + 1 ECDSA)');

        // Execute the transfer
        const recipientBalanceBefore = await TokenRegistry.getPublicBalance(AleoUtils.TEST_TOKEN_ID, recipient);
        console.log(`Recipient balance before transfer: ${recipientBalanceBefore}`);

        await MSW.execPublicTokenTransfer(
            AleoUtils.accounts[0],
            MIXED_WALLET_ID,
            signingOpId,
            AleoUtils.TEST_TOKEN_ID,
            recipient,
            transferAmount
        );

        const recipientBalanceAfter = await TokenRegistry.getPublicBalance(AleoUtils.TEST_TOKEN_ID, recipient);
        console.log(`Recipient balance after transfer: ${recipientBalanceAfter}`);

        expect(recipientBalanceAfter - recipientBalanceBefore).toBe(25n);
        console.log('Mixed signer wallet operation completed successfully!');
    });

    test('Public transfer can expire and be re-initiated', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MSW.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [AleoUtils.addresses[0], AleoUtils.addresses[1]],
            [],
        );

        // Fund the wallet with public tokens
        await MSW.depositPublicToken(AleoUtils.accounts[0], TEST_WALLET_ID, AleoUtils.TEST_TOKEN_ID, '1000u128');

        const signingOpId = Field.random().toString();
        const blockExpiration = 1;
        const recipient = AleoUtils.addresses[2];
        const amount = '100u128';

        // Step 1: Initiate public transfer with short expiration
        console.log('Initiating public transfer that will expire...');
        await MSW.initPublicTransfer(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            AleoUtils.TEST_TOKEN_ID,
            recipient,
            amount,
            blockExpiration
        );

        // Step 2: Let it expire
        console.log('Waiting for expiration...');
        await AleoUtils.advanceBlocks(blockExpiration + 1);

        // Step 2b: Verify operations fail on expired op
        console.log('Verifying operations fail on expired op...');

        // Try to sign (should fail because it's expired)
        await expect(
            MSW.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId)
        ).rejects.toThrow();

        // Verify not complete
        const isCompleteBeforeReinit = await MSW.isSigningComplete(TEST_WALLET_ID, signingOpId);
        expect(isCompleteBeforeReinit).toBe(false);

        // Try to execute (should fail because not complete)
        await expect(
            MSW.execPublicTokenTransfer(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                AleoUtils.TEST_TOKEN_ID,
                recipient,
                amount
            )
        ).rejects.toThrow();

        // Step 3: Re-initiate the same public transfer
        console.log('Re-initiating the public transfer...');
        await MSW.initPublicTransfer(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            AleoUtils.TEST_TOKEN_ID,
            recipient,
            amount,
            blockExpiration
        );

        // Step 4: Add required signature
        console.log('Adding signature...');
        await MSW.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId);

        // Verify complete
        const isComplete = await MSW.isSigningComplete(TEST_WALLET_ID, signingOpId);
        expect(isComplete).toBe(true);

        // Step 5: Execute
        const balanceBefore = await TokenRegistry.getPublicBalance(AleoUtils.TEST_TOKEN_ID, recipient);

        console.log('Executing re-initiated public transfer...');
        await MSW.execPublicTokenTransfer(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            AleoUtils.TEST_TOKEN_ID,
            recipient,
            amount
        );

        // Step 6: Verify transfer
        const balanceAfter = await TokenRegistry.getPublicBalance(AleoUtils.TEST_TOKEN_ID, recipient);
        expect(balanceAfter - balanceBefore).toBe(100n);
        console.log('Public transfer successfully executed after re-initiation');

        // Step 7: Verify cannot reuse op id after completion
        console.log('Verifying cannot reuse op id after completion...');
        await expect(
            MSW.initPublicTransfer(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                AleoUtils.TEST_TOKEN_ID,
                recipient,
                amount,
                blockExpiration
            )
        ).rejects.toThrow();
    });

    test('Private transfer can expire and be re-initiated', async () => {
        const TEST_WALLET_ID = AleoUtils.randomAddress();
        await MSW.createWallet(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            2,
            [AleoUtils.addresses[0], AleoUtils.addresses[1]],
            [],
        );

        // Fund the wallet with private tokens
        const mintRecord = await TokenRegistry.mintPrivateToken(AleoUtils.TEST_TOKEN_ID, AleoUtils.accounts[0], '1000u128');
        await MSW.depositPrivateToken(AleoUtils.accounts[0], TEST_WALLET_ID, '1000u128', mintRecord);

        const signingOpId = Field.random().toString();
        const blockExpiration = 1;
        const recipient = AleoUtils.addresses[2];
        const amount = '100u128';

        // Step 1: Initiate private transfer with short expiration
        console.log('Initiating private transfer that will expire...');
        const { record: expiredRecord } = await MSW.initPrivateTransfer(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            AleoUtils.TEST_TOKEN_ID,
            recipient,
            amount,
            blockExpiration
        );

        // Step 2: Let it expire
        console.log('Waiting for expiration...');
        await AleoUtils.advanceBlocks(blockExpiration + 1);

        // Step 2b: Verify operations fail on expired op
        console.log('Verifying operations fail on expired op...');

        // Try to sign (should fail because it's expired)
        await expect(
            MSW.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId)
        ).rejects.toThrow();

        // Verify not complete
        const isCompleteBeforeReinit = await MSW.isSigningComplete(TEST_WALLET_ID, signingOpId);
        expect(isCompleteBeforeReinit).toBe(false);

        // Try to execute (should fail because signatures not collected)
        await expect(
            MSW.execPrivateTokenTransfer(
                AleoUtils.accounts[0],
                expiredRecord
            )
        ).rejects.toThrow();

        // Step 3: Re-initiate the same private transfer
        console.log('Re-initiating the private transfer...');
        const { record: validRecord } = await MSW.initPrivateTransfer(
            AleoUtils.accounts[0],
            TEST_WALLET_ID,
            signingOpId,
            AleoUtils.TEST_TOKEN_ID,
            recipient,
            amount,
            blockExpiration
        );

        // Ensure we got a new record
        expect(validRecord.toString()).not.toBe(expiredRecord.toString());

        // Step 4: Add required signature
        console.log('Adding signature...');
        await MSW.sign(AleoUtils.accounts[1], TEST_WALLET_ID, signingOpId);

        // Verify complete
        const isComplete = await MSW.isSigningComplete(TEST_WALLET_ID, signingOpId);
        expect(isComplete).toBe(true);

        // Step 5: Execute using the NEW record
        console.log('Executing re-initiated private transfer...');
        const transaction = await MSW.execPrivateTokenTransfer(
            AleoUtils.accounts[0],
            validRecord
        );

        // Step 6: Verify output
        const recipientRecord = transaction.ownedRecords(AleoUtils.accounts[2].viewKey())[0].toJsObject();

        expect(recipientRecord.owner).toBe(`${recipient}.private`);
        expect(recipientRecord.amount).toBe(100n);
        expect(recipientRecord.token_id).toBe(AleoUtils.TEST_TOKEN_ID);

        console.log('Private transfer successfully executed after re-initiation');

        // Step 7: Verify cannot reuse op id after completion
        console.log('Verifying cannot reuse op id after completion...');
        await expect(
            MSW.initPrivateTransfer(
                AleoUtils.accounts[0],
                TEST_WALLET_ID,
                signingOpId,
                AleoUtils.TEST_TOKEN_ID,
                recipient,
                amount,
                blockExpiration
            )
        ).rejects.toThrow();
    });
});