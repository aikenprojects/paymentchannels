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

import amy_skey from "./amySkey.json" with { type: "json" };
import bob_skey from "./bobskey.json" with { type: "json" };
import { networkConfig } from "./setting.ts";
import { Result } from "./types.ts";

const project_path = networkConfig.workspacePath;

const lucid = await Lucid(
    new Blockfrost(
        networkConfig.blockfrostURL,
        networkConfig.blockfrostAPIkey,
    ),
    networkConfig.network,
    { presetProtocolParameteres: PROTOCOL_PARAMETERS_DEFAULT },
);

//party1 credentials
const amySigningkey = amy_skey.ed25519_sk;
console.log("amy sk: " + amySigningkey);

lucid.selectWallet.fromPrivateKey(amySigningkey);
const amy_wallet = await lucid.wallet().address();
console.log("Address: " + amy_wallet);

const amy_utxo = await lucid.utxosAt(amy_wallet);
console.log("Amy Address utxo: ", amy_utxo);


//party2 credentials
const bobSigningkey = bob_skey.ed25519_sk;
console.log("bob sk: " + bobSigningkey);

lucid.selectWallet.fromPrivateKey(bobSigningkey);
const bob_wallet = await lucid.wallet().address();
console.log("bob Address: " + bob_wallet);

const bob_utxo = await lucid.utxosAt(bob_wallet);
console.log("bob Address utxo: ", bob_utxo);


// Update the Payment Channel
const update_channel = async (additionalFunds: bigint): Promise<Result<string>> => {
    try {
        // Fetch UTXOs at the channel address
        const utxos = await lucid.utxosAt("addr_test1zz4cxtq805hmvuvg2hzpt6ptwfu9q5vrjav9lev6kjrv7hux9fau0z909xfj2r6l93kr275kjsnczc2emzcdzkcs8zkq47n69s");
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
            .pay.ToContract("addr_test1zz4cxtq805hmvuvg2hzpt6ptwfu9q5vrjav9lev6kjrv7hux9fau0z909xfj2r6l93kr275kjsnczc2emzcdzkcs8zkq47n69s", { kind: "inline", value: Data.to(updatedDatum) }, {
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
