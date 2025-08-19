# Init the multisig contract with 2 signers:
# - APrivateKey1zkp8CZNn3yeCseEtxuVPbDCwSyhGW6yZKUYKfgXmcpoGPWH
# - APrivateKey1zkp2RWGDcde3efb89rjhME1VYA8QMxcxep5DShNBR6n8Yjh

set -ex


GUARD_CREATE_WALLET="false"

for arg in "$@"
do
    case $arg in
        --guard-create-wallet)
        GUARD_CREATE_WALLET="true"
        shift
        ;;
    esac
done

$LEO execute --skip-execute-proof --broadcast --yes multisig_core.aleo/init $GUARD_CREATE_WALLET

if [ "$GUARD_CREATE_WALLET" = "true" ]; then
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
    bash "$SCRIPT_DIR/exec_create_guard_wallet.sh"
fi
