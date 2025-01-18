import {
    Blockfrost,
    Constr,
    Data,
    Lucid,
    paymentCredentialOf,
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


//network configuration
// console.log("Network: " + networkConfig.network);
// console.log("BlockfrostKEY: " + networkConfig.blockfrostAPIkey);
// console.log("BlockfrostURL: " + networkConfig.blockfrostURL);



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

console.log("channel address:", validator.validator);
console.log("channel address:",channelAddress);



// Create a payment channel
const initialize_channel = async (): Promise<Result<string>> => {
    try {
        if (!lucid) throw "Uninitialized Lucid";
        if (!amy_wallet) throw "Undefined Amy's address";
        if (!bob_wallet) throw "Undefined Bob's address";
        if (!channelAddress) throw "Undefined script address";
        
        // Verify the channel doesn't already exist
        const utxos = await lucid.utxosAt(channelAddress);
        if (utxos.length > 0) throw "Channel already exists";


        const balanceP1 = 200000n; // balance1
        const balanceP2 = 300000n; // balance1

        // Create datum based on the new ChannelDatum type
        const datum = Data.to(
            new Constr(0, [
                paymentCredentialOf(amy_wallet).hash, // party1's verification key hash (replace with actual key)
                paymentCredentialOf(bob_wallet).hash,, // party2's verification key hash (empty for now)
                balanceP1, // balance1
                balanceP2, // balance2
            ]), 
        );
        console.log("datum:", datum);
    
        const tx = await lucid
            .newTx()
            .pay.ToContract(channelAddress, {kind: "inline", value: datum }, {
                lovelace: balanceP1 + balanceP2,
            })
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
        console.log("Payment Channel Initialized! Transaction Hash:", txHash);

        return { type: "ok", data: txHash };
    } catch (error) {
        console.error("Error initializing payment channel:", error);
        if (error instanceof Error) return { type: "error", error: error };
        return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
};

let txHash = await initialize_channel();
console.log("Realized Tx: " + txHash.data);

const cam_utxo = await lucid.utxosAt(channelAddress);
console.log("campaign Address utxo: ", cam_utxo);


