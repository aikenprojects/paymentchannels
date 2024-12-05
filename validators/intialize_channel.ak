use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{OutputReference, Transaction}

// Define the single data structure for managing the channel
pub type ChannelDatum {
  party1: VerificationKeyHash,
  party2: VerificationKeyHash,
  balanceP1: Int,
  balanceP2: Int,
  stakeP1: Int, // Amount of ADA locked by party1
  stakeP2: Int, // Amount of ADA locked by party2
}

/// Action Enumerator
///  0 -> Initialize Channel
///  1 -> Transmit Update
///  2 -> Rebalance
///  3 -> Initiate Dispute
///  4 -> Resolve Dispute
///  5 -> Close Channel
///  6 -> Timeout
///  7 -> Abort
pub type Action = Int

pub type ChannelRedeemer {
  action: Action,
  stake: Int, // For rebalancing and other actions
  latest_state: Option<ChannelDatum>, // Optional for actions like disputes and closing
}

// Validator function for managing the channel
validator manage_channel {
  spend(
    datum: Option<ChannelDatum>,
    redeemer: ChannelRedeemer,
    _utxo: OutputReference,
    transaction: Transaction,
  ) {
    expect Some(datum) = datum

    when redeemer.action is {
      0 -> initialize_channel(datum, redeemer, transaction.extra_signatories)
      1 -> transmit_update(datum, redeemer.latest_state, transaction.extra_signatories)
      2 -> rebalance(datum, redeemer.stake, transaction.extra_signatories)
      3 -> initiate_dispute(datum, redeemer.latest_state, transaction.extra_signatories)
      4 -> resolve_dispute(datum, redeemer.latest_state, transaction.extra_signatories)
      _ -> fail
    }
  }

  else(_) {
    fail
  }
}

fn initialize_channel(
  datum: ChannelDatum,
  redeemer: ChannelRedeemer,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  let 
  expected_total_stake = datum.stakeP1 + datum.stakeP2
  datum.balanceP1 + datum.balanceP2 == expected_total_stake && verify_signatures([datum.party1, datum.party2], signatories)
}

// Function to transmit updates
fn transmit_update(
  datum: ChannelDatum,
  latest_state: Option<ChannelDatum>,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  expect Some(new_state) = latest_state
  datum.balanceP1 + datum.balanceP2 == new_state.balanceP1 + new_state.balanceP2 && verify_signatures([datum.party1, datum.party2], signatories)
}


// Function to rebalance the channel
fn rebalance(
  datum: ChannelDatum,
  stake: Int,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  expect True = stake > 0
  expect True =verify_signatures([datum.party1, datum.party2], signatories)
  True
}

// Function to initiate a dispute
fn initiate_dispute(
  datum: ChannelDatum,
  latest_state: Option<ChannelDatum>,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  expect Some(state) = latest_state
  verify_signatures([datum.party1, datum.party2], signatories)
  
}

// Function to resolve a dispute
fn resolve_dispute(
  datum: ChannelDatum,
  latest_state: Option<ChannelDatum>,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  expect Some(state) = latest_state
  expect True =verify_signatures([datum.party1, datum.party2], signatories)
  True
}

fn verify_signatures(
    required_signers: List<VerificationKeyHash>,
    signatories: List<VerificationKeyHash>,
) -> Bool {
    let check_signer = fn(signer) {
        list.has(signatories, signer)
    }
    list.all(required_signers, check_signer)
}
