cardano-cli conway transaction build \
  --tx-in TX_HASH#TX_INDEX \  # Reference to your funding UTxO
  --tx-out SCRIPT_ADDRESS+LOVELACE \  # Output to the script
  --tx-out-datum-hash HASHED_DATUM \  # Datum hash for the script
  --change-address YOUR_ADDRESS \  # Change address for remaining funds
  --out-file init_channel.tx \  # File to save built transaction
  --testnet-magic 2

cardano-cli conway transaction sign \
  --tx-body-file init_channel.tx \
  --signing-key-file YOUR_SIGNING_KEY.skey \
  --out-file init_channel.signed \
  --testnet-magic 2

cardano-cli conway transaction submit \
  --tx-file init_channel.signed \
  --testnet-magic 2
