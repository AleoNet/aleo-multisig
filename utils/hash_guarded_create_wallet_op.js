import { BHP256, Plaintext } from "@provablehq/sdk"

const walletId = process.argv[2];

if (!walletId) {
  console.error(`Usage: node ${process.argv[1]} <wallet_id>`);
  process.exit(1);
}

const hasher = new BHP256()
console.log(hasher.hash(Plaintext.fromString(`{guarded_create_wallet_id: ${walletId}}`).toBitsLe()).toString());
