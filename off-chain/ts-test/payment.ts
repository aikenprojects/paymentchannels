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
        if (!amy_wallet) throw "Undefined Amy's address";
        if (!channelAddress) throw "Undefined script address";

        //         // CFDatum -
        // const DatumSchema = Data.Object({
        //     party1: Data.Bytes(),
        //     party2: Data.Bytes(),
        //     balanceP1: Data.Integer(),
        //     balanceP2: Data.Integer(),
        //     stakeP1: Data.Integer(),
        //     stakeP2: Data.Integer(),
        //     state: Data.Bytes(),
        // });

        const datum = Data.to(
            new Constr(0, [
                "5d20782e35c589a11061291fece1acc90f20edf612555382e0b6dc01", // party1's verification key hash
                "", // party2's verification key hash (empty for now)
                5n, // balanceP1
                0n, // balanceP2
                3n, // stakeP1
                0n, // stakeP2
                "", // state (initialized)
            ]),
        );
        console.log("datum:", datum);

        const tx = await lucid
            .newTx()
            .pay.ToContract(channelAddress, { kind: "inline", value: datum }, {
                lovelace: 100000n,
            })
            .complete();

        const signedTx = await tx.sign.withWallet().complete();
        console.log("Tx signed: " + signedTx);

        const txHash = await signedTx.submit();
        console.log("Tx built: " + txHash);

        console.log("Payment Channel Initialized!");

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
