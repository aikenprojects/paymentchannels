import { fromHex } from "@dcspark/lucid";
// import * as bech32 from "bech32";
// import { fromHex } from "https://deno.land/x/lucid@0.10.1/mod.ts";
import * as bech32 from "@bech32";
import bob_skey from "./keys/bobskey.json" with { type: "json" };

// Input key object
// const signingKey = {
//     type: "PaymentSigningKeyShelley_ed25519",
//     description: "Payment Signing Key",
//     cborHex:
//         "58203ca93c351072eb21d3867ee1c679c5c41177f56441e8394babf60c49795e3886",
// };

// Extract the key from cborHex and decode it from hex
const keyBytes = fromHex(bob_skey.cborHex.slice(4)); // Remove the "5820" prefix if present

// Convert to Bech32 format with the prefix 'ed25519_sk'
const bech32Key = bech32.encode("ed25519_sk", bech32.toWords(keyBytes));

console.log("Bech32 Signing Key:", bech32Key);
