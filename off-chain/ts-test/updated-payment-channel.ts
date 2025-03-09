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

// Update the Payment Channel
const update_channel = async (additionalFunds: bigint): Promise<Result<string>> => {
    try {
        // Initial validations
        if (!lucid) throw "Uninitialized Lucid";
        if (!amy_wallet) throw "Undefined Amy's address";
        if (!bob_wallet) throw "Undefined Bob's address";
        if (!channelAddress) throw "Undefined script address";
        
        // Fetch UTXOs at the channel address
        const utxos = await lucid.utxosAt(channelAddress);
        if (utxos.length === 0) throw "No UTXOs found at the channel address";

        const channel_utxo = utxos[utxos.length - 1];
        console.log("Channel UTXO: ", channel_utxo);

        // Retrieve and validate current datum
        const currentDatum = Data.from<Constr>(channel_utxo.datum);
        console.log("Current Datum: ", currentDatum);

        const [
            party1,
            party2,
            balance1,
            balance2,
            sequenceNumber,
            settlementRequested,
            createdSlot,
        ] = currentDatum.fields;

        // Verify settlement is not requested
        if (settlementRequested) {
            throw "Cannot update channel - settlement has been requested";
        }

        // Calculate and validate new sequence number
        const newSequenceNumber = sequenceNumber + 1n;
        console.log("Updated Sequence Number:", newSequenceNumber);
        if (newSequenceNumber <= sequenceNumber) {
            throw "The sequence number must increase";
        }

        const currentValue = channel_utxo.assets.lovelace;
        console.log("Before Update:");
        console.log("Current Channel Value:", Number(currentValue) / 1000000, "ADA");

         // Get the fee amount
       const feeAmount = 274122;
        // Calculate new balances
        const newBalance1 = balance1+ additionalFunds;
        const newBalance2 = balance2;

        console.log("\nNew Balances:");
        console.log("Party 1:", Number(newBalance1) / 1000000, "ADA");
        console.log("Party 2:", Number(newBalance2) / 1000000, "ADA");
        console.log("Total:", Number(newBalance1 + newBalance2) / 1000000, "ADA");

        // Validate non-negative balances
        if (newBalance1 < 0n || newBalance2 < 0n) {
            throw "Balances must be non-negative";
        }

        
        // Validate total balance preservation with additional funds
        const expectedValue = newBalance1 + newBalance2;  // Using the fetched balances
        const actualValue = currentValue + additionalFunds;
        console.log("Expected value:", Number(expectedValue) / 1000000, "ADA");
        console.log("Actual value:", Number(actualValue) / 1000000, "ADA");
        
        if (actualValue !== expectedValue) {
            throw `Output value mismatch: Expected ${expectedValue}, got ${actualValue}`;
        }

        // Create the redeemer for the UpdateTransaction action
        const updateRedeemer = Data.to(new Constr(1, [
            BigInt(newBalance1),
            BigInt(newBalance2),
            BigInt(newSequenceNumber),
        ]),
    );

        // Create updated datum
        const updatedDatum = Data.to(new Constr(0, [
            party1,
            party2,
            BigInt(newBalance1),
            BigInt(newBalance2),
            BigInt(newSequenceNumber),
            BigInt(settlementRequested),
            BigInt(createdSlot),
        ]),
    );

        console.log("Updated Datum: ", updatedDatum);

       
      

        // Build the transaction
        const tx = await lucid
            .newTx()
            .collectFrom(
                [channel_utxo],
                updateRedeemer,
            )
            .attach.SpendingValidator(validator.validator)

            .pay.ToContract(
                channelAddress, 
                { 
                    kind: "inline", 
                    value: updatedDatum,
                }, 
                {
                    lovelace: newBalance1 + newBalance2   // Use the validated total here
                }
            )
            .addSigner(amy_wallet)  // Require signature from party1
            .addSigner(bob_wallet)  // Require signature from party2
            // .setTotalCollateral(3000000n)  // Set to 3 ADAs
            .complete();
        
        console.log("tx:" , tx.toJSON());
       
        // Collect signatures from both parties
        const amySignedWitness = await tx.partialSign.withPrivateKey(amySigningkey);
        const bobSignedWitness = await tx.partialSign.withPrivateKey(bobSigningkey);

        // Assemble and submit the transaction
        const signedTx = await tx.assemble([amySignedWitness, bobSignedWitness]).complete();
        const txHash = await signedTx.submit();

        console.log("Payment Channel Updated! TxHash: " + txHash);
        return { type: "ok", data: txHash };
        
    } catch (error) {
        console.error("Error updating payment channel:", error);
        return { type: "error", error: new Error(`${error}`) };
    }
};


// Test the update_channel function
const update_funds = BigInt(6000000);
let updateResult = await update_channel(update_funds);
console.log("Update Result: ", updateResult);