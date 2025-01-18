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
    hash: "8ae0f8e435d2d7f11ce99b80633f24489a3d3890ae2c69909c278b11" , //taken from cardano-cli generated verification key hash
  };

  // channel keys:

  // private key ed25519_sk1uls3ukk9hjuzgd2drp0unt6r3rf690xkvz2jlmzmr8nh5q6t8wkqfmtfuu
  // public key ed25519_pk1w4h2426w3yq7vsv7l693h6rwhr50ydddt68zutys2pccl7vm42csa3mdjl
  // address key addr_test1vz9wp78yxhfd0uguaxdcqcely3yf50fcjzhzc6vsnsnckygnl2zc3
  // channel hash key 8ae0f8e435d2d7f11ce99b80633f24489a3d3890ae2c69909c278b11

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
console.log("Validator Address: " + channelAddress);
