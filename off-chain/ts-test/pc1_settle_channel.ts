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

// // Validate Settlement function
const validate_settlement = async (
    // datum: Constr,
    final_balance1:bigint,
    final_balance2:bigint,
    // sequence_number: bigint,
    // tx_info: any // tx_info should contain the transaction details
): Promise<Result<string>> => {
    try {

        const utxos = await lucid.utxosAt(channelAddress);
        if (utxos.length === 0) throw "No UTXOs found at the channel address";

        const utxo = utxos[1];
        console.log("Using UTXO: ", utxo);

        const currentDatum = Data.from<Constr>(utxo.datum);
        console.log("Current Datum: ", currentDatum);

        // // Fetch the current datum from the channel contract
        // const currentDatum = Data.from<Constr>(datum);

        // // 1. Verify request is signed by either party
        // const isSignedByParty1 = await tx_info.isSignedBy(currentDatum.fields[0]); // party1's key hash
        // const isSignedByParty2 = await tx_info.isSignedBy(currentDatum.fields[1]); // party2's key hash
        // if (!(isSignedByParty1 || isSignedByParty2)) {
        //     throw new Error("Transaction must be signed by either party1 or party2");
        // }

        // // 2. Verify sequence number matches
        // const storedSequenceNumber = currentDatum.fields[6]; // assuming sequence_number is in the 7th field of datum
        // if (sequence_number !== storedSequenceNumber) {
        //     throw new Error("Sequence number mismatch");
        // }

        // 3. Verify final balances match current state

        
      

        const storedBalance1 = currentDatum.fields[2]; // balanceP1
        const storedBalance2 = currentDatum.fields[3]; // balanceP2
        
        console.log("Type of storedBalance1:", typeof storedBalance1);
        console.log("Type of storedBalance2:", typeof storedBalance2);



        // const storedBalance1BigInt = BigInt(storedBalance1); 
        // const storedBalance2BigInt = BigInt(storedBalance2);

        if (final_balance1 !== storedBalance1 || final_balance2 !== storedBalance2) {
            throw new Error("Final balances do not match the current state");
        }

        // 4. Verify settlement not already requested
        const settlementRequested = currentDatum.fields[5];// Assuming settlement_requested is in the 8th field
        if (settlementRequested) {
            throw new Error("Settlement already requested");
        }

        // 5. Update settlement requested flag and prepare the updated datum
        const updatedDatum = new Constr(0, [
            currentDatum.fields[0], // party1's 
            currentDatum.fields[1], // party2's 
            final_balance1, // final balanceP1
            final_balance2, // final balanceP2
            currentDatum.fields[4] + 1n,
            settlementRequested,
            currentDatum.fields[6], 
            // currentDatum.fields[6], // sequence number remains unchanged
            "", // set settlement_requested to true
        ]);
        console.log("Updated Datum for Settlement: ", updatedDatum);

        // 6. Create the transaction to update the datum and finalize the settlement
        const tx = await lucid
            .newTx()
            .pay.ToContract(channelAddress, { kind: "inline", value: Data.to(updatedDatum) }, {
                lovelace: final_balance1 + final_balance2, // Assuming final balances reflect the total payment
            })
            .complete();

        const signedTx = await tx.sign.withWallet().complete();
        console.log("Signed Settlement Transaction: ", signedTx);

        const txHash = await signedTx.submit();
        console.log("Settlement Finalized! TxHash: " + txHash);

        return { type: "ok", data: txHash };
    } catch (error) {
        console.error("Error validating settleement :", error);
        if (error instanceof Error) return { type: "error", error: error };
        return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
};

const final_balance1 = 5250000n; // final balance for party1
const final_balance2 = 0n; // Ensure this is set to a valid `bigint`


let settlementResult = await validate_settlement(
    final_balance1,
    final_balance2,
);


console.log("Settlement Result: ", settlementResult);import {
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

// // Validate Settlement function
const validate_settlement = async (
    // datum: Constr,
    final_balance1:bigint,
    final_balance2:bigint,
    // sequence_number: bigint,
    // tx_info: any // tx_info should contain the transaction details
): Promise<Result<string>> => {
    try {

        const utxos = await lucid.utxosAt(channelAddress);
        if (utxos.length === 0) throw "No UTXOs found at the channel address";

        const utxo = utxos[1];
        console.log("Using UTXO: ", utxo);

        const currentDatum = Data.from<Constr>(utxo.datum);
        console.log("Current Datum: ", currentDatum);

        // // Fetch the current datum from the channel contract
        // const currentDatum = Data.from<Constr>(datum);

        // // 1. Verify request is signed by either party
        // const isSignedByParty1 = await tx_info.isSignedBy(currentDatum.fields[0]); // party1's key hash
        // const isSignedByParty2 = await tx_info.isSignedBy(currentDatum.fields[1]); // party2's key hash
        // if (!(isSignedByParty1 || isSignedByParty2)) {
        //     throw new Error("Transaction must be signed by either party1 or party2");
        // }

        // // 2. Verify sequence number matches
        // const storedSequenceNumber = currentDatum.fields[6]; // assuming sequence_number is in the 7th field of datum
        // if (sequence_number !== storedSequenceNumber) {
        //     throw new Error("Sequence number mismatch");
        // }

        // 3. Verify final balances match current state

        
      

        const storedBalance1 = currentDatum.fields[2]; // balanceP1
        const storedBalance2 = currentDatum.fields[3]; // balanceP2
        
        console.log("Type of storedBalance1:", typeof storedBalance1);
        console.log("Type of storedBalance2:", typeof storedBalance2);



        // const storedBalance1BigInt = BigInt(storedBalance1); 
        // const storedBalance2BigInt = BigInt(storedBalance2);

        if (final_balance1 !== storedBalance1 || final_balance2 !== storedBalance2) {
            throw new Error("Final balances do not match the current state");
        }

        // 4. Verify settlement not already requested
        const settlementRequested = currentDatum.fields[5];// Assuming settlement_requested is in the 8th field
        if (settlementRequested) {
            throw new Error("Settlement already requested");
        }

        // 5. Update settlement requested flag and prepare the updated datum
        const updatedDatum = new Constr(0, [
            currentDatum.fields[0], // party1's 
            currentDatum.fields[1], // party2's 
            final_balance1, // final balanceP1
            final_balance2, // final balanceP2
            currentDatum.fields[4] + 1n,
            settlementRequested,
            currentDatum.fields[6], 
            // currentDatum.fields[6], // sequence number remains unchanged
            "", // set settlement_requested to true
        ]);
        console.log("Updated Datum for Settlement: ", updatedDatum);

        // 6. Create the transaction to update the datum and finalize the settlement
        const tx = await lucid
            .newTx()
            .pay.ToContract(channelAddress, { kind: "inline", value: Data.to(updatedDatum) }, {
                lovelace: final_balance1 + final_balance2, // Assuming final balances reflect the total payment
            })
            .complete();

        const signedTx = await tx.sign.withWallet().complete();
        console.log("Signed Settlement Transaction: ", signedTx);

        const txHash = await signedTx.submit();
        console.log("Settlement Finalized! TxHash: " + txHash);

        return { type: "ok", data: txHash };
    } catch (error) {
        console.error("Error validating settleement :", error);
        if (error instanceof Error) return { type: "error", error: error };
        return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
};

const final_balance1 = 5250000n; // final balance for party1
const final_balance2 = 0n; // Ensure this is set to a valid `bigint`


let settlementResult = await validate_settlement(
    final_balance1,
    final_balance2,
);


console.log("Settlement Result: ", settlementResult);import {
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

// // Validate Settlement function
const validate_settlement = async (
    // datum: Constr,
    final_balance1:bigint,
    final_balance2:bigint,
    // sequence_number: bigint,
    // tx_info: any // tx_info should contain the transaction details
): Promise<Result<string>> => {
    try {

        const utxos = await lucid.utxosAt(channelAddress);
        if (utxos.length === 0) throw "No UTXOs found at the channel address";

        const utxo = utxos[1];
        console.log("Using UTXO: ", utxo);

        const currentDatum = Data.from<Constr>(utxo.datum);
        console.log("Current Datum: ", currentDatum);

        // // Fetch the current datum from the channel contract
        // const currentDatum = Data.from<Constr>(datum);

        // // 1. Verify request is signed by either party
        // const isSignedByParty1 = await tx_info.isSignedBy(currentDatum.fields[0]); // party1's key hash
        // const isSignedByParty2 = await tx_info.isSignedBy(currentDatum.fields[1]); // party2's key hash
        // if (!(isSignedByParty1 || isSignedByParty2)) {
        //     throw new Error("Transaction must be signed by either party1 or party2");
        // }

        // // 2. Verify sequence number matches
        // const storedSequenceNumber = currentDatum.fields[6]; // assuming sequence_number is in the 7th field of datum
        // if (sequence_number !== storedSequenceNumber) {
        //     throw new Error("Sequence number mismatch");
        // }

        // 3. Verify final balances match current state

        
      

        const storedBalance1 = currentDatum.fields[2]; // balanceP1
        const storedBalance2 = currentDatum.fields[3]; // balanceP2
        
        console.log("Type of storedBalance1:", typeof storedBalance1);
        console.log("Type of storedBalance2:", typeof storedBalance2);



        // const storedBalance1BigInt = BigInt(storedBalance1); 
        // const storedBalance2BigInt = BigInt(storedBalance2);

        if (final_balance1 !== storedBalance1 || final_balance2 !== storedBalance2) {
            throw new Error("Final balances do not match the current state");
        }

        // 4. Verify settlement not already requested
        const settlementRequested = currentDatum.fields[5];// Assuming settlement_requested is in the 8th field
        if (settlementRequested) {
            throw new Error("Settlement already requested");
        }

        // 5. Update settlement requested flag and prepare the updated datum
        const updatedDatum = new Constr(0, [
            currentDatum.fields[0], // party1's 
            currentDatum.fields[1], // party2's 
            final_balance1, // final balanceP1
            final_balance2, // final balanceP2
            currentDatum.fields[4] + 1n,
            settlementRequested,
            currentDatum.fields[6], 
            // currentDatum.fields[6], // sequence number remains unchanged
            "", // set settlement_requested to true
        ]);
        console.log("Updated Datum for Settlement: ", updatedDatum);

        // 6. Create the transaction to update the datum and finalize the settlement
        const tx = await lucid
            .newTx()
            .pay.ToContract(channelAddress, { kind: "inline", value: Data.to(updatedDatum) }, {
                lovelace: final_balance1 + final_balance2, // Assuming final balances reflect the total payment
            })
            .complete();

        const signedTx = await tx.sign.withWallet().complete();
        console.log("Signed Settlement Transaction: ", signedTx);

        const txHash = await signedTx.submit();
        console.log("Settlement Finalized! TxHash: " + txHash);

        return { type: "ok", data: txHash };
    } catch (error) {
        console.error("Error validating settleement :", error);
        if (error instanceof Error) return { type: "error", error: error };
        return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
};

const final_balance1 = 5250000n; // final balance for party1
const final_balance2 = 0n; // Ensure this is set to a valid `bigint`


let settlementResult = await validate_settlement(
    final_balance1,
    final_balance2,
);


console.log("Settlement Result: ", settlementResult);