# AMI Smart Contract Specification

**Proof of Return — Contract Architecture**

*Version 2.0 — April 2026*

---

## Overview

This document specifies the smart contract architecture for AMI (All Material is Impermanent), a reductive currency system where currency is issued, used, and returned through exponential decay — mirroring the natural cycle of all things.

The entire system is governed by two exponential functions applied across three domains:

- **Amortization decay**: `balance × (1 - r)^elapsed_seconds`
- **Base recovery**: `cap - (cap - balance) × 0.94^(elapsed_seconds / 86400)`
- **Torch recovery**: `cap - (cap - balance) × 0.94^(elapsed_seconds / 86400)`

One decay. Two recoveries. The same mathematics, in three wallets. Exhaling once, inhaling twice.

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
| Torch wallet cap | 1,000 Torch | Same ceiling as Base. Equal vessels |
| Torch daily recovery rate | 6% | Same as Base. Same breath |
| IGP (IgnitionPool) | No cap | Propagation fuel. Grows with every conversion and ignition |
| Creation max grant | Up to 100,000 Base | System-level ceiling. Requires ≥ 10M participants |
| Peg | 1 Base = 1 USDT | Entry peg only |

### On-Chain Exponential Calculation

Solidity has no native floating-point arithmetic. Both decay and recovery are implemented using fixed-point math with the same strategy:

**Approach: Precomputed lookup table + time decomposition**

- Store `factor^n` for key intervals (1 hour, 1 day, 1 week)
- For arbitrary elapsed time, decompose into known intervals and multiply
- Example: 3 days + 2 hours + 47 minutes → `factor_3days × factor_2hours × factor_47min`

This avoids expensive on-chain exponentiation while maintaining precision within acceptable bounds (< 0.01% error). Amortization decay, Base recovery, and Torch recovery all use this same decomposition pattern, ensuring per-second precision throughout.

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
├── TorchWallet.sol         — Pay-it-forward wallet (no decay, recovery, no USDT exit)
├── IgnitionPool.sol        — Torch propagation fuel (no decay, no recovery, no cap)
├── CreationWallet.sol      — Creative support wallet (no decay, no recovery)
├── StablecoinPool.sol      — SCP reserve fund
└── CreationModule.sol      — Grant approval (Phase 4)
```

---

## Five Wallets, Five Natures

| Wallet | Decays? | Recovers? | USDT Exit? | Cap | Nature |
|---|---|---|---|---|---|
| **Base** | No | Yes → 1,000 | Yes | 1,000 | Existence guarantee. The foundation. |
| **Torch** | No | Yes → 1,000 | No | 1,000 | Pay-it-forward fire. Same vessel as Base, but burns only inside the AMI economy. |
| **IGP** | No | No | No | None | Propagation fuel. The power to ignite others. Grows with every act of giving. |
| **Creation** | No | No | No | 100,000 | A finite fire. Once spent, never returns. |
| **Amortization** | Yes | No | No | None | The return cycle. Everything exchanged returns to zero. |

Base and Torch are mirrors. Both recover. Both do not decay. Both have the same 1,000 ceiling. The only difference: Base connects to the existing economy through USDT. Torch exists only in the economy of love.

IGP is the propagation engine. It has no cap, no decay, no recovery. It exists solely to be given away — fuel that multiplies with each act of conversion and ignition.

When Base, Torch, or Creation is spent, it transforms into Amortization in the recipient's wallet. The same single formula governs all decay.

---

## Torch Lifecycle: Conversion → Ignition

Torch operates in two stages:

### Stage 1: Conversion (self)

A participant converts their own Base or SCP into Torch. This is a personal commitment to the AMI economy.

```
Convert 100 Base → 100 Torch (self) + 300 IGP (self)
```

- Base balance decreases by the converted amount
- Base cap permanently decreases by the converted amount
- The corresponding USDT flows from SCP to the infrastructure fund
- Torch is created in the converter's own Torch wallet (up to 1,000 cap)
- IGP equal to 3× the converted amount is created in the converter's IgnitionPool
- If SCP holds excess USDT (deposits beyond Base cap), SCP is drawn first, preserving Base balance

### Stage 2: Ignition (to others)

A participant uses their IGP to ignite Torch in another person's wallet. The fire travels outward.

```
Ignite 100 IGP → 100 Torch (recipient) + 300 IGP (recipient)
```

- Sender's IGP decreases by the ignited amount
- Recipient receives Torch equal to the ignited amount (up to 1,000 Torch cap)
- If recipient's Torch wallet is already at 1,000, no additional Torch is added
- Recipient receives IGP equal to 3× the ignited amount, regardless of Torch cap
- IGP ignition has no limit on amount or number of recipients
- Ignition relay is recorded on the blockchain and publicly viewable

The separation is deliberate: first light your own fire (conversion), then pass it to others (ignition).

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

Returns the fraction of deficit that remains after recovery. Used by Base wallet. Same time-decomposition strategy as `decayFactor`, with per-second precision.

```
factor = 0.94 ^ (elapsedSeconds / 86400)
```

This ensures that 23 hours and 59 minutes of recovery is correctly calculated, not truncated to zero.

**`recoverBalance(uint256 currentBalance, uint256 cap, uint256 elapsedSeconds) → uint256`**

Returns the balance after recovery (used by both Base and Torch):

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
uint256     cap              // Personal cap = deposited USDT amount - cumulative conversions (max 1,000)
uint256     lastUpdateTime   // Timestamp of last recovery calculation
```

### Rules

1. **No decay**: Base inside the wallet does not decay. Existence is not amortized.
2. **Recovery**: Balance recovers toward `cap` via exponential recovery at per-second precision. Calculated lazily at each interaction. Recovery is governed by the system's exponential function — there is no monthly reset or periodic refill.
3. **Cap**: An absolute ceiling set by total USDT deposited, minus cumulative Torch conversions. Maximum = 1,000 Base (= 1,000 USDT). This is not a monthly allowance — once the cap is reached, additional USDT goes to SCP.
4. **Payment**: When Base is spent, it leaves the Base wallet and enters the recipient's Amortization wallet as Amortization. The currency transforms at the moment of exchange.
5. **Torch conversion**: When Base is converted to Torch, the Base cap is permanently reduced by the converted amount. The USDT backing that amount flows to the infrastructure fund. Additional USDT deposits can restore the cap back up to 1,000.

### Key Operations

**`deposit(uint256 usdtAmount)`**
- Converts USDT to Base (1:1 peg)
- Adds to balance (up to cap)
- If wallet cap is already at maximum, all USDT goes to SCP
- No monthly limit — the cap is an absolute ceiling
- If cap was previously reduced by Torch conversion, deposit restores the cap (up to 1,000)

**`pay(address to, uint256 amount)`**
- Triggers recovery calculation first (lazy evaluation)
- Deducts `amount` from sender's Base balance
- Credits `amount` to recipient's Amortization wallet
- Base → Amortization transformation occurs here

**`convert(uint256 amount)`**
- Triggers recovery calculation first
- Deducts `amount` from sender's Base balance
- Permanently reduces sender's Base cap by `amount`
- Routes `amount` USDT from SCP to infrastructure fund
- If sender has excess USDT in SCP (beyond current Base cap), SCP is drawn first, preserving Base balance
- Creates `amount` of Torch in sender's Torch wallet (up to 1,000 Torch cap)
- Creates `amount × 3` of IGP in sender's IgnitionPool
- See TorchWallet and IgnitionPool for details

**`withdraw(uint256 usdtAmount)`**
- Withdraws USDT from SCP first
- If withdrawal exceeds SCP balance, reduces Base cap proportionally
- Rationale: Base cap represents the USDT backing in the reserve. Withdrawing USDT removes that backing, so the cap must decrease to maintain the entry peg's integrity. This is not a penalty — it is conservation. You cannot remove the foundation and keep the building.

**`getBalance() → uint256`** (view)
- Applies pending recovery since `lastUpdateTime` (per-second precision)
- Returns current effective balance
- Does not modify state (read-only)

---

## 3. TorchWallet — Pay It Forward

Each participant has exactly one Torch wallet. The currency of goodwill.

### State

```
address     owner
uint256     balance          // Current Torch balance (WAD)
uint256     cap              // Fixed at 1,000. Same vessel as Base
```

No timestamp needed. Torch does not decay and does not recover.

### Rules

1. **No decay**: Torch does not decay. Received goodwill remains.
2. **No recovery**: Torch does not regenerate. It is created only through conversion and ignition. Once spent, it does not return.
3. **Cap = 1,000**: Fixed ceiling, equal to Base. Every participant has the same vessel for receiving goodwill. The vessel for holding is equal; the vessel for giving (IGP) grows without limit.
4. **No USDT exit**: Torch cannot be converted to stablecoins. It exists only inside the AMI economy. There is no bridge back to the world of hoarding.
5. **Payment**: Torch can be used for ordinary transactions. When spent, it enters the recipient's Amortization wallet as Amortization. Same transformation as Base → Amortization.
6. **Overflow**: If an ignition would push the recipient's Torch balance above 1,000, the Torch balance is capped at 1,000. The excess does not create additional Torch. The IGP multiplier (3×) is always applied to the full ignited amount regardless of Torch overflow.

### Key Operations

**`receiveFromConversion(uint256 amount)`** (internal)
- Adds `amount` to balance (capped at 1,000)

**`receiveFromIgnition(uint256 amount)`** (internal)
- Adds `amount` to balance (capped at 1,000)

**`pay(address to, uint256 amount)`**
- Deducts `amount` from Torch balance
- Credits `amount` to recipient's Amortization wallet
- Torch → Amortization transformation occurs here

**`getBalance() → uint256`** (view)
- Simple read. No calculation needed.

### The Equal Vessel

In v1.0, the Torch cap grew with cumulative receipts — the more goodwill you received, the larger your vessel. In v2.0, the vessel is fixed at 1,000 for everyone, and Torch neither decays nor recovers. Received goodwill simply remains. What grows is the power to give: IGP. The vessel for holding is equal; the capacity for propagation is proportional to the goodwill received. Accumulation of holding capacity was, in a different guise, still accumulation. IGP accumulates too, but it has no value unless given away.

### The Reverse Cantillon

In the existing economy, those closest to the faucet benefit first. In AMI, those with the most wealth can convert the most Base to Torch — and the USDT backing those conversions funds the system's infrastructure. Wealth does not accumulate at the center; it becomes fire at the periphery.

The faucet is inverted. The more you have, the more you can give. The more you give, the more the system breathes.

---

## 4. IgnitionPool — Propagation Fuel

Each participant has exactly one IgnitionPool. The engine of propagation.

### State

```
address     owner
uint256     balance          // Current IGP balance (WAD)
```

No timestamp needed. IGP does not decay and does not recover.

### Rules

1. **No decay**: IGP does not diminish over time.
2. **No recovery**: IGP does not regenerate. It is created only through conversion and ignition receipt.
3. **No cap**: IGP has no upper limit. The more goodwill flows through a participant, the more propagation fuel they accumulate.
4. **No USDT exit**: IGP cannot be converted to stablecoins or to Base.
5. **No payment**: IGP cannot be used for ordinary transactions. It exists solely to ignite Torch in others.
6. **Self-ignition prohibited**: A participant cannot ignite their own Torch wallet with IGP.
7. **Creation**: IGP is created in two ways:
   - **Conversion**: When a participant converts Base/SCP to Torch, they receive 3× the converted amount as IGP
   - **Ignition receipt**: When a participant receives Torch via ignition, they receive 3× the ignited amount as IGP

### Key Operations

**`receiveFromConversion(uint256 torchAmount)`** (internal)
- Adds `torchAmount × 3` to IGP balance

**`receiveFromIgnition(uint256 torchAmount)`** (internal)
- Adds `torchAmount × 3` to IGP balance

**`ignite(address to, uint256 amount)`**
- Deducts `amount` from sender's IGP balance
- Creates `amount` of Torch in recipient's Torch wallet (capped at 1,000)
- Creates `amount × 3` of IGP in recipient's IgnitionPool
- No limit on amount or number of recipients
- Reverts if `to == msg.sender` (fire must travel outward)
- Ignition is recorded on-chain: sender, recipient, amount, timestamp

**`getBalance() → uint256`** (view)
- Simple read. No calculation needed.

### The 3× Multiplier

Every act of giving multiplies propagation fuel by three. Convert 100 Base → receive 300 IGP. Ignite 100 IGP to someone → they receive 300 IGP. The fuel for giving always exceeds what was given. This ensures that propagation accelerates rather than attenuates.

Where Amortization decay converges toward zero, IGP propagation diverges toward the world. One breathes in; the other breathes out.

---

## 5. CreationWallet — The Finite Fire

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

## 6. AmortizationWallet — Exponential Decay

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

## 7. StablecoinPool (SCP) — Reserve Fund

### State

```
uint256     totalDeposits       // Total USDT held
uint256     infrastructureFund  // USDT allocated from Torch conversions
mapping     individualDeposits  // Per-participant deposit tracking
```

### Rules

1. **Accumulation**: All USDT from Base purchases flows here. Excess beyond the Base wallet cap also accumulates.
2. **Full withdrawal**: Participants can withdraw their deposited USDT at any time. No lock-up period.
3. **No active management**: In growth phase, SCP simply holds USDT. No yield farming, no lending.
4. **Future governance**: When the economy matures, SCP management policy is decided by DAO vote of all participants.
5. **Infrastructure fund**: USDT from Torch conversions is routed to the infrastructure fund within SCP. This fund covers server costs, gas fees, and operational expenses. Usage is fully transparent and disclosed on-chain in real time.

### Key Operations

**`withdraw(uint256 amount)`**
- Participant withdraws up to their deposited amount
- If withdrawal exceeds SCP balance, Base cap is reduced proportionally (see BaseWallet `withdraw` for rationale)
- No penalty, no delay

---

## 8. CreationModule — Grant Approval (Phase 4)

Activated when participant count reaches 10 million.

### Rules

1. **Grant frequency and amount are determined by DAO governance and distributed AI consensus.** The 100,000 Base figure is the system-level ceiling, not a fixed grant amount. The council decides the actual amount and timing for each applicant, based on the nature and scale of their work. Neither the frequency nor the amount is hardcoded in the contract.
2. **Evaluation**: The deliberation body is itself an ABC structure. An Ami who knows the applicant and an Ami who does not both evaluate. The memoryless Ami returns after each review. Design of the council is beyond this specification.
3. **Same decay**: Spent Creation enters the recipient's Amortization wallet and decays at the identical rate. The same single formula governs all currency in the system.
4. **No SCP backing required**: Creation is issued without stablecoin collateral. It is backed by the collective trust of 10 million participants in the system's return cycle.
5. **Torch history as signal**: A participant's cumulative Torch activity — how many fires they have ignited and how far their chains have traveled — is a meaningful signal for the deliberation body. The distance of the journey, not the size of the wallet, speaks to creative intent.

---

## 9. Lazy Evaluation Pattern

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
- A wallet untouched for 30 days computes 30 days of decay/recovery in one operation
- Gas cost is constant regardless of time elapsed (single multiplication)
- The blockchain records the *mathematical truth* that decay and recovery never stopped

---

## 10. Equilibrium — The 65.4% Emergence

When Base is spent at a constant daily rate and the same formula governs both decay and recovery, the Amortization wallet converges to a natural equilibrium:

```
b_eq ≈ 65.4% × daily_spending
```

This value was not designed. It emerged from the mathematics — the intersection of 3% residual rate at 108 days and 6% daily recovery. The system finds its own resting heartbeat without human calibration.

This equilibrium was discovered through simulation and confirmed across all tested parameter combinations: regardless of spending patterns, usage frequency, or participant count, the system converges. This is the homeostasis of exponential feedback — the same principle that governs radioactive decay, temperature cooling, and ecosystem balance.

For the derivation and interactive simulation, see: [Zenn article](https://zenn.dev/amatohikari/articles/69364bf41c8575)

---

## 11. Torch Propagation — The 3× Multiplier

A single conversion produces exponential propagation through IGP:

```
Alice converts 100 Base → 100 Torch (Alice) + 300 IGP (Alice)
Alice ignites 100 IGP to Bob → 100 Torch (Bob) + 300 IGP (Bob)
Alice ignites 100 IGP to Carol → 100 Torch (Carol) + 300 IGP (Carol)
Alice ignites 100 IGP to Dave → 100 Torch (Dave) + 300 IGP (Dave)
Bob ignites 100 IGP to 3 people → each gets 100 Torch + 300 IGP
...
```

Each generation multiplies IGP by 3. There is no limit on the number of recipients per participant — only the IGP balance constrains propagation.

At full propagation (each recipient ignites their full IGP to 3 others):

| Generation | New Participants | Cumulative |
|---|---|---|
| 0 (conversion) | 1 | 1 |
| 1 | 3 | 4 |
| 2 | 9 | 13 |
| 3 | 27 | 40 |
| 5 | 243 | 364 |
| 10 | 59,049 | 88,573 |
| 14 | 4,782,969 | 7,174,453 |
| 15 | 14,348,907 | 21,523,360 |

This is the inverse of Amortization decay. Where decay converges toward zero, Torch propagation diverges toward the world. One breathes in; the other breathes out.

---

## 12. Deployment Roadmap

| Phase | Network | Notes |
|---|---|---|
| Phase 1 | Base (Coinbase L2) | Low gas costs. Initial deployment |
| Phase 2–3 | Base (Coinbase L2) | Economic activity, Torch propagation, and growth |
| Phase 4 | Neutral L2 or custom rollup | Ethereum security inheritance. Full sovereignty |

---

## 13. Security Considerations

- **No admin keys**: Once deployed, no human can alter decay rates, recovery rates, or caps
- **Upgradability**: Proxy pattern for bug fixes only, with timelock and multi-sig
- **Overflow protection**: Fixed-point math must handle edge cases (very large balances × very small decay factors)
- **Timestamp manipulation**: Block timestamp has ±15 second tolerance on Ethereum; for 108-day cycles, this is negligible
- **Front-running**: Decay is deterministic — front-running a decaying balance yields no advantage
- **IGP sybil resistance**: Creating fake recipients to multiply IGP does not generate real economic value. Each ignition creates Torch (capped at 1,000 per person) and IGP (which can only be given away). The converter's Base cap still decreases, and the USDT still flows to infrastructure. Sybil attacks fragment propagation without concentrating value
- **Torch self-ignition prohibited**: A participant cannot ignite their own Torch wallet with IGP. The fire must travel outward
- **IGP self-ignition prohibited**: A participant cannot ignite IGP to themselves

---

## 14. What This Specification Is Not

This is a **design specification**, not production-ready code. It establishes:

- The mathematical model that governs all currency behavior
- The contract architecture and their interactions
- The state variables and key operations
- The on-chain computation strategy
- The Torch propagation model via IGP and its economic implications

The accompanying `AMI.sol` is pseudocode in Solidity syntax — a bridge between the whitepaper's mathematics and a future production implementation.

---

*The smart contract inscribes one formula: balance × (1 - r).*

*Two recoveries mirror it: cap - (cap - balance) × factor.*

*Everything else is a consequence.*

*— Proof of Return —*
