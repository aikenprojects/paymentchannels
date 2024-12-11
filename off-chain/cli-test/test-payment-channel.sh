#!/bin/bash

# Configuration
CARDANO_TESTNET_MAGIC=2 # Update this for your testnet

# Directory structure
PROJECT_DIR="payment-channel"
mkdir -p "$PROJECT_DIR"/{keys,transactions,datums}

# Contract parameters
MIN_AMOUNT=5000000 # 5 ADA
TIMEOUT_SLOTS=100
COLLATERAL_ADA=5000000

# Protocol parameters
PROTOCOL_PARAMS="$PROJECT_DIR/protocol.json"
cardano-cli query protocol-parameters \
  --testnet-magic $CARDANO_TESTNET_MAGIC \
  --out-file $PROTOCOL_PARAMS

# Helper Functions
get_tip_slot() {
    cardano-cli query tip --testnet-magic $CARDANO_TESTNET_MAGIC | jq -r '.slot'
}

wait_for_tx() {
    local TX_ID=$1
    echo "Waiting for transaction $TX_ID to be confirmed..."
    while true; do
        if cardano-cli query utxo --tx-id $TX_ID --testnet-magic $CARDANO_TESTNET_MAGIC &>/dev/null; then
            echo "Transaction confirmed"
            break
        fi
        sleep 10
    done
}

# 1. Generate Addresses and Keys
generate_keys() {
    echo "Generating keys and addresses..."
    
    # Party 1
    cardano-cli address key-gen \
        --verification-key-file "$PROJECT_DIR/keys/party1.vkey" \
        --signing-key-file "$PROJECT_DIR/keys/party1.skey"
    
    cardano-cli address build \
        --payment-verification-key-file "$PROJECT_DIR/keys/party1.vkey" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file "$PROJECT_DIR/keys/party1.addr"

    # Party 2
    cardano-cli address key-gen \
        --verification-key-file "$PROJECT_DIR/keys/party2.vkey" \
        --signing-key-file "$PROJECT_DIR/keys/party2.skey"
    
    cardano-cli address build \
        --payment-verification-key-file "$PROJECT_DIR/keys/party2.vkey" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file "$PROJECT_DIR/keys/party2.addr"

    # Get addresses
    PARTY1_ADDR=$(cat "$PROJECT_DIR/keys/party1.addr")
    PARTY2_ADDR=$(cat "$PROJECT_DIR/keys/party2.addr")
    
    # Generate script address
    cardano-cli address build \
        --payment-script-file "$PROJECT_DIR/payment_channel.plutus" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file "$PROJECT_DIR/keys/script.addr"
    
    SCRIPT_ADDR=$(cat "$PROJECT_DIR/keys/script.addr")
}

# 2. Build Contract
build_contract() {
    echo "Building contract..."
    cd $PROJECT_DIR
    aiken build
    aiken blueprint convert > payment_channel.plutus
    cd ..
}

# 3. Create Initial Datum
create_initial_datum() {
    local CURRENT_SLOT=$(get_tip_slot)
    local PARTY1_VKEY_HASH=$(cardano-cli key verification-key-hash --verification-key-file "$PROJECT_DIR/keys/party1.vkey")
    local PARTY2_VKEY_HASH=$(cardano-cli key verification-key-hash --verification-key-file "$PROJECT_DIR/keys/party2.vkey")
    
    cat > "$PROJECT_DIR/datums/initial_datum.json" << EOF
{
    "constructor": 0,
    "fields": [
        {
            "party1": "$PARTY1_VKEY_HASH",
            "party2": "$PARTY2_VKEY_HASH",
            "balance1": $MIN_AMOUNT,
            "balance2": $MIN_AMOUNT,
            "sequence_number": 0,
            "settlement_requested": false,
            "created_slot": $CURRENT_SLOT
        }
    ]
}
EOF
}

# 4. Test Initial Deposit
test_initial_deposit() {
    echo "Testing initial deposit..."
    
    local PARTY1_UTXO=$(cardano-cli query utxo \
        --address "$PARTY1_ADDR" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file /dev/stdout | jq -r 'keys[0]')

    # Build transaction
    cardano-cli transaction build \
        --babbage-era \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --tx-in "$PARTY1_UTXO" \
        --tx-out "$SCRIPT_ADDR+$MIN_AMOUNT" \
        --tx-out-inline-datum-file "$PROJECT_DIR/datums/initial_datum.json" \
        --change-address "$PARTY1_ADDR" \
        --protocol-params-file "$PROTOCOL_PARAMS" \
        --out-file "$PROJECT_DIR/transactions/deposit.raw"

    # Sign transaction
    cardano-cli transaction sign \
        --tx-body-file "$PROJECT_DIR/transactions/deposit.raw" \
        --signing-key-file "$PROJECT_DIR/keys/party1.skey" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file "$PROJECT_DIR/transactions/deposit.signed"

    # Submit transaction
    cardano-cli transaction submit \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --tx-file "$PROJECT_DIR/transactions/deposit.signed"

    wait_for_tx $(cardano-cli transaction txid --tx-file "$PROJECT_DIR/transactions/deposit.signed")
}

# 5. Test Update Transaction
test_update_transaction() {
    echo "Testing update transaction..."
    
    local NEW_BALANCE1=$((MIN_AMOUNT + 1000000))
    local NEW_BALANCE2=$((MIN_AMOUNT - 1000000))
    
    # Create update redeemer
    cat > "$PROJECT_DIR/datums/update_redeemer.json" << EOF
{
    "constructor": 1,
    "fields": [
        {
            "new_balance1": $NEW_BALANCE1,
            "new_balance2": $NEW_BALANCE2,
            "sequence_number": 1
        }
    ]
}
EOF

    # Create new datum
    local CURRENT_SLOT=$(get_tip_slot)
    local PARTY1_VKEY_HASH=$(cardano-cli key verification-key-hash --verification-key-file "$PROJECT_DIR/keys/party1.vkey")
    local PARTY2_VKEY_HASH=$(cardano-cli key verification-key-hash --verification-key-file "$PROJECT_DIR/keys/party2.vkey")
    
    cat > "$PROJECT_DIR/datums/update_datum.json" << EOF
{
    "constructor": 0,
    "fields": [
        {
            "party1": "$PARTY1_VKEY_HASH",
            "party2": "$PARTY2_VKEY_HASH",
            "balance1": $NEW_BALANCE1,
            "balance2": $NEW_BALANCE2,
            "sequence_number": 1,
            "settlement_requested": false,
            "created_slot": $CURRENT_SLOT
        }
    ]
}
EOF

    local SCRIPT_UTXO=$(cardano-cli query utxo \
        --address "$SCRIPT_ADDR" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file /dev/stdout | jq -r 'keys[0]')

    # Build transaction
    cardano-cli transaction build \
        --babbage-era \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --tx-in "$SCRIPT_UTXO" \
        --tx-in-script-file "$PROJECT_DIR/payment_channel.plutus" \
        --tx-in-inline-datum-present \
        --tx-in-redeemer-file "$PROJECT_DIR/datums/update_redeemer.json" \
        --required-signer-hash "$PARTY1_VKEY_HASH" \
        --required-signer-hash "$PARTY2_VKEY_HASH" \
        --tx-out "$SCRIPT_ADDR+$((MIN_AMOUNT * 2))" \
        --tx-out-inline-datum-file "$PROJECT_DIR/datums/update_datum.json" \
        --change-address "$PARTY1_ADDR" \
        --protocol-params-file "$PROTOCOL_PARAMS" \
        --out-file "$PROJECT_DIR/transactions/update.raw"

    # Sign transaction
    cardano-cli transaction sign \
        --tx-body-file "$PROJECT_DIR/transactions/update.raw" \
        --signing-key-file "$PROJECT_DIR/keys/party1.skey" \
        --signing-key-file "$PROJECT_DIR/keys/party2.skey" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file "$PROJECT_DIR/transactions/update.signed"

    # Submit transaction
    cardano-cli transaction submit \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --tx-file "$PROJECT_DIR/transactions/update.signed"

    wait_for_tx $(cardano-cli transaction txid --tx-file "$PROJECT_DIR/transactions/update.signed")
}

# 6. Test Settlement Request
test_settlement_request() {
    echo "Testing settlement request..."
    
    # Create settlement redeemer
    cat > "$PROJECT_DIR/datums/settlement_redeemer.json" << EOF
{
    "constructor": 2,
    "fields": [
        {
            "final_balance1": $((MIN_AMOUNT + 1000000)),
            "final_balance2": $((MIN_AMOUNT - 1000000)),
            "sequence_number": 1
        }
    ]
}
EOF

    # Create settlement datum
    local CURRENT_SLOT=$(get_tip_slot)
    local PARTY1_VKEY_HASH=$(cardano-cli key verification-key-hash --verification-key-file "$PROJECT_DIR/keys/party1.vkey")
    local PARTY2_VKEY_HASH=$(cardano-cli key verification-key-hash --verification-key-file "$PROJECT_DIR/keys/party2.vkey")
    
    cat > "$PROJECT_DIR/datums/settlement_datum.json" << EOF
{
    "constructor": 0,
    "fields": [
        {
            "party1": "$PARTY1_VKEY_HASH",
            "party2": "$PARTY2_VKEY_HASH",
            "balance1": $((MIN_AMOUNT + 1000000)),
            "balance2": $((MIN_AMOUNT - 1000000)),
            "sequence_number": 1,
            "settlement_requested": true,
            "created_slot": $CURRENT_SLOT
        }
    ]
}
EOF

    local SCRIPT_UTXO=$(cardano-cli query utxo \
        --address "$SCRIPT_ADDR" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file /dev/stdout | jq -r 'keys[0]')

    # Build transaction
    cardano-cli transaction build \
        --babbage-era \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --tx-in "$SCRIPT_UTXO" \
        --tx-in-script-file "$PROJECT_DIR/payment_channel.plutus" \
        --tx-in-inline-datum-present \
        --tx-in-redeemer-file "$PROJECT_DIR/datums/settlement_redeemer.json" \
        --required-signer-hash "$PARTY1_VKEY_HASH" \
        --tx-out "$SCRIPT_ADDR+$((MIN_AMOUNT * 2))" \
        --tx-out-inline-datum-file "$PROJECT_DIR/datums/settlement_datum.json" \
        --change-address "$PARTY1_ADDR" \
        --protocol-params-file "$PROTOCOL_PARAMS" \
        --out-file "$PROJECT_DIR/transactions/settlement.raw"

    # Sign transaction
    cardano-cli transaction sign \
        --tx-body-file "$PROJECT_DIR/transactions/settlement.raw" \
        --signing-key-file "$PROJECT_DIR/keys/party1.skey" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file "$PROJECT_DIR/transactions/settlement.signed"

    # Submit transaction
    cardano-cli transaction submit \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --tx-file "$PROJECT_DIR/transactions/settlement.signed"

    wait_for_tx $(cardano-cli transaction txid --tx-file "$PROJECT_DIR/transactions/settlement.signed")
}

# 7. Test Close Channel
test_close_channel() {
    echo "Testing channel closure..."
    
    # Create close redeemer
    cat > "$PROJECT_DIR/datums/close_redeemer.json" << EOF
{
    "constructor": 3,
    "fields": []
}
EOF

    local SCRIPT_UTXO=$(cardano-cli query utxo \
        --address "$SCRIPT_ADDR" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file /dev/stdout | jq -r 'keys[0]')

    # Build transaction
    cardano-cli transaction build \
        --babbage-era \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --tx-in "$SCRIPT_UTXO" \
        --tx-in-script-file "$PROJECT_DIR/payment_channel.plutus" \
        --tx-in-inline-datum-present \
        --tx-in-redeemer-file "$PROJECT_DIR/datums/close_redeemer.json" \
        --required-signer-hash "$PARTY1_VKEY_HASH" \
        --required-signer-hash "$PARTY2_VKEY_HASH" \
        --tx-out "$PARTY1_ADDR+$((MIN_AMOUNT + 1000000))" \
        --tx-out "$PARTY2_ADDR+$((MIN_AMOUNT - 1000000))" \
        --change-address "$PARTY1_ADDR" \
        --protocol-params-file "$PROTOCOL_PARAMS" \
        --out-file "$PROJECT_DIR/transactions/close.raw"

    # Sign transaction
    cardano-cli transaction sign \
        --tx-body-file "$PROJECT_DIR/transactions/close.raw" \
        --signing-key-file "$PROJECT_DIR/keys/party1.skey" \
        --signing-key-file "$PROJECT_DIR/keys/party2.skey" \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --out-file "$PROJECT_DIR/transactions/close.signed"

    # Submit transaction
    cardano-cli transaction submit \
        --testnet-magic $CARDANO_TESTNET_MAGIC \
        --tx-file "$PROJECT_DIR/transactions/close.signed"

wait_for_tx $(cardano-cli transaction txid --tx-file "$PROJECT_DIR/transactions/close.signed")
}

# Main execution
main() {
    echo "Starting Payment Channel Tests..."
    
    # Build contract
    build_contract
    
    # Generate keys and addresses if they don't exist
    if [ ! -f "$PROJECT_DIR/keys/party1.skey" ]; then
        generate_keys
    fi
    
    # Create initial datum
    create_initial_datum
    
    # Execute tests in sequence
    echo "1. Testing Initial Deposit..."
    test_initial_deposit
    
    echo "2. Testing Update Transaction..."
    test_update_transaction
    
    echo "3. Testing Settlement Request..."
    test_settlement_request
    
    echo "4. Testing Channel Closure..."
    test_close_channel
    
    echo "All tests completed successfully!"
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi