import { BHP256, Plaintext } from "@provablehq/sdk"
import { getBytes } from "ethers";

const walletId = process.argv[2];
const userAddress = process.argv[3];

if (!walletId || !userAddress) {
  console.error(`Usage: node ${process.argv[1]} <wallet_id> <eth address>`);
  process.exit(1);
}

const ethAddrBytes = getBytes(userAddress)
if (ethAddrBytes.length != 20) {
  console.error(`Provided eth address must be exactly 20 bytes, got ${ethAddrBytes.length}`)
  process.exit(1);
}

function bytesToPlaintext(input) {
    const arr = Array.isArray(input) ? input : Array.from(input);
    const body = arr.map(b => `${b}u8`).join(", ");
    return `[${body}]`;
}

const hasher = new BHP256()
console.log(hasher.hash(Plaintext.fromString(`{wallet_id: ${walletId}, ecdsa_signer: ${bytesToPlaintext(ethAddrBytes)}}`).toBitsLe()).toString());
