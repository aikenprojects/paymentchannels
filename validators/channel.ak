use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
// use aiken/interval.{Finite, IntervalBound}
// use cardano/address.{VerificationKeyHash}
// use cardano/assets.{from_lovelace}
use cardano/transaction.{OutputReference, Transaction}

pub type Action =
  Int

pub type ChannelDatum {
  party1: VerificationKeyHash,
  party2: VerificationKeyHash,
  balance1: Int,
  balance2: Int,
}

// pub type CFredeemer {
//   action: Action,
// }

validator paymentchannel {
  spend(
    datum: Option<ChannelDatum>,
    redeemer: Action,
    tx_info: Transaction,
    _utxo: OutputReference,
  ) {
    expect Some(datum) = datum
    when redeemer is {
      0 -> validate_initial_deposit(datum, tx_info)
      1 -> validate_close(datum, tx_info)

      _ -> fail
    }
  }

  else(_) {
    fail
  }
}

fn validate_initial_deposit(datum: ChannelDatum, tx_info: Transaction) -> Bool {
  must_be_signed_by(tx_info, [datum.party1, datum.party2])
}

fn validate_close(datum: ChannelDatum, tx_info: Transaction) -> Bool {
  // Can only close if settlement was requested or timeout reached
  // Must be signed by both parties
  must_be_signed_by(tx_info, [datum.party1, datum.party2])
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
