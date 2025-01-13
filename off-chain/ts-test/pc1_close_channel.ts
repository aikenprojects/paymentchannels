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

// channel close
const channelClose = async (): Promise<Result<string>> => {
    try {
        // Fetch UTXOs at the channel address
        const utxos = await lucid.utxosAt(channelAddress);
        if (utxos.length === 0) throw "No UTXOs found at the channel address";

        const channel_utxo = utxos[0]; // Use the first UTXO
        console.log("Channel UTXO at first index: ", channel_utxo);

        // const channel_utxo = utxos.find((utxo) => {
        //     if (utxo.datum) {
        //       const datum = Data.from(utxo.datum, DatumType);
        //       return datum.owner === publicKeyHash;
        //     }
        //   });

        // Retrieve the current state from the UTXO's datum
        const currentDatum = Data.from<Constr>(channel_utxo.datum);
        console.log("Current Datum: ", currentDatum);

        const [
            party1,
            party2,
            balance1,
            balance2,
            sequenceNumber,
            settlementRequested,
            createdSlot,
        ] = currentDatum.fields;

        console.log("Current Sequence Number (from datum):", sequenceNumber);

        // Check if settlement has already been requested
        if (settlementRequested !== 0n) {
            throw "Settlement has not ady been requested or the channel is already closed";
        }

        // Update settlementRequested to indicate that settlement has been requested
        const updatedSettlementRequested = 1n; // Set to 1 to indicate that settlement has been requested
        console.log("updatedSettlementRequested", updatedSettlementRequested)
        
        // Define current time separately
        const currentTime = new Date(); 
        console.log("currentTime", currentTime );
        
        // Fetch the parameters from the redeemValidator
        const redeemParams = validator.redeemValidator.params;
        const channel_deadline = redeemParams.fields[1];  
        console.log("deadline", channel_deadline)        
        
        // Compare current time with the createdSlot and the timeout period
        if (currentTime >= createdSlot + channel_deadline) {
            throw "Timeout has been reached";
        }
        

        // Create the updated datum marking the channel as closed
        const updatedDatum = new Constr(0, [
            party1,
            party2,
            balance1,
            balance2,
            sequenceNumber + 1n,
            updatedSettlementRequested,
            currentTime,  // Transfer the final balance to party1
        ]);

        console.log("Updated Datum for settlement: ", updatedDatum);

                
        const redeemer = Data.to(new Constr(0, [3n]));

        console.log("Redeemer: " + Data.from(redeemer));

        // Build the transaction to close the channel and settle funds
        const tx = await lucid
            .newTx() 
            .collectFrom([channel_utxo], redeemer)
            .attach.SpendingValidator(validator.validator)
            .pay.ToAddress(amy_wallet, {lovelace: 3000000n})
            .addSigner(amy_wallet)
            .validTo(Date.now())
            .complete();

        // Sign and submit the transaction
        const signedTx = await tx.sign.withWallet().complete();
        console.log("Signed channel close transaction:", signedTx);

        const txHash = await signedTx.submit();

        console.log("Payment Channel Closed! TxHash: " + txHash);
        return { type: "ok", data: txHash };
        
    } catch (error) {
        console.error("Error closing payment channel:", error);
        return { type: "error", error: new Error(`${error}`) };
    }
};

// Test the channelClose function
let closeResult = await channelClose();

console.log("Realized Tx: " + closeResult.data);
