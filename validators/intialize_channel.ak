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
///  3 -> Transmit Update
///  4 -> Rebalance
pub type Action = Int

// Additional types for new actions
pub type TransmitParams {
    updated_balanceP1: Int,
    updated_balanceP2: Int,
}

pub type RebalanceParams {
    additional_fundsP1: Int,
    additional_fundsP2: Int,
}

// The redeemer represents the action and associated parameters
pub type ChannelRedeemer {
    action: Action,
    params: any,
}

// Validator function for channel management
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
                    redeemer.params as InitializeParams,
                    transaction.inputs,
                    transaction.signatories,
                )
            }

            // Case 3: Transmit Update
            3 -> {
                transmit_update(
                    datum,
                    redeemer.params as TransmitParams,
                    transaction.signatories,
                )
            }

            // Case 4: Rebalance
            4 -> {
                rebalance(
                    datum,
                    redeemer.params as RebalanceParams,
                    transaction.inputs,
                    transaction.signatories,
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

// Helper functions

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

//function to send updated state among parties
fn transmit_update(
    datum: ChannelDatum,                     // Current channel state
    params: TransmitParams,                  // Parameters for the update
    signatories: List<VerificationKeyHash>,  // Transaction signers
) {
    let
        // Ensure both balances are non-negative
        valid_balances = params.updated_balanceP1 >= 0 && params.updated_balanceP2 >= 0

        // Ensure the total balance remains the same
        total_balance_preserved = 
            datum.balanceP1 + datum.balanceP2 ==
            params.updated_balanceP1 + params.updated_balanceP2

        // Verify signatures for both parties
        party1_signed = signature_verification(datum.party1, signatories)
        party2_signed = signature_verification(datum.party2, signatories)

        // Validate all conditions for a valid update
        valid_update = valid_balances && total_balance_preserved && party1_signed && party2_signed

    // Fail the transaction if any condition is not met
    expect True = valid_update
}


// function to rebalnce funds in case additional fund is required
fn rebalance(
    datum: ChannelDatum,                      // Current channel state
    params: RebalanceParams,                 // Rebalance parameters
    inputs: List<Input>,                     // List of transaction inputs
    signatories: List<VerificationKeyHash>,  // Transaction signers
) {
    let
        // Calculate additional funds provided by each party
        additional_funds_p1 = params.additional_fundsP1
        additional_funds_p2 = params.additional_fundsP2

        // Calculate total additional funds
        total_additional_funds = additional_funds_p1 + additional_funds_p2

        // Ensure additional funds are non-negative
        valid_funds = additional_funds_p1 >= 0 && additional_funds_p2 >= 0

        // Calculate the stake provided to the script address
        provided_stake == inputs
            .filter((input) -> input.address == ScriptAddress)
            .fold(0, (sum, input) -> sum + input.value.lovelace)

        // Ensure the provided stake matches the additional funds
        stake_matches = provided_stake == total_additional_funds

        // Verify signatures for both parties
        party1_signed = signature_verification(datum.party1, signatories)
        party2_signed = signature_verification(datum.party2, signatories)

        // Validate all conditions for a valid rebalance
        valid_rebalance = valid_funds && stake_matches && party1_signed && party2_signed

    // Fail the transaction if any condition is not met
    expect True = valid_rebalance
}

// Function to verify a signer exists in the list of signatories
fn signature_verification(
    signer: VerificationKeyHash,            // Expected signer
    signatories: List<VerificationKeyHash>, // Actual transaction signers
) -> Bool {
    list.has(signatories, signer)
}
