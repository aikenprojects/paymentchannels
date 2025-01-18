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


//network configuration
// console.log("Network: " + networkConfig.network);
// console.log("BlockfrostKEY: " + networkConfig.blockfrostAPIkey);
// console.log("BlockfrostURL: " + networkConfig.blockfrostURL);



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

console.log("channel address:", validator.validator);
console.log("channel address:",channelAddress);



// Create a payment channel
const initialize_channel = async (): Promise<Result<string>> => {
    try {
        if (!lucid) throw "Uninitialized Lucid";
        if (!amy_wallet) throw "Undefined Amy's address";
        if (!bob_wallet) throw "Undefined Bob's address";
        if (!channelAddress) throw "Undefined script address";
        

        // Fetch the parameters from the Validator
        const validParams = validator.validator.params;
        // console.log("Redeem Validator Params: ", redeemParams.fields[0])
        const minAmount = validParams.fields[0]; 
        console.log("min amount", minAmount)  
        // const deadline = validParams.fields[1];        
        
        // Fetch UTxOs at the channel address
        const utxos = await lucid.utxosAt(channelAddress);
        console.log("Current utxo: ", utxos);


        let currentSequenceNumber = BigInt(0n); // Default to 0 if no UTxOs are present


        if (utxos.length > 0) {
            // Extract the latest datum from the UTxOs
            const latestDatum = utxos[0].datum;
            if (latestDatum) {
                const parsedDatum = Data.from(latestDatum);
                currentSequenceNumber = parsedDatum.fields[4]; // Sequence number is the 5th field (0-indexed)
            }
        }

        console.log("Current sequence number: ", currentSequenceNumber);

        // Increment the sequence number

        const newSequenceNumber = currentSequenceNumber + 1n; //shouldn't it be done in update channel ????
        const created_slot = Date.now()
        console.log("Current time: ", created_slot);
        const balanceP1 = 200000n; // balance1

        // const balanceP2 = 0n; // balance2
        const settlementRequested = 0n; // settlement_requested (false)


        // Create datum based on the new ChannelDatum type
        const datum = Data.to(
            new Constr(0, [
                "5d20782e35c589a11061291fece1acc90f20edf612555382e0b6dc01", // party1's verification key hash (replace with actual key)
                "5a23fe1983b950076613a53b11bc7b393c0897121fd9a4036f80a43c", // party2's verification key hash (empty for now)
                balanceP1, // balance1
                BigInt(250000n), // balance2
                BigInt(newSequenceNumber), // sequence_number
                settlementRequested, // settlement_requested (false initially)
                BigInt(created_slot), // created_slot (example slot number) //channel creation time
                
            ]), 
        );
        console.log("datum:", datum);
    

        if (BigInt(balanceP1) < BigInt(minAmount)) throw "Balance1 is below the minimum amount.";
        if (settlementRequested !== 0n) throw "Settlement has already been requested.";

        // if (currentSequenceNumber !== 0n) throw "Sequence number is not starting at 0.";


        const tx = await lucid
            .newTx()
            .pay.ToContract(channelAddress, { kind: "inline", value: datum }, {
                lovelace: 200000n,
            })

            .pay.ToContract(channelAddress, { kind: "inline", value: datum }, {
                lovelace: 250000n,
            })
            .addSigner(amy_wallet)
            .addSigner(bob_wallet)
            .addSigner(amy_wallet)
            .addSigner(bob_wallet)
            .complete();
        
        // console.log("tx:" , tx.toJSON());
        

        const amySignedWitness = await tx.partialSign.withPrivateKey(amySigningkey);
        const bobSignedWitness = await tx.partialSign.withPrivateKey(bobSigningkey);
        // console.log("witness set:", bobSignedWitness);

        // Assemble the transaction with the collected witnesses
        const signedTx = await tx.assemble([amySignedWitness, bobSignedWitness]).complete();
       
        const txHash = await signedTx.submit();
    
        console.log("Payment Channel Initialized!");
        console.log("Payment Channel Initialized! Transaction Hash:", txHash);

        return { type: "ok", data: txHash };
    } catch (error) {
        console.error("Error initializing payment channel:", error);
        if (error instanceof Error) return { type: "error", error: error };
        return { type: "error", error: new Error(`${JSON.stringify(error)}`) };
    }
};

let txHash = await initialize_channel();
console.log("Realized Tx: " + txHash.data);



const cam_utxo = await lucid.utxosAt(channelAddress);
console.log("campaign Address utxo: ", cam_utxo);


