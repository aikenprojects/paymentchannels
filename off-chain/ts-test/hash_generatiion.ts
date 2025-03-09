import {generatePrivateKey, paymentCredentialOf, toPublicKey } from "npm:@lucid-evolution/utils";
import {Lucid, Blockfrost, PROTOCOL_PARAMETERS_DEFAULT} from "npm:@lucid-evolution/lucid";
import * as CML from "npm:@anastasia-labs/cardano-multiplatform-lib-nodejs";
import { networkConfig } from "./setting.ts";

const lucid = await Lucid(
    new Blockfrost(
        networkConfig.blockfrostURL,
        networkConfig.blockfrostAPIkey,
    ),
    networkConfig.network,
    { presetProtocolParameteres: PROTOCOL_PARAMETERS_DEFAULT },
);

// Generate a new private key
const channel_skey = generatePrivateKey();
const channel_vkey = toPublicKey(channel_skey);

lucid.selectWallet.fromPrivateKey(channel_skey);
const channel_wallet = await lucid.wallet().address();

console.log("private key", channel_skey );
console.log("public key", channel_vkey );
console.log("address key", channel_wallet  );

const channel_hash  =  paymentCredentialOf(channel_wallet).hash
console.log("channel hash key", channel_hash);

