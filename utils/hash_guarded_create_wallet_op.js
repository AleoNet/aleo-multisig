import { BHP256, Plaintext } from "@provablehq/sdk"

const ALEO_ZERO_ADDR = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';
const ETH_ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const walletId = process.argv[2];
let threshold = process.argv[3];

if (!walletId || !threshold) {
  console.error(`Usage: node ${process.argv[1]} <wallet_id> <threshold> [aleo_signer_1 ... aleo_signer_n] [-- ecdsa_signer_1 ... ecdsa_signer_n]`);
  console.error(`  - Aleo signers are listed before '--'`);
  console.error(`  - ECDSA signers are listed after '--'`);
  console.error(`  - Both lists will be padded to 4 with zero addresses`);
  process.exit(1);
}

// Strip u8 suffix if provided
if (threshold.endsWith('u8')) {
  threshold = threshold.slice(0, -2);
}

// Parse aleo and ecdsa signers separated by '--'
const args = process.argv.slice(4);
const separatorIndex = args.indexOf('--');

let aleoSigners, ecdsaSigners;
if (separatorIndex === -1) {
  aleoSigners = args;
  ecdsaSigners = [];
} else {
  aleoSigners = args.slice(0, separatorIndex);
  ecdsaSigners = args.slice(separatorIndex + 1);
}

// Pad to 4 elements
while (aleoSigners.length < 4) {
  aleoSigners.push(ALEO_ZERO_ADDR);
}
while (ecdsaSigners.length < 4) {
  ecdsaSigners.push(ETH_ZERO_ADDR);
}

function formatEcdsaSigner(hexAddress) {
  const cleanHex = hexAddress.startsWith('0x') ? hexAddress.slice(2) : hexAddress;
  const bytes = [];
  for (let i = 0; i < 40; i += 2) {
    bytes.push(parseInt(cleanHex.slice(i, i + 2), 16) + 'u8');
  }
  return `[${bytes.join(', ')}]`;
}

const aleoSignersFormatted = `[${aleoSigners.join(', ')}]`;
const ecdsaSignersFormatted = `[${ecdsaSigners.map(formatEcdsaSigner).join(', ')}]`;

const plaintext = `{wallet_id: ${walletId}, threshold: ${threshold}u8, aleo_signers: ${aleoSignersFormatted}, ecdsa_signers: ${ecdsaSignersFormatted}}`;
try {
  const hasher = new BHP256()
  console.log(hasher.hash(Plaintext.fromString(plaintext).toBitsLe()).toString());
} catch (e) {
  console.error('Failed to parse plaintext. Make sure wallet_id and aleo signers are valid Aleo addresses (aleo1...).');
  console.error('Plaintext:', plaintext);
  process.exit(1);
}
