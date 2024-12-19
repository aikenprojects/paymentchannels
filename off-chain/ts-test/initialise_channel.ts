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

import party1_signingKey from "./amySkey.json" with { type: "json" };
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

console.log(party1_signingKey);
// const party1Signingkey = party1_signingKey;
// console.log("party1sk: " + party1_signingKey);

const Party1PaymentCredential: Credential = {
  type: "Key",
  hash: "2070f8488dd696b78a5f23e38d273550e43660526c4b19cba733b488", //taken from cardano-cli generated verification key hash
};

const privateKey = party1_signingKey.ed25519_sk; // Extract the key value
console.log("Extracted private key: " + privateKey);

lucid.selectWallet.fromPrivateKey(privateKey);

const party1Address = await lucid.wallet().address();
console.log("Address: " + party1Address);

// // read validator from blueprint json file created with aiken

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
console.log(validator);

const channelAddress = validatorToAddress(
  networkConfig.network,
  validator,
  Party1PaymentCredential,
); //party1's payment address

console.log("Validator Address: " + channelAddress);

// Create a payment channel
const initialize_channel = async (): Promise<Result<string>> => {
  try {
    if (!lucid) throw "Uninitialized Lucid";
    if (!party1Address) throw "Non defined party1 address";
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

    const paymentChannelUtxos = await lucid.utxosAt(channelAddress);
    const paymentChannelUtxo = paymentChannelUtxos.find((utxo) => {
      if (utxo.datum) {
        console.log("Datum: " + utxo.datum);
        const dat = Data.from(utxo.datum, ChannelDatum);
        console.log("Created Slot: " + dat.created_slot);
        return utxo;
      }
    });

    if (!paymentChannelUtxo) {
      throw new Error("No valid UTXO found for the payment channel");
    }

    const redeemer = Data.to(0n); // InitialDeposit action
    console.log("Payment Channel UTXO: " + paymentChannelUtxo);
    console.log(
      "------------------------------------------------------------------------------------------------------------------------",
    );
    // Create and build the transaction
    const tx = await lucid
      .newTx()
      .collectFrom([paymentChannelUtxo], redeemer)
      .attach.SpendingValidator(validator)
      .pay.ToAddress(party1Address, { lovelace: 2000000n })
      .addSigner(party1Address)
      .validFrom(Date.now())
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
