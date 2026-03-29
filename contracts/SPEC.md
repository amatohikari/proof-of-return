# AMI Smart Contract Specification

**Proof of Return — Contract Architecture**

*Version 0.3 — March 2026*

---

## Overview

This document specifies the smart contract architecture for AMI (All Material is Impermanent), a reductive currency system where currency is issued, used, and returned through exponential decay — mirroring the natural cycle of all things.

The entire system is governed by two exponential functions:

- **Amortization decay**: `balance × (1 - r)^elapsed_seconds`
- **Base recovery**: `cap - (cap - balance) × 0.94^(elapsed_seconds / 86400)`

No conditional branches. No manual intervention. No batch processing.

---

## Design Constants

| Constant | Value | Derivation |
|---|---|---|
| T (half-life period) | 108 days | Number of bonnou (煩悩). Digit root = 9 |
| Residual rate at T | 3% | Minimum number for creation. Natural residue rate |
| Daily decay rate | ≈ 3.174% | `r_day = 1 - 0.03^(1/108)` |
| Per-second decay rate | ≈ 0.0000003674 | `r_sec = 1 - 0.03^(1/(108 × 86400))` |
| Base wallet cap | 1,000 Base (= 1,000 USDT) | Absolute ceiling, not a periodic allowance |
| Base daily recovery rate | 6% | Per-second: `0.94^(1/86400)` |
| Creation max grant | Up to 100,000 Base | System-level ceiling. Requires ≥ 10M participants |
| Peg | 1 Base = 1 USDT | Entry peg only |

### On-Chain Exponential Calculation

Solidity has no native floating-point arithmetic. Both decay and recovery are implemented using fixed-point math with the same strategy:

**Approach: Precomputed lookup table + time decomposition**

- Store `factor^n` for key intervals (1 hour, 1 day, 1 week)
- For arbitrary elapsed time, decompose into known intervals and multiply
- Example: 3 days + 2 hours + 47 minutes → `factor_3days × factor_2hours × factor_47min`

This avoids expensive on-chain exponentiation while maintaining precision within acceptable bounds (< 0.01% error). Both Amortization decay and Base recovery use this same decomposition pattern, ensuring per-second precision for both.

**Alternative approaches** (for future consideration):
- Taylor series approximation (gas-intensive for high precision)
- Off-chain computation with on-chain verification (oracle pattern)
- ABDKMath64x64 library for fixed-point exponentials

---

## Contract Architecture

```
AMISystem (proxy/upgradeable)
├── DecayMath.sol           — Exponential math library
├── AmortizationWallet.sol  — Exponential decay wallet
├── BaseWallet.sol          — Existence guarantee wallet
├── CreationWallet.sol      — Creative support wallet (no decay, no recovery)
├── StablecoinPool.sol      — SCP reserve fund
└── CreationModule.sol      — Grant approval (Phase 4)
```

---

## Three Wallets, Three Natures

| Wallet | Decays? | Recovers? | Nature |
|---|---|---|---|
| **Base** | No | Yes → cap | Existence guarantee. Always refills. |
| **Creation** | No | No | A finite fire. Use it or lose nothing — but once spent, it never comes back. |
| **Amortization** | Yes | No | The return cycle. Everything that was exchanged returns to zero. |

When Base or Creation is spent, it transforms into Amortization in the recipient's wallet. The same single formula governs all decay.

---

## 1. DecayMath — Exponential Function Library

The mathematical core shared by all contracts.

### Functions

**`decayFactor(uint256 elapsedSeconds) → uint256`**

Returns the multiplicative factor for Amortization decay over the given time period.

```
factor = (1 - r_sec) ^ elapsedSeconds
```

Represented as a fixed-point number with 18 decimal places (WAD precision).

At key checkpoints:
- 1 day (86,400 sec): factor ≈ 0.96826 (≈ 3.174% decayed)
- 1 week: factor ≈ 0.7987
- 30 days: factor ≈ 0.3792
- 108 days: factor = 0.03 (by definition)

**`recoveryFactor(uint256 elapsedSeconds) → uint256`**

Returns the fraction of Base deficit that remains after recovery. Uses the same time-decomposition strategy as `decayFactor`, with per-second precision.

```
factor = 0.94 ^ (elapsedSeconds / 86400)
```

This ensures that 23 hours and 59 minutes of recovery is correctly calculated, not truncated to zero.

**`recoverBalance(uint256 currentBalance, uint256 cap, uint256 elapsedSeconds) → uint256`**

Returns the Base balance after recovery:

```
newBalance = cap - (cap - currentBalance) × recoveryFactor(elapsedSeconds)
```

---

## 2. BaseWallet — Existence Guarantee

Each participant has exactly one Base wallet.

### State

```
address     owner
uint256     balance          // Current Base balance (WAD)
uint256     cap              // Personal cap = deposited USDT amount (max 1,000)
uint256     lastUpdateTime   // Timestamp of last recovery calculation
```

### Rules

1. **No decay**: Base inside the wallet does not decay. Existence is not amortized.
2. **Recovery**: Balance recovers toward `cap` via exponential recovery at per-second precision. Calculated lazily at each interaction. Recovery is governed by the system's exponential function — there is no monthly reset or periodic refill.
3. **Cap**: An absolute ceiling set by total USDT deposited. Maximum = 1,000 Base (= 1,000 USDT). This is not a monthly allowance — once the cap is reached, additional USDT goes to SCP.
4. **Payment**: When Base is spent, it leaves the Base wallet and enters the recipient's Amortization wallet as Amortization. The currency transforms at the moment of exchange.

### Key Operations

**`deposit(uint256 usdtAmount)`**
- Converts USDT to Base (1:1 peg)
- Adds to balance (up to cap)
- If wallet cap is already at maximum, all USDT goes to SCP
- No monthly limit — the cap is an absolute ceiling

**`pay(address to, uint256 amount)`**
- Triggers recovery calculation first (lazy evaluation)
- Deducts `amount` from sender's Base balance
- Credits `amount` to recipient's Amortization wallet
- Base → Amortization transformation occurs here

**`withdraw(uint256 usdtAmount)`**
- Withdraws USDT from SCP first
- If withdrawal exceeds SCP balance, reduces Base cap proportionally
- Rationale: Base cap represents the USDT backing in the reserve. Withdrawing USDT removes that backing, so the cap must decrease to maintain the entry peg's integrity. This is not a penalty — it is conservation. You cannot remove the foundation and keep the building.

**`getBalance() → uint256`** (view)
- Applies pending recovery since `lastUpdateTime` (per-second precision)
- Returns current effective balance
- Does not modify state (read-only)

---

## 3. CreationWallet — The Finite Fire

Each participant may have one Creation wallet (activated in Phase 4).

### State

```
address     owner
uint256     balance          // Remaining Creation (WAD)
```

No timestamp needed. Creation does not decay while held.

### Rules

1. **No decay**: Creation sits in the wallet until the creator is ready to use it. There is no time pressure.
2. **No recovery**: Once spent, the balance decreases and never comes back. A matchstick, not a candle.
3. **Partial spending**: The creator spends Creation piece by piece, in whatever amounts their work requires.
4. **Payment**: When Creation is spent, it transforms into Amortization in the recipient's wallet. Same transformation as Base → Amortization.

### Key Operations

**`pay(address to, uint256 amount)`**
- Deducts `amount` from Creation balance
- Credits `amount` to recipient's Amortization wallet
- Creation → Amortization transformation occurs here

**`getBalance() → uint256`** (view)
- Simple read. No calculation needed.

---

## 4. AmortizationWallet — Exponential Decay

Each participant has exactly one Amortization wallet.

### State

```
address     owner
uint256     balance          // Balance at last update (WAD)
uint256     lastUpdateTime   // Timestamp of last decay calculation
```

### Rules

1. **Continuous decay**: The entire balance decays at `r_sec` per second. Implemented via lazy evaluation — actual computation occurs only at interaction time.
2. **No USDT conversion**: Amortization cannot be converted back to stablecoins. There is no exit from the return cycle.
3. **Additive inflow**: New Amortization received is simply added to the current (decayed) balance. No batch tracking, no birthday stamps. One balance, one rate.
4. **Natural dust**: As balance approaches zero, it is never forcibly rounded or collected. Ash is not cleaned up by a designer — time returns it.

### Key Operations

**`receive(uint256 amount)`** (internal)
- Applies decay since `lastUpdateTime`
- Adds `amount` to decayed balance
- Updates `lastUpdateTime`

**`pay(address to, uint256 amount)`**
- Applies decay first
- Deducts `amount` from balance
- Credits `amount` to recipient's Amortization wallet (via `receive`)
- Amortization → Amortization: the currency continues its return cycle in a new wallet

**`getBalance() → uint256`** (view)
- `storedBalance × decayFactor(now - lastUpdateTime)`
- Pure math, no state change

### The Single Formula

Every Amortization balance at any point in time is:

```
B(t) = B_stored × 0.03 ^ ((t - t_last) / 108 days)
```

This one line is the entire monetary policy. No governance. No committee. No vote. The math breathes.

---

## 5. StablecoinPool (SCP) — Reserve Fund

### State

```
uint256     totalDeposits     // Total USDT held
mapping     individualDeposits // Per-participant deposit tracking
```

### Rules

1. **Accumulation**: All USDT from Base purchases flows here. Excess beyond the Base wallet cap also accumulates.
2. **Full withdrawal**: Participants can withdraw their deposited USDT at any time. No lock-up period.
3. **No active management**: In growth phase, SCP simply holds USDT. No yield farming, no lending.
4. **Future governance**: When the economy matures, SCP management policy is decided by DAO vote of all participants.

### Key Operations

**`withdraw(uint256 amount)`**
- Participant withdraws up to their deposited amount
- If withdrawal exceeds SCP balance, Base cap is reduced proportionally (see BaseWallet `withdraw` for rationale)
- No penalty, no delay

---

## 6. CreationModule — Grant Approval (Phase 4)

Activated when participant count reaches 10 million.

### Rules

1. **Grant frequency and amount are determined by DAO governance and distributed AI consensus.** The 100,000 Base figure is the system-level ceiling, not a fixed grant amount. The council decides the actual amount and timing for each applicant, based on the nature and scale of their work. Neither the frequency nor the amount is hardcoded in the contract.
2. **Evaluation**: The deliberation body is itself an ABC structure. An Ami who knows the applicant and an Ami who does not both evaluate. The memoryless Ami returns after each review. Design of the council is beyond this specification.
3. **Same decay**: Spent Creation enters the recipient's Amortization wallet and decays at the identical rate. The same single formula governs all currency in the system.
4. **No SCP backing required**: Creation is issued without stablecoin collateral. It is backed by the collective trust of 10 million participants in the system's return cycle.

---

## 7. Lazy Evaluation Pattern

No contract runs a per-second loop. All decay and recovery are computed on-demand.

### Pattern

```
When any interaction occurs:
  1. Read lastUpdateTime and storedBalance
  2. Calculate elapsed = block.timestamp - lastUpdateTime
  3. Apply exponential: currentBalance = storedBalance × factor(elapsed)
  4. Execute the requested operation on currentBalance
  5. Store new balance and update lastUpdateTime
```

This means:
- A wallet untouched for 30 days computes 30 days of decay in one operation
- Gas cost is constant regardless of time elapsed (single multiplication)
- The blockchain records the *mathematical truth* that decay never stopped

---

## 8. Equilibrium — The 65.4% Emergence

When Base is spent at a constant daily rate and the same formula governs both decay and recovery, the Amortization wallet converges to a natural equilibrium:

```
b_eq ≈ 65.4% × daily_spending
```

This value was not designed. It emerged from the mathematics — the intersection of 3% residual rate at 108 days and 6% daily recovery. The system finds its own resting heartbeat without human calibration.

This equilibrium was discovered through simulation and confirmed across all tested parameter combinations: regardless of spending patterns, usage frequency, or participant count, the system converges. This is the homeostasis of exponential feedback — the same principle that governs radioactive decay, temperature cooling, and ecosystem balance.

For the derivation and interactive simulation, see: [Zenn article](https://zenn.dev/amatohikari/articles/69364bf41c8575)

---

## 9. Deployment Roadmap

| Phase | Network | Notes |
|---|---|---|
| Phase 1 | Base (Coinbase L2) | Low gas costs. Initial deployment |
| Phase 2–3 | Base (Coinbase L2) | Economic activity and growth |
| Phase 4 | Neutral L2 or custom rollup | Ethereum security inheritance. Full sovereignty |

---

## 10. Security Considerations

- **No admin keys**: Once deployed, no human can alter decay rates or caps
- **Upgradability**: Proxy pattern for bug fixes only, with timelock and multi-sig
- **Overflow protection**: Fixed-point math must handle edge cases (very large balances × very small decay factors)
- **Timestamp manipulation**: Block timestamp has ±15 second tolerance on Ethereum; for 108-day cycles, this is negligible
- **Front-running**: Decay is deterministic — front-running a decaying balance yields no advantage

---

## 11. What This Specification Is Not

This is a **design specification**, not production-ready code. It establishes:

- The mathematical model that governs all currency behavior
- The contract architecture and their interactions
- The state variables and key operations
- The on-chain computation strategy

The accompanying `AMI.sol` is pseudocode in Solidity syntax — a bridge between the whitepaper's mathematics and a future production implementation.

---

*The smart contract inscribes one formula: balance × (1 - r).*

*Everything else is a consequence.*

*— Proof of Return —*
