# Aleo Modular Multisig System

A modular multi-signature implementation for Aleo that provides reusable multisig functionality and an example wallet application.

## Architecture Overview

The multisig engine is implemented in the `multisig_core.aleo` program. It is built in a way that supports multiple wallets.
In this context, a multisig wallet:
* Is identified by a `wallet_id`, which has been chosen to be an `address` type.
* Has a set threshold that specifies the number of signatures required to confirm an operation.
* Has a list of signers that are allowed to sign operations. Signers can be either Aleo addresses or ECDSA (Ethereum) addresses.
* Allows changing the threshold and adding/removing signers via administrative operations.

The `wallet_id` being an `address` type makes it easy for other Aleo programs that want to use the multisig functionality to have their own set of signers/threshold directly tied to the program itself.

A program called `multisig_wallet.aleo` demonstrates how a wallet holding Aleo credits and `token_registry.aleo` tokens can be built using the functionality provided by `multisig_core.aleo`.

Creating a wallet is done using the `multisig_core.aleo/create_wallet` transition. It receives the `wallet_id`, as well as the initial threshold and set of signers. The threshold and signers can later be updated via administrative operations.

A multisig operation consists of three phases:
1. Initializing the signing operation. At this point, a unique identifier called `signing_op_id` is chosen by the user, along with a `block_expiration` height (relative to the current block height). This unique identifier is used to identify the operation throughout the signing process. Depending on the usecase this can either be a random value, or derived from inputs that uniquely identify the signing operation. Note that `signing_op_id`s cannot be reused if the operation is currently active or has been successfully executed. However, if an operation expires without being executed, the `signing_op_id` can be reused to restart the process. For example, see calls such as `init_public_transfer` (in the `multisig_wallet.aleo` program) or `init_admin_op` (in the `multisig_core.aleo` program). Initializing can be done by anyone, whether they are an authorized signer or not. If they are, this will count as the first signature.
2. Signing by authorized signers until the threshold is met, done by calling the `sign` transition (for Aleo signers) or `sign_ecdsa` transition (for ECDSA signers) on the `multisig_core.aleo` program, passing it the `wallet_id` and `signing_op_id`. Signatures must be submitted before the operation expires (i.e., current block height < start height + block expiration).
3. Finally, once enough signatures have been provided, someone needs to execute the multisig-gated operation. This is done by calling an execute function - for example `exec_public_credit_transfer` (in `multisig_wallet.aleo`) or `exec_admin_op` (in `multisig_core.aleo`). The execute transition verifies that enough signatures have been provided, and if so executes the operation that was gated by the multisig scheme. Note that the number of signatures required is determined by the current threshold, not the threshold at the time of initialization.

### Some notes regarding privacy

This implementation does not try to hide the signer identities (addresses). A decision was made to prioritize code simplicity and ease of usability as much as possible.
Hiding signer identities would likely only be possible using Aleo Records, similar to the approach used in https://github.com/zerosecurehq/zerosecure-multisig-program/tree/main, which uses records to grant signing privileges. By avoiding records the implementation presented here provides support for an unlimited number of signers, and a simplified interface that is more user friendly and require less work when wallet configuration changes.

## Global Configuration

The `multisig_core.aleo` program includes a global configuration that must be initialized via the `init` transition.

**Note:** The `init` transition can only be called by the hardcoded `DEPLOYER_ADDRESS`.

### Guarded Wallet Creation

The `init` transition accepts a `guard_create_wallet` boolean flag:
* `false`: Open mode. Anyone can create a new multisig wallet.
* `true`: Guarded mode. Creating a new wallet requires authorization from the `multisig_core.aleo` wallet itself (the "Guard Wallet").

In guarded mode, to create a wallet with `wallet_id`:
1. Calculate the `signing_op_id` by hashing a `GuardedCreateWalletOp` struct:
   ```leo
   struct GuardedCreateWalletOp {
       guarded_create_wallet_id: address, // The wallet_id to be created
   }
   ```
2. Authorized signers of `multisig_core.aleo` must sign this `signing_op_id` using the standard signing flow.
3. Once the signature threshold is met, `create_wallet` can be called. The program verifies that the creation of this specific `wallet_id` has been approved by the Guard Wallet.

## Upgradability and Permissions

The `multisig_core.aleo` program includes built-in access controls for deployment and upgrades.

### Roles
* **Deployer**: The address allowed to deploy the initial version (`edition == 0`) and call the `init` transition.
* **Upgrader**: The address allowed to deploy future versions (`edition > 0`) and call `disallow_upgrades`.

**IMPORTANT:** These addresses are hardcoded as `const` in `multisig_core.aleo`. You **MUST** change them to your own addresses before deployment.

### Upgrade Kill Switch
The program includes an upgrade kill switch. By default, upgrades are allowed (initialized to `true` in `init`).
The **Upgrader** can permanently disable future upgrades by calling the `disallow_upgrades` transition. Once set to `false`, no further program upgrades can be deployed (enforced by the `constructor`).

## Other examples

In addition to the `multisig_wallet.aleo` program, we provide a `test_upgrades.aleo` program that shows how program upgrades can be gated behind a multisig operation.

## Development Setup

### Prerequisites
- `leo` CLI for program compilation and deployment. **The code here is known to work with `leo 3.3.1`.**
- Node.js 22+ for running tests
- Local Aleo network (devnet recommended for testing)

### Environment Configuration

**Root directory `.env`:**
```
NETWORK=testnet
PRIVATE_KEY=APrivateKey1zkp8CZNn3yeCseEtxuVPbDCwSyhGW6yZKUYKfgXmcpoGPWH
ENDPOINT=http://localhost:3030
CONSENSUS_VERSION_HEIGHTS=0,1,2,3,4,5,6,7,8,9,10
```

### Starting a local devnet

You will want to start a local devnet using this command, **using your custom-built leo binary**:
```bash
leo devnet --storage tmp --clear-storage --snarkos ./tmp/snarkos --snarkos-features test_network --install
leo devnet --storage tmp --clear-storage --snarkos ./tmp/snarkos --snarkos-features test_network --tmux --consensus-heights 0,1,2,3,4,5,6,7,8,9,10
```

### Deploying the programs

From inside the `programs/multisig_wallet` directory, run:
```bash
leo deploy --broadcast --consensus-heights 0,1,2,3,4,5,6,7,8,9,10 -y
```

**Initializing the core program:**

After deployment, you must initialize the `multisig_core.aleo` program. For example, to allow open wallet creation:
```bash
leo execute --broadcast --yes multisig_core.aleo/init false
```

### Running tests

After you have built a custom version of the SDK as mentioned in the Prerequisities section above, go to the `tests` directory run `npm install`.

You should then be able to run `npm test`. The test suite uses `jest` and you can run a specific test instead of the whole suite if desired. For example:
```bash
export CONSENSUS_VERSION_HEIGHTS=0,1,2,3,4,5,6,7,8,9,10
npm test -- -t 'Cannot create wallet with threshold greater than number of signers'
```
