import {
    Lucid,
    Data,
    SpendingValidator,
    Credential,
    validatorToAddress,
  } from "npm:@lucid-evolution/lucid";
  
  const validateUpdate = async (
    lucid: Lucid,
    validator: SpendingValidator,
    datum: any, // Replace any with the appropriate datum type
    redeemer: { new_balance1: bigint; new_balance2: bigint },
    channelAddress: string
  ) => {
    try {
      if (!lucid) throw "Lucid instance is not initialized";
  
      // Fetch UTXOs at the channel's address
      const utxos = await lucid.utxosAt(channelAddress);
  
      const redeemerData = Data.to({
        new_balance1: redeemer.new_balance1,
        new_balance2: redeemer.new_balance2,
      });
  
      // Select UTXO with a matching datum
      const channelUtxo = utxos.find((utxo) => {
        if (utxo.datum) {
          const parsedDatum = Data.from(utxo.datum, datum);
          return parsedDatum && parsedDatum.sequence_no;
        }
        return false;
      });
  
      if (!channelUtxo) throw "No matching UTXO with the datum found";
  
      // Build and sign transaction
      const tx = await lucid
        .newTx()
        .collectFrom([channelUtxo], redeemerData)
        .attachSpendingValidator(validator)
        .complete();
  
      const signedTx = await tx.sign().complete();
  
      const txHash = await signedTx.submit();
  
      console.log("Transaction submitted with hash:", txHash);
  
      return txHash;
    } catch (error) {
      console.error("Error in validateUpdate:", error);
      throw error;
    }
  };