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

import amy_skey from "./keys/amySkey.json" with { type: "json" };
import bob_address from "./keys/bobaddr.json" with { type: "json" };
// import channel_address from "./keys/channeladdress.json" with { type: "json" };

import { networkConfig } from "./setting.ts";
import { Result } from "./types.ts";

const project_path = "C:/Users/LENOVO/payment_channel";

const lucid = await Lucid(
    new Blockfrost(
        networkConfig.blockfrostURL,
        networkConfig.blockfrostAPIkey,
    ),
    networkConfig.network,
    { presetProtocolParameteres: PROTOCOL_PARAMETERS_DEFAULT },
);

const amySigningkey = amy_skey.ed25519_sk;

console.log("amy sk: " + amySigningkey);

lucid.selectWallet.fromPrivateKey(amySigningkey);
const amy_wallet = await lucid.wallet().address();

console.log("Address: " + amy_wallet);

// const amy_wallet = amy_address.address;
// console.log("Amy Address: " + amy_wallet);

const amy_utxo = await lucid.utxosAt(amy_wallet);
console.log("Amy Address utxo: ", amy_utxo);

// const bob_wallet = bob_address.address; // Extract the key value
// console.log("Extracted bob address: " + bob_wallet);

// const bob_utxo = await lucid.utxosAt(bob_wallet);
// console.log("bob Address utxo: ", bob_utxo);

// const channel_wallet = channel_address.address; // Extract the key value
// console.log("Extracted channel address: " + channel_wallet);
// const channel_utxo = await lucid.utxosAt(channel_wallet);
// console.log("ChannelAddress utxo: ", channel_utxo);

// // // // // read validator from blueprint json file created with aiken

const validator = await readValidator();

async function readValidator(): Promise<SpendingValidator> {
    const validator = JSON.parse(
        await Deno.readTextFile("C:/Users/LENOVO/payment_channel/plutus.json"),
    ).validators[0]; //need to check how can i pass my list of actions here
    return {
        type: "PlutusV3",
        script: applyDoubleCborEncoding(validator.compiledCode),
    };
}
// console.log(validator);

const channelAddress = validatorToAddress(
    networkConfig.network,
    validator,
);
console.log("Validator Address: " + channelAddress);
const c_utxo = await lucid.utxosAt(channelAddress);
console.log("channel Address utxo: ", c_utxo);

// Create a payment channel
const initialize_channel = async (): Promise<Result<string>> => {
    try {
        if (!lucid) throw "Uninitialized Lucid";
        if (!amy_wallet) throw "Non defined amy address";
        if (!channelAddress) throw "Non defined script address";

        const ChannelDatumSchema = Data.Object({
            party1: Data.Bytes(), // VerificationKeyHash
            party2: Data.Bytes(), // VerificationKeyHash
            balance1: Data.Integer(),
            balance2: Data.Integer(),
            sequence_number: Data.Integer(),
            settlement_requested: Data.Boolean(),
            created_slot: Data.Integer(),
        });

        type ChannelDatum = Data.Static<typeof ChannelDatumSchema>;
        const ChannelDatum = ChannelDatumSchema as unknown as ChannelDatum;

        // const paymentChannelUtxos = await lucid.utxosAt(channelAddress);
        // console.log("all channel utxo:", paymentChannelUtxos);

        //used when you want to spend channel utxos

        // const ChannelUtxo = paymentChannelUtxos.find((utxo) => {
        //     if (utxo.datum) {
        //         console.log("channel Datum: " + utxo.datum);
        //         const dat = Data.from(utxo.datum, ChannelDatum);
        //         console.log("Created Slot: " + dat.created_slot);
        //         return utxo;
        //     }
        // });

        const redeemer = Data.to(0n); // InitialDeposit action
        // console.log("Payment Channel UTXO: " + ChannelUtxo);
        // console.log(
        //  "------------------------------------------------------------------------------------------------------------------------",
        // );
        console.log("redeemer:", redeemer);

        const tx = await lucid
            .newTx()
            .collectFrom([amy_wallet], redeemer)
            .attach.SpendingValidator(validator)
            .pay.ToAddress(channelAddress, { inline: ChannelDatum }, {
                lovelace: 100000n,
            })
            .validFrom(Date.now())
            .addSigner(amy_wallet)
            .complete({});

        console.log("Tx built: " + tx);
        // const signedTx = await tx.sign.withWallet().complete();
        // const txHash = await signedTx.submit();

        console.log("Payment Channel Initialized!");
        return { type: "ok", data: "Tx Built!" };
    } catch (error) {
        console.log("Error: " + error);
        if (error instanceof Error) return { type: "error", error: error };
        return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
};

let txHash = await initialize_channel();
console.log("Realized Tx: " + txHash.data);
