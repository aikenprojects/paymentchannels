import {
    applyDoubleCborEncoding,
    Blockfrost,
    Constr,
    Credential,
    Data,
    Lucid,
    PROTOCOL_PARAMETERS_DEFAULT,
    SpendingValidator,
    validatorToAddress,

    toPublicKey,

    
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

// console.log("Network: " + networkConfig.network);
// console.log("BlockfrostKEY: " + networkConfig.blockfrostAPIkey);
// console.log("BlockfrostURL: " + networkConfig.blockfrostAPI);

//part 1 credentials
const amySigningkey = amy_skey.ed25519_sk;
console.log("amy sk: " + amySigningkey);

const amyvkey = toPublicKey(amySigningkey);
console.log("amy vk: " + amyvkey);

lucid.selectWallet.fromPrivateKey(amySigningkey);
const amy_wallet = await lucid.wallet().address();
console.log("Address: " + amy_wallet);

const amy_utxo = await lucid.utxosAt(amy_wallet);
console.log("Amy Address utxo: ", amy_utxo);

//party2 credentials
const bobSigningkey = bob_skey.ed25519_sk;
console.log("bob sk: " + bobSigningkey);

const bobvkey = toPublicKey(bobSigningkey);
console.log("amy vk: " + bobvkey);

lucid.selectWallet.fromPrivateKey(bobSigningkey);
const bob_wallet = await lucid.wallet().address();
console.log("bob Address: " + bob_wallet);

const bob_utxo = await lucid.utxosAt(bob_wallet);
console.log("bob Address utxo: ", bob_utxo);

// channel close
const channelClose = async (): Promise<Result<string>> => {
    try {
      if (!lucid) throw "Uninitialized Lucid";
      if (!amy_wallet) throw "Undefined Amy's address";
      if (!bob_wallet) throw "Undefined Bob's address";
      if (!channelAddress) throw "Undefined script address";
      
      
        // Fetch UTXOs at the channel address
        const utxos = await lucid.utxosAt(channelAddress);
        console.log("all channel utxos", utxos)
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
            balance2,
            sequenceNumber,
            settlementRequested,
            createdSlot,
        ] = currentDatum.fields;

        console.log("Current Sequence Number (from datum):", sequenceNumber);
        console.log("Current datum time (from datum):", createdSlot);


        // Check if settlement has already been requested
        if (settlementRequested !== 0n) {
            throw "Settlement has not ady been requested or the channel is already closed";
        }

        // Update settlementRequested to indicate that settlement has been requested
        const updatedSettlementRequested = 1n; // Set to 1 to indicate that settlement has been requested
        console.log("updatedSettlementRequested", updatedSettlementRequested)
        
        // Define current time separately
        const currentTime = Date.now(); 
        console.log("currentTime", currentTime );
        
        // Fetch the parameters from the redeemValidator
        const Vparams = validator.validator.params;
        const channel_deadline = Vparams.fields[1];  
        console.log("deadline", channel_deadline)        
        
        // Compare current time with the createdSlot and the timeout period
        if (BigInt(currentTime) >= channel_deadline) {
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
            BigInt(currentTime),  // Transfer the final balance to party1
        ]);

        console.log("Updated Datum for settlement: ", updatedDatum);

        const redeemer = Data.to(new Constr(3, []));
        console.log("Redeemer: " + Data.from(redeemer));
        console.log("Redeemer: " + redeemer);
        

        // Build the transaction to close the channel and settle funds
        const tx = await lucid
            .newTx() 
            .collectFrom([channel_utxo], redeemer)
            .attach.SpendingValidator(validator.validator)

            .pay.ToAddress(amy_wallet, {lovelace: 300000n})
            .pay.ToAddress(bob_wallet, {lovelace: 200000n})
            .addSigner(amy_wallet)
            .addSigner(bob_wallet)
            .validTo(Date.now())
            .complete({});

        console.log("Tx: " + tx);
     
        const amySignedWitness = await tx.partialSign.withPrivateKey(amySigningkey);
        const bobSignedWitness = await tx.partialSign.withPrivateKey(bobSigningkey);
        // console.log("witness set:", bobSignedWitness);

        // Assemble the transaction with the collected witnesses
        const signedTx = await tx.assemble([amySignedWitness, bobSignedWitness]).complete();

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
