import { BHP256, Plaintext } from "@provablehq/sdk"

const walletId = process.argv[2];
const signingOpId = process.argv[3];

if (!walletId || !signingOpId) {
  console.error(`Usage: node ${process.argv[1]} <wallet_id> <signing_op_id>`);
  process.exit(1);
}

const hasher = new BHP256()
console.log(hasher.hash(Plaintext.fromString(`{wallet_id: ${walletId}, signing_op_id: ${signingOpId}}`).toBitsLe()).toString());
