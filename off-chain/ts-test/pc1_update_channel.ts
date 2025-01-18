import {
    
    Blockfrost,
    Constr,
    Data,
    Lucid,
    PROTOCOL_PARAMETERS_DEFAULT,
} from "npm:@lucid-evolution/lucid";

import amy_skey from "./amySkey.json" with { type: "json" };
import bob_skey from "./bobskey.json" with { type: "json" };
import {validator, channelAddress} from "./plutus_validator.ts";
import { networkConfig } from "./setting.ts";
import { Result } from "./types.ts";


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
const update_channel = async (newBalance1: bigint, newBalance2:bigint, currentSequenceNumber:bigint ): Promise<Result<string>> => {
    try {

        if (!lucid) throw "Uninitialized Lucid";
        if (!amy_wallet) throw "Undefined Amy's address";
        if (!bob_wallet) throw "Undefined Bob's address";
        if (!channelAddress) throw "Undefined script address";
        
        // Fetch UTXOs at the channel address

        const utxos = await lucid.utxosAt(channelAddress);

        if (utxos.length === 0) throw "No UTXOs found at the channel address";

        const channel_utxo = utxos[utxos.length - 1]; // Use the first UTXO
        console.log("Channel UTXO at first index: ", channel_utxo);

        // Retrieve the current state from the UTXO's datum
        const currentDatum = Data.from<Constr>(channel_utxo.datum);
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

        
        const newBalance1 = 150000n; // Example: Reducing Amy's balance
        const newBalance2 = 300000n; // Example: Increasing Bob's balance
 
        
        // Create the redeemer for UpdateTransaction
        const redeemer = Data.to(
            new Constr(1, [
                newBalance1,
                newBalance2,
                sequenceNumber + 1n
            ])
        );

        // Create the updated datum
        const updatedDatum = new Constr(0, [
            party1,
            party2,
            newBalance1,
            newBalance2,
            sequenceNumber + 1n, // Increment the sequence number
            settlementRequested,
            createdSlot,
        ]);
        console.log("Updated Datum: ", updatedDatum);

        // Build the transaction to update the channel
        const tx = await lucid
            .newTx()

            .collectFrom([channel_utxo], redeemer) // Spend the current UTXO with the redeemer
            .attach.SpendingValidator(validator.validator)
            .pay.ToContract(
                channelAddress,
                { kind: "inline", value:  Data.to(updatedDatum) },
                { lovelace: newBalance1 + newBalance2 } // Total amount stays the same
            )
            .addSigner(amy_wallet)
            .addSigner(bob_wallet)
            .complete();
        
        // console.log("tx:" , tx.toJSON());
        

        const amySignedWitness = await tx.partialSign.withPrivateKey(amySigningkey);
        const bobSignedWitness = await tx.partialSign.withPrivateKey(bobSigningkey);
        // console.log("witness set:", bobSignedWitness);

        // Assemble the transaction with the collected witnesses
        const signedTx = await tx.assemble([amySignedWitness, bobSignedWitness]).complete();
        

        const txHash = await signedTx.submit();

        console.log("Payment Channel Updated! TxHash: " + txHash);
        return { type: "ok", data: txHash };
        
    } catch (error) {
        console.error("Error updating payment channel:", error);
        return { type: "error", error: new Error(`${error}`) };
    }
};

// Test the update_channel function
let updateResult = await update_channel(150000n);
console.log("Update Result: ", updateResult);
