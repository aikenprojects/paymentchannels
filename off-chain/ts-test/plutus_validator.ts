import {
    applyDoubleCborEncoding,
    Constr,
    Credential,
    SpendingValidator,
    validatorToAddress,
    
} from "npm:@lucid-evolution/lucid";

import { networkConfig } from "./setting.ts";
const project_path = networkConfig.workspacePath;

const channelPaymentCredential: Credential = {
    type: "Key",
    hash: "8aeb58bb51435ccac7e66cc263b18da8af7c5429c1645220c542ce17"  //taken from cardano-cli generated verification key hash
  };

  // channel keys:
//   private key ed25519_sk1fevrgy8nzusce0m0rcp6trrfp63fgc5xyw9znn7g0tucz80f6qksvq2k2m
// public key ed25519_pk132ydttasyykgvv8enltqe0xr7jfu4q4q6gpd5rduhntj43f84q5q93yhmt
// address key addr_test1vr66eeta0ylq8g5q6t9x74np04lgvwlgp8h28fmq5lyrwygpkmk3j
// channel hash key f5ace57d793e03a280d2ca6f56617d7e863be809eea3a760a7c83711

// // // // // read validator from blueprint json file created with aiken
export const validator = await readValidator();

async function readValidator(): Promise<SpendingValidator> {

  const raw_validator = JSON.parse(await Deno.readTextFile(networkConfig.workspacePath+"/plutus.json")).validators[0];
  const redeem = raw_validator.redeemer;
    //   console.log("extracted reedemer", redeem)

  const currentTime = Date.now(); // console.log("Current time: " + currentTime.toLocaleString());
  const deadlineTime = BigInt(currentTime +  1000 * 60 * 5);

    // // Print the deadline in human-readable format
    // console.log("Deadline time (5 days from now): " + deadlineTime.toLocaleString());

  // Validator Parameters
  const paymentChannelParams = {
    minAmount: 100000n,     // Example minimum amount 
    Slot: deadlineTime,             // Example timeout in slots
  };
  
  // Helper function to encode parameters into Plutus Data

    const encodeParams = (params) => {

    return new Constr(0, [params.minAmount, params.Slot]);
  };

  // Applying Parameters to the Validator
  const encodedParams = encodeParams(paymentChannelParams);
  //console.log("encoded params:", encodedParams);

  return { 
    validator: {
        type: "PlutusV3",
        script: applyDoubleCborEncoding(raw_validator.compiledCode),
        params: encodedParams,
    },
  };
}

// console.log("Validator:", validator.validator);

//channel address configuration
export const channelAddress = validatorToAddress(
    networkConfig.network,
    validator.validator,
    channelPaymentCredential,

);
//console.log("Validator Address: " + channelAddress);
