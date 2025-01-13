import {
    applyDoubleCborEncoding,
    Blockfrost,
    Constr,
    Credential,
    credentialToAddress,
    Data,
    fromHex,
    fromText,
    generatePrivateKey,
    Lucid,
    LucidEvolution,
    PROTOCOL_PARAMETERS_DEFAULT,
    SpendingValidator,
    validatorToAddress,
    
} from "npm:@lucid-evolution/lucid";
import * as CML from "@anastasia-labs/cardano-multiplatform-lib-nodejs";

import amy_skey from "/workspaces/channel/payment_channel/off-chain/keys/amySkey.json" with { type: "json" };
import { networkConfig } from "./setting.ts";
import { Result } from "./types.ts";

const project_path = "/workspaces/channel/payment_channel";

const lucid = await Lucid(
    new Blockfrost(
        networkConfig.blockfrostURL,
        networkConfig.blockfrostAPIkey,
    ),
    networkConfig.network,
    { presetProtocolParameteres: PROTOCOL_PARAMETERS_DEFAULT },
);
console.log("Network: " + networkConfig.network);
console.log("BlockfrostKEY: " + networkConfig.blockfrostAPIkey);
console.log("BlockfrostURL: " + networkConfig.blockfrostAPI);

const amySigningkey = amy_skey.ed25519_sk;
console.log("amy sk: " + amySigningkey);

lucid.selectWallet.fromPrivateKey(amySigningkey);
const amy_wallet = await lucid.wallet().address();
console.log("Address: " + amy_wallet);

const amy_utxo = await lucid.utxosAt(amy_wallet);
console.log("Amy Address utxo: ", amy_utxo);

// // // // // read validator from blueprint json file created with aiken
const validator = await readValidator();

async function readValidator(): Promise<SpendingValidator> {
  const raw_validator = JSON.parse(await Deno.readTextFile("/workspaces/channel/payment_channel/plutus.json")).validators[0];
  const redeem = raw_validator.redeemer;
    //   console.log("extracted reedemer", redeem)

    const currentTime = new Date(); 
    // console.log("Current time: " + currentTime.toLocaleString());

    // Add 5 days to current time (5 days = 5 * 24 * 60 * 60 * 1000 milliseconds)
    const deadlineTime = new Date(currentTime.getTime() + 5 * 24 * 60 * 60 * 1000);

    // // Print the deadline in human-readable format
    // console.log("Deadline time (5 days from now): " + deadlineTime.toLocaleString());

  // Validator Parameters
  const paymentChannelParams = {
    minAmount: 1000000n,     // Example minimum amount 
    Slot: deadlineTime,             // Example timeout in slots
  };
  
  // Helper function to encode parameters into Plutus Data
  const encodeParams = (params) => {
    return new Constr(0, [params.minAmount, params.Slot]);
  };

  // Applying Parameters to the Validator
  const encodedParams = encodeParams(paymentChannelParams);
//   console.log("encoded params:", encodedParams);

  return { 
    validator: {
        type: "PlutusV3",
        script: applyDoubleCborEncoding(raw_validator.compiledCode),
        params: encodedParams,
    },
    redeemValidator: { 
        type: "PlutusV3",
        script: redeem,
        params: encodedParams,// Parameters}
    }
  };
}
// console.log("Validator:", validator.validator);

const channelAddress = validatorToAddress(
    networkConfig.network,
    validator.validator,
);
console.log("Validator Address: " + channelAddress);
// Update the Payment Channel
const update_channel = async (additionalFunds: bigint): Promise<Result<string>> => {
    try {
        // Fetch UTXOs at the channel address
        const utxos = await lucid.utxosAt(channelAddress);
        if (utxos.length === 0) throw "No UTXOs found at the channel address";

        const utxo = utxos[0]; // Use the first UTXO
        console.log("Channel UTXO at first index: ", utxo);

        // Retrieve the current state from the UTXO's datum
        const currentDatum = Data.from<Constr>(utxo.datum);
        console.log("Current Datum: ", currentDatum);

        const [
            party1,
            party2,
            balance1,
            balance2 ,
            sequenceNumber,
            settlementRequested,
            createdSlot,
        ] = currentDatum.fields;
        
        console.log("current datum fields check:", party1)
        
        console.log("Current Sequence Number (from datum):", sequenceNumber);

        // Increment the sequence number by 1 for the update
        const newSequenceNumber = sequenceNumber + 1n;
        console.log("Updated Sequence Number:", newSequenceNumber);

        // Ensure the sequence number is increasing
        if (newSequenceNumber <= sequenceNumber) {
            throw "The sequence number must increase";
        }
        
       // Adjust balance1 by additionalFunds
       const newBalance1 = BigInt(balance1) + additionalFunds;
       console.log("newBalance1:", newBalance1);

       // Keep balance2 the same, since it's 0 and there is no need to adjust it
       const newBalance2 = BigInt(balance2);
       console.log("newBalance2:", newBalance2);

       if (newBalance1 + newBalance2 !== BigInt(balance1) + BigInt(balance2) + additionalFunds) {
        throw "The total balance must be preserved";
    }



        if (newBalance1 < 0n || newBalance2 < 0n) {
            throw "Balances cannot be negative";
        }


        if (settlementRequested !== 0n) {
            throw "Settlement has already been requested";
        }

        // Create the updated datum
        const updatedDatum = new Constr(0, [
            party1,
            party2,
            newBalance1,
            newBalance2,
            newSequenceNumber, // Increment the sequence number
            settlementRequested,
            createdSlot,
        ]);
        console.log("Updated Datum: ", updatedDatum);

        // Build the transaction to update the channel
        const tx = await lucid
            .newTx()
            .pay.ToContract(channelAddress, { kind: "inline", value: Data.to(updatedDatum) }, {
                lovelace: utxo.assets.lovelace + additionalFunds, // Adjust total lovelace
            })
            .complete();

        // Sign and submit the transaction
        const signedTx = await tx.sign.withWallet().complete();
        console.log("Signed update transaction:", signedTx);

        const txHash = await signedTx.submit();

        console.log("Payment Channel Updated! TxHash: " + txHash);
        return { type: "ok", data: txHash };
        
    } catch (error) {
        console.error("Error updating payment channel:", error);
        return { type: "error", error: new Error(`${error}`) };
    }
};

// Test the update_channel function
let updateResult = await update_channel(250000n);
console.log("Update Result: ", updateResult);
