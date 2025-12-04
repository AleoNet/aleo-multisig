import { BHP256, Plaintext } from "@provablehq/sdk"

const walletId = process.argv[2];
const userAddress = process.argv[3];

if (!walletId || !userAddress) {
  console.error(`Usage: node ${process.argv[1]} <wallet_id> <user_address>`);
  process.exit(1);
}

const hasher = new BHP256()
console.log(hasher.hash(Plaintext.fromString(`{wallet_id: ${walletId}, user: ${userAddress}}`).toBitsLe()).toString());
