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

# Upgrader private key is: APrivateKey1zkp2RWGDcde3efb89rjhME1VYA8QMxcxep5DShNBR6n8Yjh
$LEO execute --skip-execute-proof --broadcast --yes multisig_core.aleo/init aleo1s3ws5tra87fjycnjrwsjcrnw2qxr8jfqqdugnf0xzqqw29q9m5pqem2u4t $GUARD_CREATE_WALLET

if [ "$GUARD_CREATE_WALLET" = "true" ]; then
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
    bash "$SCRIPT_DIR/exec_create_guard_wallet.sh"
fi
