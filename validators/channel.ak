use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval.{Finite, IntervalBound}
use cardano/address.{VerificationKey}
use cardano/assets.{from_lovelace}
use cardano/transaction.{Output, OutputReference, Transaction}

pub type PaymentChannelParams {
  min_amount: Int,
  timeout_slots: Int,
}

pub type Action {
  InitialDeposit
  UpdateTransaction {
    new_balance1: Int,
    new_balance2: Int,
    sequence_number: Int,
  }
  RequestSettlement {
    final_balance1: Int,
    final_balance2: Int,
    sequence_number: Int,
  }
  CloseChannel
}

pub type ChannelDatum {
  party1: VerificationKeyHash,
  party2: VerificationKeyHash,
  balance1: Int,
  balance2: Int,
  sequence_number: Int,
  settlement_requested: Bool,
  created_slot: Int,
}

validator paymentchannel(params: PaymentChannelParams) {
  spend(
    datum: Option<ChannelDatum>,
    redeemer: Action,
    _target: OutputReference,
    tx_info: Transaction,
  ) {
    expect Some(datum) = datum
    when redeemer is {
      InitialDeposit -> validate_initial_deposit(datum, tx_info, params)
      UpdateTransaction { new_balance1, new_balance2, sequence_number } ->
        validate_update(
          datum,
          new_balance1,
          new_balance2,
          sequence_number,
          tx_info,
        )
      RequestSettlement { final_balance1, final_balance2, sequence_number } ->
        validate_settlement(
          datum,
          final_balance1,
          final_balance2,
          sequence_number,
          tx_info,
        )
      CloseChannel -> validate_close(datum, tx_info, params)
    }
  }

  else(_) {
    fail
  }
}

fn validate_initial_deposit(
  datum: ChannelDatum,
  tx_info: Transaction,
  params: PaymentChannelParams,
) -> Bool {
  let current_slot: Int =
    when tx_info.validity_range.lower_bound is {
      IntervalBound { bound_type: Finite(n), .. } -> n
      _ -> 0
    }
  datum.balance1 >= params.min_amount && datum.balance2 >= params.min_amount && // Verify minimum amounts
  datum.created_slot == current_slot && // Verify initial slot is set   // Use POSIX time  -- verifiability 
  !datum.settlement_requested && // Verify settlement not requested
  datum.sequence_number == 0
  // Verify sequence starts at 0
}

fn validate_update(
  datum: ChannelDatum,
  new_balance1: Int,
  new_balance2: Int,
  sequence_number: Int,
  tx_info: Transaction,
) -> Bool {
  must_be_signed_by(tx_info, [datum.party1, datum.party2]) && // Verify the update is signed by both parties
  sequence_number > datum.sequence_number && // Verify sequence number increases
  new_balance1 >= 0 && new_balance2 >= 0 && // Verify balances are non-negative
  new_balance1 + new_balance2 == datum.balance1 + datum.balance2 && // Verify total balance is preserved
  !datum.settlement_requested
  // Verify settlement not requested
}

fn validate_settlement(
  datum: ChannelDatum,
  final_balance1: Int,
  final_balance2: Int,
  sequence_number: Int,
  tx_info: Transaction,
) -> Bool {
  // Verify request is signed by either party
  (
    must_be_signed_by(tx_info, [datum.party1]) || must_be_signed_by(
      tx_info,
      [datum.party2],
    )
  ) && sequence_number == datum.sequence_number && // Verify sequence number matches
  final_balance1 == datum.balance1 && final_balance2 == datum.balance2 && // Verify final balances match current state
  !datum.settlement_requested && // Verify settlement not already requested
  datum.settlement_requested == True
  // Update settlement requested flag
}

fn validate_close(
  datum: ChannelDatum,
  tx_info: Transaction,
  params: PaymentChannelParams,
) -> Bool {
  let current_slot: Int =
    when tx_info.validity_range.lower_bound is {
      IntervalBound { bound_type: Finite(n), .. } -> n
      _ -> 0
    }
  datum.settlement_requested || current_slot >= datum.created_slot + params.timeout_slots && // Can only close if settlement was requested or timeout reached
  must_be_signed_by(tx_info, [datum.party1, datum.party2]) && // Must be signed by both parties
  verify_final_payments(tx_info, datum)
  // Verify outputs pay correct amounts to each party
}

fn must_be_signed_by(
  tx_info: Transaction,
  required_signers: List<VerificationKeyHash>,
) -> Bool {
  list.all(
    required_signers,
    fn(signer) { list.has(tx_info.extra_signatories, signer) },
  )
}

fn verify_final_payments(tx_info: Transaction, datum: ChannelDatum) -> Bool {
  let party1_payment =
    list.find(
      tx_info.outputs,
      fn(output) {
        when output.address.payment_credential is {
          VerificationKey(hash) -> hash == datum.party1
          _ -> False
        } && output.value == from_lovelace(datum.balance1)
      },
    )
  // staking credentials verification
  let party2_payment =
    list.find(
      tx_info.outputs,
      fn(output) {
        when output.address.payment_credential is {
          VerificationKey(hash) -> hash == datum.party2
          _ -> False
        } && output.value == from_lovelace(datum.balance2)
      },
    )
  when (party1_payment, party2_payment) is {
    (Some(_), Some(_)) -> True
    _ -> False
  }
}
// lucid evolution compose 
