use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval.{Finite}
use cardano/script_context.{ScriptContext}
use cardano/transaction.{
  Input, Output, OutputReference, Redeemer, Spend, Transaction, ValidityRange,
}

// Define the single data structure for managing the payment channel 
pub type ChannelDatum {
  party1: VerificationKeyHash,
  party2: VerificationKeyHash,
  balanceP1: Int,
  balanceP2: Int,
  sequence_no: Int,
  settlement_requested: Bool,
  lock_period: Int,
}

pub type PaymentChannelParams {
  min_amount: Int,
  lock_time: Int,
  // channel_state: Bool,
}

//whether channel is open or closed

pub type Action {
  InitializeChannel
  ValidateUpdate{
    new_balance1: Int,
    new_balance2: Int,
  }
  DisputeInitiation
  DisputeResolution
  SettlePayment{
    final_balance1: Int,
    final_balance2: Int,
    block_height: Int,
  }
 
  ChannelClosure
  ChannelAbort
}


pub type ChannelRedeemer {
  action: Action,
}


validator manage_payment_channel(params: PaymentChannelParams) {
  spend(
    datum: Option<ChannelDatum>,
    redeemer: ChannelRedeemer,
    context: ScriptContext,
    _utxo: OutputReference,
    transaction: Transaction,
  ) {
    expect Some(datum) = datum
    when redeemer.action is {
      InitializeChannel ->
        initialize_channel(
          datum,
          context,
          params,
          transaction.extra_signatories,
        )

      Validate_update{new_balance1, new_balance2} -> transmit_transaction_update(
          datum,
          new_balance1,
          new_balance2,
          context,
          params,
        )
  
    DisputeInitiation ->
      initiate_dispute(
        datum,
        params,
        transaction.extra_signatories,
      )
    DisputeResolution ->
      resolve_dispute(
        datum,
        params,
        transaction.extra_signatories,
      )
    
      SettlePayment -> settle_payment_channel(
        datum
        final_balance1, 
        final_balance2,
        context,
        signatories, 
        params,
        )
   ChannelClosure -> close_channel(datum,params, context, transaction.extra_signatories,
    )
    
    ChannelAbort -> abort(datum, transaction.extra_signatories)
     _ -> fail
     else(_) {
      fail
   }
   
 else(_) {
    fail
  }
 }

fn initialize_channel(
  datum: Option<ChannelDatum>,
  context: ScriptContext,
  params: PaymentChannelParams,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  expect Some(output_datum) = datum
  output_datum.balanceP1 >= params.min_amount && output_datum.balanceP2 >= params.min_amount && verify_signatures(
    [output_datum.party1, output_datum.party2],
    signatories,
  ) && output_datum.settlement_requested == True && // Check to Ensure the channel's settlement state matches the expected channel state      
  output_datum.lock_period == params.lock_time
  //  Validate the lock period matches the expected value
}

// Function to transmit updates
fn transmit_transaction_update(
  datum: ChannelDatum,
  context: ScriptContext,
  params: PaymentChannelParams,
) -> Bool {
  verify_signatures(context, [datum.party1, datum.party2]) &&
  params.channel_state && //// Ensure the channel state is open in the parameters
  params.new_balance1 >= 0 && params.new_balance2 >= 0 && //Ensure the new balances are valid (non-negative)
  datum.balanceP1 == params.new_balance1 && datum.balanceP2 == params.new_balance2 // Check if the balances provided match the new balances (for both parties)
  
  False //If datum is not present or conditions are not met, return false
  
}

// Function to initiate a dispute
//list of signed utxos, verify that initiated party 
fn initiate_dispute(
  datum: ChannelDatum,
  latest_state: Option<ChannelDatum>,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  expect Some(_state) = latest_state
  verify_signatures([datum.party1, datum.party2], signatories)
}

// Function to resolve a dispute
// based on the utxo and signatures funds will be released
fn resolve_dispute(
  datum: ChannelDatum,
  latest_state: Option<ChannelDatum>,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  expect Some(_state) = latest_state
  expect verify_signatures([datum.party1, datum.party2], signatories)
  True
}

fn settle_payment_channel(
  datum: ChannelDatum,  // Current state of the channel
  final_balance1: Int,   // Final balance for party1
  final_balance2: Int,   // Final balance for party2
  context: ScriptContext, // Transaction context
  signatories: List<VerificationKeyHash>, // Signatories to verify
  params: PaymentChannelParams // Payment channel parameters
) -> Bool {
  // Ensure the channel has been requested for settlement
  expect datum.settlement_requested == True
  // Ensure the provided balances match the stored balances for both parties
  expect datum.balanceP1 == final_balance1 // Check if provided balance matches stored balance for party1
  expect datum.balanceP2 == final_balance2 // Check if provided balance matches stored balance for party2
  verify_signatures([datum.party1, datum.party2], signatories) && // Verify signatures from both parties to confirm they authorize the settlement
  final_balance1 >= 0 && final_balance2 >= 0 && // Ensure that both final balances are non-negative
  final_balance1 + final_balance2 == datum.balanceP1 + datum.balanceP2 &&  // Check that the total sum of both parties balances matches the expected total
  context.block_height >= datum.lock_period && // Ensure that the lock period has expired and no further actions can be made
  datum.settlement_requested == False // Settled channel should no longer have the "settlement_requested" flag
}

// Function to close the channel
fn close_channel(
  datum: Option<ChannelDatum>,
  context: ScriptContext,
  params: PaymentChannelParams,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  expect Some(output_datum) = datum
  
  output_datum.channel_state && context.current_time >= params.lock_time && // Ensure the channel is open and lockTime has passed
  verify_signatures([output_datum.party1, output_datum.party2], signatories) &&    // Verify the signatures from both parties
  output_datum.balanceP1 + output_datum.balanceP2 == params.balanceP1 + params.balanceP2 && // Ensure the final balances match the initial state balances
  output_datum.settlement_requested == False && // Close the channel by setting the settlement_requested flag and updating lock period
  output_datum.lock_period == context.current_time
}

// Function to abort the channel
fn abort(datum: ChannelDatum, signatories: List<VerificationKeyHash>) -> Bool {
  let no_transactions_occurred = True
  // Implement logic to check for no transactions
  expect no_transactions_occurred
  expect verify_signatures([datum.party1, datum.party2], signatories)
  True
}

fn verify_signatures(
  required_signers: List<VerificationKeyHash>,
  signatories: List<VerificationKeyHash>,
) -> Bool {
  let check_signer =
    fn(signer) { list.has(signatories, signer) }
  list.all(required_signers, check_signer)
}


//steps:
//1. create  key pairs and generate address
//2. fetch faucets on address
//3. cli commands on existing saving account code ()
//4. write commands against each function of our payment channel
