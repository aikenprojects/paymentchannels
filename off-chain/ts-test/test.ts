import {
    credentialToAddress,
    fromPrivateKey,
    generatePrivateKey,
    generateSeedPhrase,
    hash,
    toPublicKey,
} from "@lucid-evolution/utils";

import {
    Blockfrost,
    Lucid,
    LucidEvolution,
    PROTOCOL_PARAMETERS_DEFAULT,
} from "@lucid-evolution/lucid";
import { networkConfig } from "./setting.ts";

const project_path = "C:/Users/LENOVO/payment_channel";

const lucid = await Lucid(
    new Blockfrost(
        networkConfig.blockfrostURL,
        networkConfig.blockfrostAPIkey,
    ),
    networkConfig.network,
    { presetProtocolParameteres: PROTOCOL_PARAMETERS_DEFAULT },
);
// Generate a new private key
const privateKey01 = generatePrivateKey();
console.log(privateKey01);

const publicKey01 = toPublicKey(privateKey01);
console.log(publicKey01);

const address01 = lucid.selectWallet.fromPrivateKey(privateKey01);
console.log(address01);

// const seedPhrase = generateSeedPhrase(); // BIP-39
// console.log(seedPhrase);

// // const pkh = toPublicKey(privateKey01).hash();
// // console.log(address);

// // const paymentCredential: Credential = {
// //     type: "Key",
// //     hash: pkh,
// // };

// // const address = credentialToAddress("Preview", paymentCredential);
// // console.log(address);

// const tx = await lucid
//     .newTx()
//     .pay.ToAddress("address01", { lovelace: 5000000n })
//     // .pay.ToAddress("addr_testb...", { lovelace: 5000000n })
//     .complete();

// const signedTx = await tx.sign.withWallet().complete();
// const txHash = await signedTx.submit();
// console.log(txHash);
