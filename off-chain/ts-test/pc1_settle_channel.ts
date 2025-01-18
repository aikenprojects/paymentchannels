import {
    Blockfrost,
    Constr,
    Data,
    Lucid,
    PROTOCOL_PARAMETERS_DEFAULT,
   
    
} from "npm:@lucid-evolution/lucid";

import amy_skey from "./amySkey.json" with { type: "json" };
import bob_skey from "./bobskey.json" with { type: "json" };
import {validator, channelAddress} from "./plutus_validator.ts";
import { networkConfig } from "./setting.ts";
import { Result } from "./types.ts";


const lucid = await Lucid(
    new Blockfrost(
        networkConfig.blockfrostURL,
        networkConfig.blockfrostAPIkey,
    ),
    networkConfig.network,
    { presetProtocolParameteres: PROTOCOL_PARAMETERS_DEFAULT },
);
// console.log("Network: " + networkConfig.network);
// console.log("BlockfrostKEY: " + networkConfig.blockfrostAPIkey);
// console.log("BlockfrostURL: " + networkConfig.blockfrostAPI);

//party1 credentials
const amySigningkey = amy_skey.ed25519_sk;
console.log("amy sk: " + amySigningkey);

lucid.selectWallet.fromPrivateKey(amySigningkey);
const amy_wallet = await lucid.wallet().address();
console.log("Address: " + amy_wallet);

const amy_utxo = await lucid.utxosAt(amy_wallet);
console.log("Amy Address utxo: ", amy_utxo);

//party2 credentials
const bobSigningkey = bob_skey.ed25519_sk;
console.log("bob sk: " + bobSigningkey);

lucid.selectWallet.fromPrivateKey(bobSigningkey);
const bob_wallet = await lucid.wallet().address();
console.log("bob Address: " + bob_wallet);

const bob_utxo = await lucid.utxosAt(bob_wallet);
console.log("bob Address utxo: ", bob_utxo);


// // Validate Settlement function
const validate_settlement = async ( final_balance1:bigint, final_balance2:bigint,): Promise<Result<string>> => {
    try {
        if (!lucid) throw "Uninitialized Lucid";
        if (!amy_wallet) throw "Undefined Amy's address";
        if (!bob_wallet) throw "Undefined Bob's address";
        if (!channelAddress) throw "Undefined script address";
        

        const utxos = await lucid.utxosAt(channelAddress);

        if (utxos.length === 0) throw "No UTXOs found at the channel address";

        const channel_utxo = utxos[utxos.length - 1];
        console.log("Using UTXO: ", channel_utxo);

        const currentDatum = Data.from<Constr>(channel_utxo.datum);
        console.log("Current Datum: ", currentDatum);

    
        const storedBalance1 = currentDatum.fields[2]; // balanceP1
        const storedBalance2 = currentDatum.fields[3]; // balanceP2
        
        console.log("Type of storedBalance1:", typeof storedBalance1);
        console.log("Type of storedBalance2:", typeof storedBalance2);



        // const storedBalance1BigInt = BigInt(storedBalance1); 
        // const storedBalance2BigInt = BigInt(storedBalance2);

        if (final_balance1 !== storedBalance1 || final_balance2 !== storedBalance2) {
            throw new Error("Final balances do not match the current state");
        }

        // 4. Verify settlement not already requested
        const settlementRequested = currentDatum.fields[5];// Assuming settlement_requested is in the 8th field
        if (settlementRequested) {
            throw new Error("Settlement already requested");
        }

        // 5. Update settlement requested flag and prepare the updated datum
        const updatedDatum = new Constr(0, [
            currentDatum.fields[0], // party1's 
            currentDatum.fields[1], // party2's 
            final_balance1, // final balanceP1
            final_balance2, // final balanceP2
            currentDatum.fields[4] + 1n,
            settlementRequested,
            currentDatum.fields[6], 

        ]);
        console.log("Updated Datum for Settlement: ", updatedDatum);

        const tx = await lucid
            .newTx()

            .pay.ToContract(channelAddress, { kind: "inline", value: Data.to(updatedDatum) }, {

                lovelace: final_balance1 + final_balance2, // Assuming final balances reflect the total payment
            })
            .addSigner(amy_wallet)
            .addSigner(bob_wallet)
            .complete();
        
        console.log("tx:" , tx.toJSON());
        

        const amySignedWitness = await tx.partialSign.withPrivateKey(amySigningkey);
        const bobSignedWitness = await tx.partialSign.withPrivateKey(bobSigningkey);
        // console.log("witness set:", bobSignedWitness);

        // Assemble the transaction with the collected witnesses
        const signedTx = await tx.assemble([amySignedWitness, bobSignedWitness]).complete();

        const txHash = await signedTx.submit();
        console.log("Settlement Finalized! TxHash: " + txHash);

        return { type: "ok", data: txHash };
    } catch (error) {
        console.error("Error validating settleement :", error);
        if (error instanceof Error) return { type: "error", error: error };
        return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
};


const final_balance1 = 350000n; // final balance for party1
const final_balance2 = 250000n; // Ensure this is set to a valid `bigint`


let settlementResult = await validate_settlement(
    final_balance1,
    final_balance2,
);


console.log("Settlement Result: ", settlementResult);