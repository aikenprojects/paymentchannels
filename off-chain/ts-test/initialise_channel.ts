import {Blockfrost,
  Lucid,
  LucidEvolution,
  SpendingValidator,
  generatePrivateKey,
  fromHex,
  Credential,
  credentialToAddress,
  applyDoubleCborEncoding,
  validatorToAddress,
  Constr,
  Data,
  fromText,
  PROTOCOL_PARAMETERS_DEFAULT } from "npm:@lucid-evolution/lucid";

import party1_signingKey from "C:/Users/LENOVO/payment_channel/off-chain/cli-test/payment-channel/keys/part1.skey.json" with {type: 'json'};
import {networkConfig} from "./settings.ts"
import { Result } from "./types.ts";

const project_path = "C:/Users/LENOVO/payment_channel";

const lucid = await Lucid(new Blockfrost(
                      networkConfig.blockfrostURL, 
                      networkConfig.blockfrostAPIkey,
                      
                    ),
                    networkConfig.network,
                    {presetProtocolParameteres: PROTOCOL_PARAMETERS_DEFAULT}
                  );

const Party1PaymentCredential: Credential = {
type: "Key",
hash: "5820d5a5e4bb4baffb3b4de1393a012dccde5113e14c26f2c663dd33485694560d71"  //taken from cardano-cli generated verification key hash
};

const Party1stakeCredential: Credential = {
type: "Key",
hash: "8662fe85a22159022d71aebcf4342bcafaa6ede0df2e486a4e751e8e" // taken from cardano-cli generated stake verification key hash
};

const party1Signingkey = party1_signingKey.ed25519;

console.log("party1 sk: " + party1Signingkey);

lucid.selectWallet.fromPrivateKey(party1Signingkey);
const party1Address = await lucid.wallet().address();

console.log("Address: " + party1Address);

//read validator from blueprint json file created with aiken

const validator = await readValidator();

async function readValidator(): Promise<SpendingValidator> {
const validator = JSON.parse(await Deno.readTextFile("C:/Users/LENOVO/payment_channel/plutus.json")).validators[0]; //need to check how can i pass my list of actions here
return {
type: "PlutusV3",
script: applyDoubleCborEncoding(validator.compiledCode)
};
}

const campaignsAddress = validatorToAddress(networkConfig.network, validator, Party1stakeCredential); //Bob's staking credential

console.log("Validator Address: " + campaignsAddress);

// Create a campaign
const initialize_channel = async (): Promise<Result<string>> => { //how to get these results ???
try {

if (!lucid) throw "Uninitialized Lucid";
if (!party1Address) throw "Non defined Bob's address";
if (!campaignsAddress) throw "Non defined script address";

const ChannelDatumSchema = Data.Object({
  party1: Data.Bytes(),
  party2: Data.Bytes(),
  balanceP1: Data.Integer(),
  balanceP2: Data.Integer(),
  sequence_no: Data.Integer(),
  settlement_requested: Data.Boolean(),
  lock_period: Data.Integer(),
})


type ChannelDatum = Data.Static<typeof ChannelDatumSchema>;
const ChannelDatum = ChannelDatumSchema as unknown as ChannelDatum;


const redeemer = Data.to(
  new Constr(0, [min_amount, lock_time]) // InitializeChannel action
);

const tx = await lucid
  .newTx()
  .payToContract(paymentChannelAddress, { inline: datumInstance }, { lovelace: 2000000n })
  .attachSpendingValidator(validator)
  .collectFrom(await lucid.wallet().utxos(), redeemer)
  .addSigner(userAddress)
  .complete();

const signedTx = await tx.sign().complete();
const txHash = await signedTx.submit();

  console.log("Transaction Successful! Tx Hash: " + txHash);
  return { type: "ok", data: txHash };
} catch (error) {
  console.error("Error initializing channel:", error);
  if (error instanceof Error) return { type: "error", error: error };
  return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
}

// const campaigns_utxos = await lucid.utxosAt(campaignsAddress);
// const campaign_utxo = campaigns_utxos.find((utxo) => {
// if (utxo.datum) {
//   console.log("Datum: " + utxo.datum);
//   const dat = Data.from(utxo.datum, CFDatum)
//   console.log(dat.deadline)
//   return utxo}
// });

const redeemer = Data.to(0n);
console.log("Campaign UTXO: " + campaign_utxo);
console.log("------------------------------------------------------------------------------------------------------------------------");
const tx = await lucid
.newTx()
.collectFrom([campaign_utxo], redeemer)
.attach.SpendingValidator(validator)
.pay.ToAddress(bobAddress, {lovelace: 2000000n})
.addSigner(bobAddress)
.validFrom(Date.now())
.complete({});

console.log("Tx: " + tx);
//  const signedTx = await tx.sign.withWallet().complete();
//  const txHash = await signedTx.submit();

console.log("TODO BIEN!")
// return { type: "ok", data: txHash };
return { type: "ok", data: "tx Built!" };
}
catch (error) {
console.log("Error: " + error);
if (error instanceof Error) return { type: "error", error: error };
return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
}
};

let txHash = await cancel_campaign()
console.log("Realized Tx: " + txHash.data);