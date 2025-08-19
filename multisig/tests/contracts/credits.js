import * as AleoUtils from '../lib/aleo-test-utils.js';

/**
 * JS Interface for credits.aleo meant to look like other interfaces in this project
 * (e.g. token-registry.js, msw-multisig.js)
 */


/**
 * Transfers public Aleo credits to private credits for a recipient
 *
 * @param {Account} senderAccount - The account sending the public credits
 * @param {string} recipientAddress - The address of the recipient receiving private credits
 * @param {string} amount - The amount of credits to transfer (as u64 string, e.g., "100u64")
 * @returns {Promise<Object>} The transaction object
 *
 * @example
 * const tx = await transferPublicToPrivate(accounts[0], "aleo1recipient...", "100u64");
 */
export async function transferPublicToPrivate(senderAccount, recipientAddress, amount) {
    console.log(`Transferring ${amount} public Aleo credits to private for ${recipientAddress}...`);

    const transaction = await AleoUtils.transact(
        senderAccount,
        "credits.aleo",
        "transfer_public_to_private",
        [recipientAddress, amount]
    );
    return transaction;
}
