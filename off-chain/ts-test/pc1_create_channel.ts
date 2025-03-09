import {
    Blockfrost,
    Constr,
    Data,
    Lucid,
    PROTOCOL_PARAMETERS_DEFAULT,
    paymentCredentialOf,
} from "npm:@lucid-evolution/lucid";

import amy_skey from "./amySkey.json" with { type: "json" };
import bob_skey from "./bobskey.json" with { type: "json" };
import { channelAddress, validator } from "./plutus_validator.ts";
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
console.log("channel address:", channelAddress);

// Create a payment channel
const initialize_channel = async (): Promise<Result<string>> => {
    try {
        if (!lucid) throw "Uninitialized Lucid";
        if (!amy_wallet) throw "Undefined Amy's address";
        if (!bob_wallet) throw "Undefined Bob's address";
        if (!channelAddress) throw "Undefined script address";

        // Fetch UTxOs at the channel address
        const utxos = await lucid.utxosAt(channelAddress);
        console.log("Current utxo: ", utxos);



        let currentSequenceNumber = 0; // Default to 0 if no UTxOs are present
        console.log("Current sequence number: ", currentSequenceNumber);
        const created_slot = Date.now()
        console.log("Current time: ", created_slot);
        const balanceP1 = 5000000; // balance1
        const balanceP2 = 3000000; // balance1
        console.log("balance1: ", balanceP1, "balance2:", balanceP2);
        const settlementRequested = 0; // settlement_requested (false)
        console.log("settlement: ", settlementRequested);


        // Create datum based on the new ChannelDatum type
        const datum = Data.to(
            new Constr(0, [
                paymentCredentialOf(amy_wallet).hash, // party1's verification key hash (replace with actual key)
                paymentCredentialOf(bob_wallet).hash , // party2's verification key hash (empty for now)
                BigInt(balanceP1), // balance1
                BigInt(balanceP2), // balance2
                BigInt(currentSequenceNumber), // sequence_number
                BigInt(settlementRequested), // settlement_requested (false initially)
                BigInt(created_slot), // created_slot (example slot number) //channel creation time
            ]),
        );
        console.log("datum:", datum);

        
        //tx build
        const tx = await lucid
            .newTx()
            .pay.ToContract(channelAddress, { kind: "inline", value: datum }, {
                lovelace: BigInt(balanceP1) + BigInt(balanceP2),  //1 tx fee 0.178701 ADA

            })
            .addSigner(amy_wallet)
            .addSigner(bob_wallet)
            .complete();

        
        console.log("tx:" , tx.toJSON());
        
        //tx signed
        const amySignedWitness = await tx.partialSign.withPrivateKey(amySigningkey);
        const bobSignedWitness = await tx.partialSign.withPrivateKey(bobSigningkey);

        // console.log("witness set:", bobSignedWitness);

        // Assemble the transaction with the collected witnesses
        const signedTx = await tx.assemble([amySignedWitness, bobSignedWitness])
            .complete();

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

// const cam_utxo = await lucid.utxosAt(channelAddress);
// console.log("campaign Address utxo: ", cam_utxo);

