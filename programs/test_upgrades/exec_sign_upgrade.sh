set -e

LEO=~/Projects/aleo/leo/target/release/leo


CHECKSUM='[28u8, 231u8, 175u8, 130u8, 79u8, 138u8, 53u8, 14u8, 209u8, 249u8, 243u8, 35u8, 197u8, 83u8, 71u8, 222u8, 51u8, 176u8, 44u8, 190u8, 223u8, 160u8, 134u8, 251u8, 87u8, 34u8, 50u8, 51u8, 131u8, 165u8, 105u8, 112u8]'
EDITION=1u16

SIGNING_OP_ID=$($LEO execute --skip-execute-proof --yes test_upgrades.aleo/get_signing_op_id_for_deploy "$CHECKSUM" $EDITION | grep field | awk '{print $2}')
BLOCK_EXPIRATION=10u32
echo "Signing op id: $SIGNING_OP_ID"

$LEO execute --skip-execute-proof --yes --broadcast multisig_core.aleo/initiate_signing_op test_upgrades.aleo $SIGNING_OP_ID $BLOCK_EXPIRATION

PRIVATE_KEY=APrivateKey1zkp2RWGDcde3efb89rjhME1VYA8QMxcxep5DShNBR6n8Yjh $LEO execute --skip-execute-proof --yes --broadcast multisig_core.aleo/sign test_upgrades.aleo $SIGNING_OP_ID

$LEO upgrade --broadcast --consensus-heights 0,1,2,3,4,5,6,7,8,9,10,11 -y --skip multisig_core
