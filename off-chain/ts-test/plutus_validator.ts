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
    hash: "1e5b711e5025fa0f79ca9e515fc255db16ca46a05f2d0ba8a92f6984" , //taken from cardano-cli generated verification key hash
  };

  // channel keys:
  // private key ed25519_sk1jq7kh9t08988zt7kz999mz2zxsm9pm3de7s60mlcjnw7286q5tesvzzlmt
  // public key ed25519_pk1q6nxhe4zmjxakdstht4yx4n2nkd9vu3dpr7mszs9d5hjtez2gk7sc0fxk2
  // address key addr_test1vq09kug72qjl5rmee209zh7z2hd3djjx5p0j6zag4yhknpqne227s
  // channel hash key 1e5b711e5025fa0f79ca9e515fc255db16ca46a05f2d0ba8a92f6984
// // // // // read validator from blueprint json file created with aiken
export const validator = await readValidator();

async function readValidator(): Promise<SpendingValidator> {

  const raw_validator = JSON.parse(await Deno.readTextFile(networkConfig.workspacePath+"/plutus.json")).validators[0];

  return { 
    validator: {
        type: "PlutusV3",
        script: applyDoubleCborEncoding(raw_validator.compiledCode),
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
