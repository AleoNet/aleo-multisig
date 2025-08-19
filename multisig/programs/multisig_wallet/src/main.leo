import multisig_core.aleo;
import credits.aleo;
import token_registry.aleo;

program multisig_wallet.aleo {
    const CREDITS_RESERVED_TOKEN_ID: field = 3443843282313283355522573239085696902919850365217539366784739393210722344986field;

    struct Transfer {
        token_id: field,
        destination: address,
        amount: u128,
    }

    struct BalanceKey {
        wallet_id: address,
        token_id: field,
    }

    mapping balances: field => u128; // hash_to_field(BalanceKey) => u128;
    mapping pending_public_transfers: field => Transfer; // hash(WalletSigningOpId) => Transfer

    //@noupgrade
    @admin(address="aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px")
    async constructor(){}

    //////////////////////////////////////////////////////////////////////////
    // readonly helpers
    ///////////////////////////////////////////////////////////////////////////

    transition get_balance_key(public wallet_id: address, public token_id: field) -> field {
        let balance_key: BalanceKey = BalanceKey { wallet_id: wallet_id, token_id: token_id };
        return BHP256::hash_to_field(balance_key);
    }

    //////////////////////////////////////////////////////////////////////////
    // public deposit into the wallet
    ///////////////////////////////////////////////////////////////////////////

    async transition deposit_public_aleo_credits(public wallet_id: address, public amount: u128) -> Future {
        let balance_key: BalanceKey = BalanceKey { wallet_id: wallet_id, token_id: CREDITS_RESERVED_TOKEN_ID };
        let balance_key_hash: field = BHP256::hash_to_field(balance_key);

        let transfer_fut: Future = credits.aleo/transfer_public_as_signer(self.address, amount as u64);
        return fin_deposit_public(balance_key_hash, amount, transfer_fut);
    }

    async transition deposit_public_token(public wallet_id: address, public token_id: field, public amount: u128) -> Future {
        assert_neq(token_id, CREDITS_RESERVED_TOKEN_ID);

        let balance_key: BalanceKey = BalanceKey { wallet_id: wallet_id, token_id: token_id };
        let balance_key_hash: field = BHP256::hash_to_field(balance_key);

        let transfer_fut: Future = token_registry.aleo/transfer_public_as_signer(token_id, self.address, amount);
        return fin_deposit_public(balance_key_hash, amount, transfer_fut);
    }

    async function fin_deposit_public(balance_key_hash: field, amount: u128, transfer_fut: Future) {
        let current_balance: u128 = Mapping::get_or_use(balances, balance_key_hash, 0u128);
        let new_balance: u128 = current_balance + amount;
        Mapping::set(balances, balance_key_hash, new_balance);

        transfer_fut.await();
    }

    //////////////////////////////////////////////////////////////////////////
    // public transfer out of the wallet
    ///////////////////////////////////////////////////////////////////////////

    // Create a new signing operation and track it.
    // * walllet_id must have been previously set up with multisig_core.aleo/create_wallet
    // * signing_op_id is a random unique identifier for this transfer
    async transition init_public_transfer(public wallet_id: address, public signing_op_id: field, public block_expiration: u32, transfer: Transfer) -> (field, Future) {
        let (wallet_signing_op_id_hash, init_signing_op_fut) = multisig_core.aleo/initiate_signing_op(wallet_id, signing_op_id, block_expiration);
        return (wallet_signing_op_id_hash, async {
            init_signing_op_fut.await();

            let balance_key_hash: field = BHP256::hash_to_field(BalanceKey { wallet_id: wallet_id, token_id: transfer.token_id });
            let current_balance: u128 = Mapping::get(balances, balance_key_hash);
            assert_eq(current_balance >= transfer.amount, true);

            // NOTE: We do not care if there is an existing entry in public_transfers for the same signing_op_id_hash because
            // initiate_signing_op will only succeed if this is a new signing operation. There might be an existing entry for
            // an expired sigining operation, which we are fine overwriting.
            pending_public_transfers.set(wallet_signing_op_id_hash, transfer);
        });
    }

    async transition exec_public_credits_transfer(public wallet_id: address, public signing_op_id: field, transfer: Transfer) -> Future {
        assert_eq(transfer.token_id, CREDITS_RESERVED_TOKEN_ID);
        let signing_complete_fut = multisig_core.aleo/assert_signing_completed(wallet_id, signing_op_id);
        let transfer_fut = credits.aleo/transfer_public(transfer.destination, transfer.amount as u64);

        let wallet_signing_op_id_hash = multisig_core.aleo/get_signing_op_id_hash_fn(wallet_id, signing_op_id);

        return fin_exec_public_transfer(wallet_signing_op_id_hash, wallet_id, signing_op_id, transfer, signing_complete_fut, transfer_fut);
    }

    async transition exec_public_token_transfer(public wallet_id: address, public signing_op_id: field, transfer: Transfer) -> Future {
        assert_neq(transfer.token_id, CREDITS_RESERVED_TOKEN_ID);
        let signing_complete_fut = multisig_core.aleo/assert_signing_completed(wallet_id, signing_op_id);
        let transfer_fut = token_registry.aleo/transfer_public(transfer.token_id, transfer.destination, transfer.amount);

        let wallet_signing_op_id_hash = multisig_core.aleo/get_signing_op_id_hash_fn(wallet_id, signing_op_id);

        return fin_exec_public_transfer(wallet_signing_op_id_hash, wallet_id, signing_op_id, transfer, signing_complete_fut, transfer_fut);
    }

    async function fin_exec_public_transfer(wallet_signing_op_id_hash: field, wallet_id: address, signing_op_id: field, transfer: Transfer, signing_complete_fut: Future, transfer_fut: Future) {
        let balance_key_hash: field = BHP256::hash_to_field(BalanceKey { wallet_id: wallet_id, token_id: transfer.token_id });

        // Signing must be completed.
        signing_complete_fut.await();

        // Must have enough balance.
        let current_balance: u128 = Mapping::get(balances, balance_key_hash);
        assert_eq(current_balance >= transfer.amount, true);

        // Details must match!
        let pending_transfer = pending_public_transfers.get(wallet_signing_op_id_hash);
        assert_eq(pending_transfer, transfer);

        // Execute transfer and remove pending transfers so it can't be executed again.
        let new_balance: u128 = current_balance - transfer.amount;
        Mapping::set(balances, balance_key_hash, new_balance);

        transfer_fut.await();

        // Removing is crucial, otherwise the operation can be executed twice.
        pending_public_transfers.remove(wallet_signing_op_id_hash);
    }

    //////////////////////////////////////////////////////////////////////////
    // private deposit into the wallet
    ///////////////////////////////////////////////////////////////////////////

    async transition deposit_private_aleo_credits(public wallet_id: address, public amount: u128, credits: credits.aleo/credits) -> (credits.aleo/credits, Future) {
        let balance_key: BalanceKey = BalanceKey { wallet_id: wallet_id, token_id: CREDITS_RESERVED_TOKEN_ID };
        let balance_key_hash: field = BHP256::hash_to_field(balance_key);

        let (remaining_credits, transfer_fut) = credits.aleo/transfer_private_to_public(credits, self.address, amount as u64);
        return (remaining_credits, f_deposit_private(balance_key_hash, amount, transfer_fut));
    }

    async transition deposit_private_token(public wallet_id: address, public amount: u128, token: token_registry.aleo/Token) -> (token_registry.aleo/Token, Future) {
        assert_neq(token.token_id, CREDITS_RESERVED_TOKEN_ID);

        let balance_key: BalanceKey = BalanceKey { wallet_id: wallet_id, token_id: token.token_id};
        let balance_key_hash: field = BHP256::hash_to_field(balance_key);

        let (remaining_token, transfer_fut) = token_registry.aleo/transfer_private_to_public(self.address, amount, token);
        return (remaining_token, f_deposit_private(balance_key_hash, amount, transfer_fut));
    }

    async function f_deposit_private(balance_key_hash: field, amount: u128, transfer_fut: Future) {
        let current_balance: u128 = Mapping::get_or_use(balances, balance_key_hash, 0u128);
        let new_balance: u128 = current_balance + amount;
        Mapping::set(balances, balance_key_hash, new_balance);

        transfer_fut.await();
    }

    //////////////////////////////////////////////////////////////////////////
    // private transfer out of the wallet
    ///////////////////////////////////////////////////////////////////////////

    // Details that we hash into the private_transfers map.
    // Never stored directly on the chain.
    struct PrivateTransferDetails {
        wallet_id: address,
        signing_op_id: field,
        transfer: Transfer,
    }

    // Aside from the transaction initiator (the executor), no one knows the transfer details as they are
    // only stored in the ExecutePrivateTransfer record.
    // However, we must have a way for signers to confirm they are signing the transaction they think they are signing.
    // The idea here is that the transaction details are communicated to them out-of-band and they can then check this
    // hashmap and see if it contains the entry they expect.
    mapping private_transfers: field => field; // hash(WalletSigningOpId) => hash(PrivateTransferDetails)

    record ExecutePrivateTransfer {
        owner: address,
        details: PrivateTransferDetails,
    }

    async transition init_private_transfer(public wallet_id: address, public signing_op_id: field, public block_expiration: u32, transfer: Transfer) -> (field, ExecutePrivateTransfer, Future) {
        let (wallet_signing_op_id_hash, init_signing_op_fut) = multisig_core.aleo/initiate_signing_op(wallet_id, signing_op_id, block_expiration);

        let details = PrivateTransferDetails {
            wallet_id: wallet_id,
            signing_op_id: signing_op_id,
            transfer: transfer,
        };
        let details_hash = BHP256::hash_to_field(details);

        let execute_record = ExecutePrivateTransfer {
            owner: self.signer,
            details: details,
        };

        return (wallet_signing_op_id_hash, execute_record, async {
            // NOTE: For simplicity's sake we do not check the current balance. The balance gets verified during the execution phase.

            init_signing_op_fut.await();

            // NOTE: We do not care if there is an existing entry in private_transfers for the same signing_op_id_hash because
            // initiate_signing_op will only succeed if this is a new signing operation. There might be an existing entry for
            // an expired sigining operation, which we are fine overwriting.
            private_transfers.set(wallet_signing_op_id_hash, details_hash);
        });
    }

    async transition exec_private_credits_transfer(exec: ExecutePrivateTransfer) -> (credits.aleo/credits, Future) {
        assert_eq(exec.details.transfer.token_id, CREDITS_RESERVED_TOKEN_ID);

        let signing_complete_fut = multisig_core.aleo/assert_signing_completed(exec.details.wallet_id, exec.details.signing_op_id);
        let (receiver_credits, transfer_fut) = credits.aleo/transfer_public_to_private(
            exec.details.transfer.destination, exec.details.transfer.amount as u64);

        let wallet_signing_op_id_hash = multisig_core.aleo/get_signing_op_id_hash_fn(exec.details.wallet_id, exec.details.signing_op_id);
        let balance_key_hash: field = BHP256::hash_to_field(BalanceKey { wallet_id: exec.details.wallet_id, token_id: exec.details.transfer.token_id });
        let details_hash = BHP256::hash_to_field(exec.details);

        return (receiver_credits, fin_exec_private_transfer(
            wallet_signing_op_id_hash,
            details_hash,
            balance_key_hash,
            exec.details.transfer.amount,
            signing_complete_fut,
            transfer_fut));
    }

    async transition exec_private_token_transfer(exec: ExecutePrivateTransfer) -> (token_registry.aleo/Token, Future) {
        assert_neq(exec.details.transfer.token_id, CREDITS_RESERVED_TOKEN_ID);

        let signing_complete_fut = multisig_core.aleo/assert_signing_completed(exec.details.wallet_id, exec.details.signing_op_id);
        let (receiver_token, transfer_fut) = token_registry.aleo/transfer_public_to_private(
            exec.details.transfer.token_id,
            exec.details.transfer.destination,
            exec.details.transfer.amount,
            false,
        );

        let wallet_signing_op_id_hash = multisig_core.aleo/get_signing_op_id_hash_fn(exec.details.wallet_id, exec.details.signing_op_id);
        let balance_key_hash: field = BHP256::hash_to_field(BalanceKey { wallet_id: exec.details.wallet_id, token_id: exec.details.transfer.token_id });
        let details_hash = BHP256::hash_to_field(exec.details);

        return (receiver_token, fin_exec_private_transfer(
            wallet_signing_op_id_hash,
            details_hash,
            balance_key_hash,
            exec.details.transfer.amount,
            signing_complete_fut,
            transfer_fut));
    }

    async function fin_exec_private_transfer(
        wallet_signing_op_id_hash: field,
        details_hash: field,
        balance_key_hash: field,
        amount: u128,
        signing_complete_fut: Future,
        transfer_fut: Future
) {
        // Signing must be completed.
        signing_complete_fut.await();

        // Must have enough balance.
        let current_balance: u128 = Mapping::get(balances, balance_key_hash);
        assert_eq(current_balance >= amount, true);

        // Details must match!
        let pending_transfer_hash = private_transfers.get(wallet_signing_op_id_hash);
        assert_eq(pending_transfer_hash, details_hash);

        // Execute transfer. We don't need to remove anything from private_transfers since
        // the execution record was consumed.
        let new_balance: u128 = current_balance - amount;
        Mapping::set(balances, balance_key_hash, new_balance);

        transfer_fut.await();
    }

    transition get_private_transfer_hash(details: PrivateTransferDetails) -> field {
        return BHP256::hash_to_field(details);
    }
}
