use aiken/collection/list


// Define the data types for channel initialization
pub type Party {
    address: VerificationKeyHash,
    stake: Int, // Amount of ADA to lock in the channel
}

pub type InitializeParams {
    party1: Party,
    party2: Party,
}

// The datum represents the initial state of the channel
pub type ChannelDatum {
    party1: VerificationKeyHash, 
    party2: VerificationKeyHash, 
    balanceP1: Int, 
    balanceP2: Int,
}

/// Actions Enumerator
///  0 -> Initialize Channel
pub type Action = Int


// The redeemer represents the action to initialize the channel
pub type ChannelRedeemer {
    action: Action,
    params: InitializeParams,
}

// Validator function for initializing the channel
validator manage_channel {
    spend(
        datum: ChannelDatum,
        redeemer: ChannelRedeemer,
        transaction: Transaction, 
    ) {
        // Ensure the datum exists
        expect Some(datum) = datum

        // Match the action specified in the redeemer
        when redeemer.action is {
            // Case 0: Initialize Channel
            0 -> {
                initialize_channel(
                    datum,
                    redeemer.params,
                    transaction.inputs,
                )
            }

            // Default case: Fail for any other action
            _ -> fail
        }
    }
    else(_) {
    fail
  }
}


fn initialize_channel(
    datum: ChannelDatum,                      // Current channel state
    params: InitializeParams,                // Initialization parameters
    inputs: List<Input>,                     // List of transaction inputs
    signatories: List<VerificationKeyHash>,  // Transaction signers
) {
    let
        // Total expected stake from both parties
        expected_total_stake = params.party1.stake + params.party2.stake

        // Calculate the actual stake provided to the script address
        provided_stake == inputs
            .filter((input) -> input.address == ScriptAddress)
            .fold(0, (sum, input) -> sum + input.value.lovelace)

        // Ensure the parties in the datum match the initialization parameters
        parties_match = 
            datum.party1 == params.party1.address &&
            datum.party2 == params.party2.address

        // Verify signatures for both parties
        party1_signed = signature_verification(params.party1.address, signatories)
        party2_signed = signature_verification(params.party2.address, signatories)

        // Validate all conditions for successful initialization
        valid_initialization = 
            provided_stake == expected_total_stake &&
            parties_match &&
            party1_signed &&
            party2_signed

    // Fail the transaction if any condition is not met
    expect True = valid_initialization
}

// Function to verify a signer exists in the list of signatories
fn signature_verification(
    signer: VerificationKeyHash,            // Expected signer
    signatories: List<VerificationKeyHash>, // Actual transaction signers
) -> Bool {
    list.has(signatories, signer)
}
