use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval.{Finite, IntervalBound}
use cardano/address.{VerificationKey}
use cardano/assets.{from_lovelace}
use cardano/transaction.{Output, OutputReference, Transaction, ValidityRange}

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
  created_time: Int,
}

pub type PaymentChannelParams {
  min_amount: Int,
  deadline: Int,
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
  _tx_info: Transaction,
  params: PaymentChannelParams,
) -> Bool {
  and {
    // Verify minimum amounts
    datum.balance1 >= params.min_amount,
    datum.balance2 >= params.min_amount,
    // Verify initial slot is set   // Use POSIX time  -- verifiability
    params.deadline > datum.created_time,
    //current time should be equal to the data creation time (take only one)
    // Verify settlement not requested
    !datum.settlement_requested,
    // Verify sequence starts at 0
    datum.sequence_number == 0,
  }
}

fn validate_update(
  datum: ChannelDatum,
  new_balance1: Int,
  new_balance2: Int,
  sequence_number: Int,
  tx_info: Transaction,
) -> Bool {
  and {
    // Verify the update is signed by both parties
    must_be_signed_by(tx_info, [datum.party1, datum.party2]),
    // Verify sequence number increases
    sequence_number > datum.sequence_number,
    // Verify balances are non-negative
    new_balance1 >= 0 && new_balance2 >= 0,
    // Verify total balance is preserved
    new_balance1 + new_balance2 == datum.balance1 + datum.balance2,
    // Verify settlement not requested
    !datum.settlement_requested,
  }
}

fn validate_settlement(
  datum: ChannelDatum,
  final_balance1: Int,
  final_balance2: Int,
  sequence_number: Int,
  tx_info: Transaction,
) -> Bool {
  and {
    // Verify request is signed by either party
    must_be_signed_by(tx_info, [datum.party1]) || must_be_signed_by(
      tx_info,
      [datum.party2],
    ),
    // Verify sequence number matches
    sequence_number == datum.sequence_number,
    // Verify final balances match current state
    final_balance1 == datum.balance1,
    final_balance2 == datum.balance2,
    // Verify settlement not already requested
    !datum.settlement_requested,
  }
}

fn validate_close(
  datum: ChannelDatum,
  tx_info: Transaction,
  params: PaymentChannelParams,
) -> Bool {
  and {
    // Can only close if settlement was requested or timeout reached
    datum.settlement_requested || must_happen_before(
      tx_info.validity_range,
      params.deadline,
    ),
    // Must be signed by both parties
    must_be_signed_by(tx_info, [datum.party1, datum.party2]),
    // Verify outputs pay correct amounts to each party
    // verify_final_payments(tx_info, datum),
  }
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

fn must_happen_before(range: ValidityRange, lock_expiration_time: Int) -> Bool {
  when range.lower_bound.bound_type is {
    Finite(tx_latest_time) -> lock_expiration_time <= tx_latest_time
    _ -> False
  }
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
