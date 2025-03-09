**Payment Channel Contract Documentation**

**Introduction**

This document provides an overview of the Payment Channel contract implemented using the Aiken framework. The contract facilitates secure and efficient off-chain transactions between two parties while ensuring the balances are synchronized and the settlement process adheres to predefined rules. The implementation involves several validator functions to manage the lifecycle of a payment channel, including depositing initial funds, updating balances, requesting settlements, and closing the channel.

The core concept is to enable trustless interactions between two parties by leveraging the UTxO (Unspent Transaction Output) model and cryptographic verification for transaction signatures. Each phase of the payment channel is governed by a spending validator that enforces specific rules for validating transactions.

**Channel Initiation:**

This action is the first step in establishing a payment channel. Both parties deposit a minimum balance into the channel to initialize it. This ensures that the channel starts with adequate funds and enforces the rules for subsequent updates and settlements.

**Implementation Logic**

1. **Minimum Amount Verification**: The initial deposited balance by party1 and party2 must meet or exceed the set minimum amount for channel creation.
2. **Initial Slot Validation**: The contract checks that the creation time of the datum is within the valid range, ensuring timeliness.
3. **Settlement Check**: Ensures that no settlement is requested.
4. **Sequence Initialization**: Verifies that the sequence number starts at 0.

Let's say Alice and Bob want to establish a payment channel where they both contribute funds. In this scenario, they will each contribute 30 ADA to create a shared channel that allows them to conduct multiple transactions off-chain.

Initially, we have:

- Alice's wallet contains one UTxO (UTxO#A1) with 30 ADA at index 0
- Bob's wallet contains one UTxO (UTxO#B1) with 30 ADA at index 0

When they initiate the transaction to create the payment channel, both Alice and Bob's UTxOs serve as inputs to a single transaction block. During this transaction:

1. The transaction combines their total input of 60 ADA
2. The transaction creates three distinct outputs:
    - 5 ADA goes to the Payment Channel Contract (UTxO#P1, index: 0)
    - 27.5 ADA returns to Alice's wallet as change (UTxO#A2, index: 1)
    - 26.5 ADA returns to Bob's wallet as change (UTxO#B2, index: 1)
    - The remaining 1 ADA covers the transaction fee

The Payment Channel Contract now holds 5 ADA which serves as the shared fund pool that Alice and Bob can use for their off-chain transactions. The contract includes information about both participants (their public key hashes) and any specific conditions they've agreed upon for using the channel.

During this transaction, both Alice and Bob must sign since they're both contributing funds. The smart contract ensures that neither party can unilaterally withdraw the funds without following the agreed-upon rules encoded in the contract.

**Update Transaction:**

This action allows both parties to update their balances within the channel. This ensures that transactions can occur off-chain while maintaining a consistent state on-chain.

**Implementation Logic**

1. **Signature Verification**: Both parties must sign the update to ensure mutual agreement.
2. **Sequence Validation**: The sequence number must be greater than the previous value, ensuring the update is valid.
3. **Non-Negative Balances**: Updated balances by both parties must remain non-negative.
4. **Balance Preservation**: The total balance in the channel must remain unchanged.
5. **Settlement Check**: Ensures no settlement is requested during the update.

Let's say Alice wants to send 2 ADA to Bob through their established payment channel. This transaction will occur as an update to their channel state while maintaining the security and integrity of their balances. Initially, we have:

- The Payment Channel Contract holds one UTxO (UTxO#C1) with 5 ADA total at index 0, where: Alice's balance is 2 ADA and Bob's balane is 3 ADA
- The sequence number is 0
- Alice's wallet contains one UTxO (UTxO#A2) with 27.5 ADA at index 1

When Alice initiates the transfer of 2 ADA to Bob, both the channel state and Alice's wallet UTxO serve as inputs to a single transaction block. During this transaction:

1. The transaction processes the update while preserving the total channel balance of 5 ADA, ensuring no funds are created or destroyed within the channel.
2. The transaction creates two distinct outputs:
- First, a new channel state UTxO (UTxO#C2, index: 0) that contains:
- The preserved total of 5 ADA in the channel
- Alice's new balance of 0 ADA (reduced from 2 ADA after sending to Bob)
- Bob's updated balance of 5 ADA (increased from 3 ADA after receiving from Alice)
- An incremented sequence number of 1 Second, Alice's new wallet UTxO (UTxO#A3, index: 1) containing 24.5 ADA, which represents her remaining personal funds.

The Payment Channel Contract maintains the shared fund pool of 5 ADA while updating the internal balance allocation between Alice and Bob. The contract ensures that all balance updates are properly authorized and maintains the integrity of the channel state through sequence number validation.

During this transaction, both Alice and Bob must sign to validate the state update. The smart contract verifies that the total balance remains unchanged, the sequence number properly increments, and all balance updates result in non-negative values for both parties.

**Request Settlement:**

This action allows either party to request a settlement for the current balances. This initiates the process of closing the channel and distributing funds.

**Implementation Logic**

1. **Signature Verification**: Either party can request settlement, verified through their respective signatures.
2. **Sequence Match**: Ensures the sequence number matches the current state.
3. **Balance Match**: The final balances must match the current balances.

Building on our previous example where Alice sent 2 ADA to Bob, let's examine how Bob initiates a settlement request:

Initial State:

- The Payment Channel Contract holds UTxO#C2 with 5 ADA total where:
    - Alice's balance is 0 ADA
    - Bob's balance is 5 ADA
- The current sequence number is 1
- Bob's wallet contains UTxO#B3 with 26.5 ADA at index 2

When Bob initiates the settlement request, the transaction creates:

1. A new channel state UTxO (UTxO#C3) at index 0 containing:
2. Bob's wallet UTxO (UTxO#B3) remains unchanged at 26.5 ADA

The contract validates:

- Bob's signature authorizing the settlement request
- The sequence number matches the current state
- The balances remain unchanged from the last valid state

**Close Channel:**

This action finalizes the payment channel, distributing funds to the respective parties and closing the contract. Following the settlement request and grace period expiration, the channel can be closed. This process distributes the funds according to the final balances and permanently closes the channel.

**Implementation Logic**

1. **Condition Validation**: Allows closure if settlement is requested or the deadline is reached.
2. **Signature Verification**: Both parties must sign the transaction to close the channel.
3. **Payment Distribution**: Verifies that the correct amounts are paid to each party based on the final balances.

The process begins with the channel's final state in UTxO#C3, containing the 5 ADA total balance split between Bob (5 ADA) and Alice (0 ADA), along with the expired settlement deadline.

The closing transaction creates UTxOs for both parties:

1. Bob's final distribution (UTxO#B4):
    - Combines his channel balance (2 ADA) with his existing wallet balance (26.5 ADA)
    - Creates a new UTxO with 28.5 ADA at index 0
2. Alice's final distribution (UTxO#A5):
- Combines her channel balance (2 ADA) with her existing wallet balance (24.5 ADA)
- Creates a new UTxO with 26.5 ADA at index 0
1. 1ADA is expended as gas fee
2. Consumes the channel UTxO, permanently closing the channel

The contract ensures:

- The settlement period has expired or both parties have signed
- The final distribution exactly matches the last agreed-upon balances
- All required signatures are present (both Alice and Bob must sign)
- Both parties receive their funds in new UTxOs, even if their channel balance is zero
- The channel UTxO is properly consumed and cannot be reused

This final transaction requires signature validation from both parties, regardless of their final channel balances. The contract meticulously verifies that either the settlement period has expired or both parties have explicitly agreed to close the channel. It ensures that the distribution of funds exactly matches the last validated state of the channel, and that all signatures are present and valid before allowing the closure to proceed. The creation of new UTxOs for both parties, even when one has a zero channel balance, maintains consistency in the transaction pattern and provides a clear audit trail of the channel's closure. This approach guarantees that the payment channel closure is handled securely and fairly for all participants, regardless of their final balance.

This completes the payment channel lifecycle, showing how the contract maintains the exact accounting of funds from initiation through closure while ensuring security and proper authorization at each step.