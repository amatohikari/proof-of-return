// SPDX-License-Identifier: CC0-1.0
// ============================================================================
// AMI — All Material is Impermanent
// Proof of Return: A Reductive Currency System
//
// PSEUDOCODE — This is not production-ready code.
// It demonstrates how the mathematical model maps to smart contract logic.
//
// The entire monetary policy is one formula: balance × (1 - r)^t
// Everything else is plumbing.
//
// AMATO HIKARI — April 2026
// ============================================================================

pragma solidity ^0.8.20;

// ============================================================================
// DecayMath — The mathematical core
// ============================================================================
//
// All exponential calculations live here.
// Amortization decay, Base recovery, and Torch recovery
// all share this foundation.

library DecayMath {

    // --- Constants (WAD = 10^18 fixed-point precision) ---

    uint256 constant WAD = 1e18;

    // T = 108 days (number of bonnou 煩悩)
    uint256 constant T_DAYS = 108;
    uint256 constant T_SECONDS = 108 * 86400; // 9,331,200 seconds

    // Residual rate at T: 3% (the number of creation)
    // After 108 days, 3% of the original balance remains
    uint256 constant RESIDUAL_RATE = 0.03e18; // 3% in WAD

    // Per-second decay factor: (1 - r_sec) = 0.03^(1/9331200)
    // Precomputed to WAD precision
    uint256 constant DECAY_PER_SECOND = 999999632559212419; // ≈ 1 - 3.674e-7

    // Base/Torch recovery: 6% per day → per-second factor
    // (1 - 0.06)^(1/86400) = 0.94^(1/86400)
    // Precomputed to WAD precision
    uint256 constant RECOVERY_PER_SECOND = 999999284568437644; // ≈ 1 - 7.154e-7

    // Precomputed decay factors for time decomposition
    uint256 constant DECAY_1_HOUR   = 998678448018990000; // (1-r)^3600
    uint256 constant DECAY_1_DAY    = 968261636245430000; // (1-r)^86400  ≈ 96.826%
    uint256 constant DECAY_1_WEEK   = 798718498870790000; // (1-r)^604800 ≈ 79.87%
    uint256 constant DECAY_108_DAYS = 0.03e18;            // By definition: 3%

    // Precomputed recovery factors for time decomposition
    // recovery_factor = 0.94^(t/86400), or equivalently RECOVERY_PER_SECOND^t
    uint256 constant RECOVERY_1_HOUR   = 997427036474230000; // 0.94^(1/24)
    uint256 constant RECOVERY_1_DAY    = 0.94e18;            // By definition: 94%
    uint256 constant RECOVERY_1_WEEK   = 648476516092720000; // 0.94^7

    /// @notice Calculate decay factor for arbitrary elapsed time
    /// @dev Decomposes time into weeks + days + hours + seconds
    ///      and multiplies precomputed factors.
    ///      PSEUDOCODE — production version needs rigorous fixed-point lib
    function decayFactor(uint256 elapsedSeconds) internal pure returns (uint256) {
        if (elapsedSeconds == 0) return WAD; // No time passed, no decay

        uint256 factor = WAD;

        // Decompose into large intervals (gas optimization)
        uint256 weeks = elapsedSeconds / 604800;
        uint256 remaining = elapsedSeconds % 604800;
        uint256 days_ = remaining / 86400;
        remaining = remaining % 86400;
        uint256 hours = remaining / 3600;
        uint256 seconds_ = remaining % 3600;

        // Multiply precomputed factors
        for (uint256 i = 0; i < weeks; i++) {
            factor = (factor * DECAY_1_WEEK) / WAD;
        }
        for (uint256 i = 0; i < days_; i++) {
            factor = (factor * DECAY_1_DAY) / WAD;
        }
        for (uint256 i = 0; i < hours; i++) {
            factor = (factor * DECAY_1_HOUR) / WAD;
        }
        // Remaining seconds: direct exponentiation
        // In production, use exponentiation by squaring
        for (uint256 i = 0; i < seconds_; i++) {
            factor = (factor * DECAY_PER_SECOND) / WAD;
        }

        return factor;
    }

    /// @notice Calculate recovery factor for arbitrary elapsed time
    /// @dev Same decomposition strategy as decayFactor.
    ///      Returns the fraction of deficit that REMAINS after recovery.
    ///      recoveryFactor = 0.94^(elapsedSeconds/86400)
    ///      Mirrors decayFactor — decay and recovery are the same math
    ///      running in opposite directions.
    function recoveryFactor(uint256 elapsedSeconds) internal pure returns (uint256) {
        if (elapsedSeconds == 0) return WAD;

        uint256 factor = WAD;

        uint256 weeks = elapsedSeconds / 604800;
        uint256 remaining = elapsedSeconds % 604800;
        uint256 days_ = remaining / 86400;
        remaining = remaining % 86400;
        uint256 hours = remaining / 3600;
        uint256 seconds_ = remaining % 3600;

        for (uint256 i = 0; i < weeks; i++) {
            factor = (factor * RECOVERY_1_WEEK) / WAD;
        }
        for (uint256 i = 0; i < days_; i++) {
            factor = (factor * RECOVERY_1_DAY) / WAD;
        }
        for (uint256 i = 0; i < hours; i++) {
            factor = (factor * RECOVERY_1_HOUR) / WAD;
        }
        for (uint256 i = 0; i < seconds_; i++) {
            factor = (factor * RECOVERY_PER_SECOND) / WAD;
        }

        return factor;
    }

    /// @notice Calculate recovery over elapsed time (per-second precision)
    /// @dev newBalance = cap - (cap - balance) × recoveryFactor(elapsed)
    ///      Used by both BaseWallet and TorchWallet.
    ///      Continuous recovery mirrors continuous decay.
    ///      No more day-level truncation — 23 hours 59 minutes of recovery
    ///      is correctly calculated, not rounded to zero.
    function recoverBalance(
        uint256 currentBalance,
        uint256 cap,
        uint256 elapsedSeconds
    ) internal pure returns (uint256) {
        if (currentBalance >= cap) return cap;

        uint256 deficit = cap - currentBalance;
        uint256 remainingFraction = recoveryFactor(elapsedSeconds);
        uint256 remainingDeficit = (deficit * remainingFraction) / WAD;

        return cap - remainingDeficit;
    }
}

// ============================================================================
// AmortizationWallet — Where currency returns
// ============================================================================
//
// The heart of AMI. Every unit of currency that enters this wallet
// begins its journey back to zero. Not by force — by nature.
//
// State: just two numbers. Balance and timestamp.
// Logic: just one formula. balance × decayFactor(elapsed).

contract AmortizationWallet {
    using DecayMath for *;

    struct Wallet {
        uint256 balance;         // Balance at lastUpdate (WAD)
        uint256 lastUpdateTime;  // Timestamp of last calculation
    }

    mapping(address => Wallet) public wallets;

    // --- Events ---
    event Received(address indexed to, uint256 amount, uint256 newBalance);
    event Paid(address indexed from, address indexed to, uint256 amount);

    /// @notice Get current balance after applying decay
    /// @dev Pure math — the decay has been happening since lastUpdate,
    ///      we just haven't observed it yet.
    ///      "The balance is not updated when we look at it.
    ///       It was always decaying. We merely confirm what nature already did."
    function getBalance(address owner) public view returns (uint256) {
        Wallet storage w = wallets[owner];
        if (w.balance == 0) return 0;

        uint256 elapsed = block.timestamp - w.lastUpdateTime;
        uint256 factor = DecayMath.decayFactor(elapsed);

        return (w.balance * factor) / DecayMath.WAD;
    }

    /// @notice Apply decay and update stored state
    function _applyDecay(address owner) internal returns (uint256 currentBalance) {
        currentBalance = getBalance(owner);
        wallets[owner].balance = currentBalance;
        wallets[owner].lastUpdateTime = block.timestamp;
    }

    /// @notice Receive Amortization from a Base/Torch/Creation payment
    ///         or another Amortization transfer
    /// @dev New amount is simply added to the decayed balance.
    ///      No batch tracking. No birthday stamps.
    ///      Old money and new money share the same rate.
    ///      "When rain falls into a river, it does not ask
    ///       which drops were there first."
    function _receive(address to, uint256 amount) internal {
        uint256 currentBalance = _applyDecay(to);
        uint256 newBalance = currentBalance + amount;

        wallets[to].balance = newBalance;
        // lastUpdateTime already set by _applyDecay

        emit Received(to, amount, newBalance);
    }

    /// @notice Pay from Amortization wallet to another's Amortization wallet
    /// @dev Amortization → Amortization: the return cycle continues
    function pay(address to, uint256 amount) external {
        uint256 currentBalance = _applyDecay(msg.sender);
        require(currentBalance >= amount, "Insufficient Amortization balance");

        wallets[msg.sender].balance = currentBalance - amount;
        _receive(to, amount);

        emit Paid(msg.sender, to, amount);
    }
}

// ============================================================================
// BaseWallet — Existence guarantee
// ============================================================================
//
// Base does not decay. Existence is not amortized.
// The wallet cap is an absolute ceiling (max 1,000 Base = 1,000 USDT),
// not a monthly allowance. Once set, recovery follows the system's
// exponential function — no monthly reset, no periodic refill.
//
// When spent, Base transforms into Amortization — the currency changes nature
// at the moment of exchange. Like water becoming steam at 100°C.
//
// When converted to Torch, the cap permanently decreases. The USDT backing
// flows to the infrastructure fund. This is the entry to the economy of love.

contract BaseWallet {
    using DecayMath for *;

    uint256 constant MAX_CAP = 1000e18;  // 1,000 Base (WAD) — absolute ceiling

    struct Wallet {
        uint256 balance;         // Current Base balance (WAD)
        uint256 cap;             // Personal cap (= total USDT deposited - cumulative conversions, max 1,000)
        uint256 lastUpdateTime;  // Timestamp of last recovery calculation
    }

    mapping(address => Wallet) public wallets;

    AmortizationWallet public amortizationWallet;
    TorchWallet public torchWallet;
    IgnitionPool public igp;
    StablecoinPool public scp;

    // IERC20 public usdt;  // USDT/USDC token contract

    // --- Events ---
    event Deposited(address indexed user, uint256 baseAmount, uint256 scpAmount);
    event Paid(address indexed from, address indexed to, uint256 amount);
    event Recovered(address indexed user, uint256 oldBalance, uint256 newBalance);
    event Converted(address indexed user, uint256 amount, uint256 newCap);

    /// @notice Get current balance after applying recovery (per-second precision)
    /// @dev Recovery follows: newBal = cap - (cap - bal) × 0.94^(seconds/86400)
    ///      Balance approaches cap asymptotically — never overshoots.
    ///      "Even from zero, something invisible remains.
    ///       The exponential never truly reaches zero — and recovery
    ///       never truly reaches the cap. The same math, mirrored."
    function getBalance(address owner) public view returns (uint256) {
        Wallet storage w = wallets[owner];
        if (w.cap == 0) return 0; // No deposit yet

        uint256 elapsed = block.timestamp - w.lastUpdateTime;
        return DecayMath.recoverBalance(w.balance, w.cap, elapsed);
    }

    /// @notice Apply recovery and update stored state
    function _applyRecovery(address owner) internal returns (uint256 currentBalance) {
        uint256 oldBalance = wallets[owner].balance;
        currentBalance = getBalance(owner);
        wallets[owner].balance = currentBalance;
        wallets[owner].lastUpdateTime = block.timestamp;

        if (currentBalance > oldBalance) {
            emit Recovered(owner, oldBalance, currentBalance);
        }
    }

    /// @notice Deposit USDT, receive Base, excess goes to SCP
    /// @dev The wallet cap is an absolute ceiling, not a monthly limit.
    ///      If cap is already at MAX_CAP, all USDT goes to SCP.
    ///      Recovery is handled by the exponential function, not by periodic refills.
    ///      If cap was previously reduced by Torch conversion, deposit restores it.
    function deposit(uint256 usdtAmount) external {
        Wallet storage w = wallets[msg.sender];

        // Apply recovery before modifying balance
        _applyRecovery(msg.sender);

        // Calculate how much can become Base (wallet cap is absolute ceiling)
        uint256 spaceInWallet = 0;
        if (w.cap < MAX_CAP) {
            spaceInWallet = MAX_CAP - w.cap;
        }
        uint256 toBase = _min(usdtAmount, spaceInWallet);
        uint256 toScp = usdtAmount - toBase;

        // Mint Base
        if (toBase > 0) {
            w.balance += toBase;
            w.cap += toBase;
        }

        // Excess to SCP
        if (toScp > 0) {
            scp.deposit(msg.sender, toScp);
        }

        // Transfer USDT from user (requires prior approval)
        // usdt.transferFrom(msg.sender, address(scp), usdtAmount);

        emit Deposited(msg.sender, toBase, toScp);
    }

    /// @notice Pay with Base — the moment of transformation
    /// @dev Base leaves this wallet and becomes Amortization
    ///      in the recipient's Amortization wallet.
    ///      This is where existence guarantee becomes exchange medium,
    ///      and the return cycle begins.
    function pay(address to, uint256 amount) external {
        uint256 currentBalance = _applyRecovery(msg.sender);
        require(currentBalance >= amount, "Insufficient Base balance");

        wallets[msg.sender].balance = currentBalance - amount;

        // === THE TRANSFORMATION ===
        // Base → Amortization
        // The currency changes nature at this exact moment.
        amortizationWallet._receive(to, amount);

        emit Paid(msg.sender, to, amount);
    }

    /// @notice Convert Base to Torch — entering the economy of love
    /// @dev This is a personal commitment to the AMI economy.
    ///      - Base cap permanently decreases by the converted amount
    ///      - USDT flows from SCP to infrastructure fund
    ///      - Torch is created in the converter's Torch wallet (up to 1,000)
    ///      - IGP equal to 3× the converted amount is created
    ///      - If SCP has excess USDT, SCP is drawn first to preserve Base balance
    ///
    ///      "The first ignition is the author's own. 1,000 USDT to Torch.
    ///       Base cap permanently zero. All existence guarantee released.
    ///       Proof of Return begins with one person's return."
    function convert(uint256 amount) external {
        Wallet storage w = wallets[msg.sender];
        uint256 currentBalance = _applyRecovery(msg.sender);

        // Determine where the USDT comes from
        uint256 userScpExcess = 0;
        uint256 scpBalance = scp.balanceOf(msg.sender);
        if (scpBalance > w.cap) {
            userScpExcess = scpBalance - w.cap;
        }

        if (amount <= userScpExcess) {
            // SCP excess covers the full amount — Base balance is preserved
            scp.transferToInfrastructure(msg.sender, amount);
        } else {
            // Draw from SCP excess first, remainder from Base
            uint256 fromBase = amount - userScpExcess;
            require(currentBalance >= fromBase, "Insufficient balance for conversion");

            if (userScpExcess > 0) {
                scp.transferToInfrastructure(msg.sender, userScpExcess);
            }
            w.balance = currentBalance - fromBase;
        }

        // Permanently reduce Base cap
        w.cap -= amount;

        // Create Torch in converter's wallet (capped at 1,000)
        torchWallet._receiveFromConversion(msg.sender, amount);

        // Create IGP at 3× the converted amount
        igp._receiveFromConversion(msg.sender, amount);

        emit Converted(msg.sender, amount, w.cap);
    }

    /// @notice Withdraw USDT from SCP
    /// @dev When USDT is withdrawn, the backing for Base is reduced.
    ///      Base cap must decrease proportionally — otherwise Base would
    ///      exist without corresponding USDT in the reserve, breaking the
    ///      entry peg's integrity. This is not a penalty; it is conservation.
    ///      You cannot remove the foundation and keep the building.
    function withdraw(uint256 usdtAmount) external {
        Wallet storage w = wallets[msg.sender];
        _applyRecovery(msg.sender);

        // SCP balance is withdrawn first; only if insufficient,
        // the remainder reduces the Base cap
        uint256 userScpBalance = scp.balanceOf(msg.sender);
        uint256 totalContribution = w.cap + userScpBalance;
        require(usdtAmount <= totalContribution, "Exceeds total deposit");

        if (usdtAmount <= userScpBalance) {
            // Enough in SCP — no cap change
            scp.withdraw(msg.sender, usdtAmount);
        } else {
            // Withdraw all SCP first, then reduce cap
            uint256 capReduction = usdtAmount - userScpBalance;
            scp.withdraw(msg.sender, userScpBalance);

            w.cap -= capReduction;
            if (w.balance > w.cap) {
                w.balance = w.cap;
            }

            // Remaining USDT comes from the Base backing
            // usdt.transfer(msg.sender, capReduction);
        }
    }

    // --- Helpers ---

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

// ============================================================================
// TorchWallet — Pay it forward
// ============================================================================
//
// Five wallets, five natures:
//   Base:         does not decay,  recovers         (existence)
//   Torch:        does not decay,  recovers         (pay-it-forward)
//   Creation:     does not decay,  does not recover  (a finite fire)
//   IGP:          does not decay,  does not recover  (propagation fuel)
//   Amortization: decays,          does not recover  (the return cycle)
//
// Torch is the mirror of Base. Same cap (1,000). Same recovery (6%/day).
// The only difference: Torch has no USDT exit. It exists only inside
// the AMI economy — the economy of love.
//
// The vessel for receiving is equal for everyone.
// The vessel for giving (IGP) grows without limit.

contract TorchWallet {
    using DecayMath for *;

    uint256 constant TORCH_CAP = 1000e18; // 1,000 Torch (WAD) — same as Base

    struct Wallet {
        uint256 balance;         // Current Torch balance (WAD)
        uint256 lastUpdateTime;  // Timestamp of last recovery calculation
    }

    mapping(address => Wallet) public wallets;

    AmortizationWallet public amortizationWallet;

    // --- Events ---
    event ReceivedFromConversion(address indexed user, uint256 amount, uint256 newBalance);
    event ReceivedFromIgnition(address indexed user, uint256 amount, uint256 newBalance);
    event Paid(address indexed from, address indexed to, uint256 amount);
    event Recovered(address indexed user, uint256 oldBalance, uint256 newBalance);

    /// @notice Get current balance after applying recovery
    /// @dev Same formula as BaseWallet. Same breath.
    ///      newBal = cap - (cap - bal) × 0.94^(seconds/86400)
    function getBalance(address owner) public view returns (uint256) {
        Wallet storage w = wallets[owner];
        if (w.balance == 0 && w.lastUpdateTime == 0) return 0;

        uint256 elapsed = block.timestamp - w.lastUpdateTime;
        return DecayMath.recoverBalance(w.balance, TORCH_CAP, elapsed);
    }

    /// @notice Apply recovery and update stored state
    function _applyRecovery(address owner) internal returns (uint256 currentBalance) {
        uint256 oldBalance = wallets[owner].balance;
        currentBalance = getBalance(owner);
        wallets[owner].balance = currentBalance;
        wallets[owner].lastUpdateTime = block.timestamp;

        if (currentBalance > oldBalance) {
            emit Recovered(owner, oldBalance, currentBalance);
        }
    }

    /// @notice Receive Torch from Base conversion
    /// @dev Called by BaseWallet.convert(). Capped at 1,000.
    function _receiveFromConversion(address to, uint256 amount) internal {
        uint256 currentBalance = _applyRecovery(to);
        uint256 space = TORCH_CAP > currentBalance ? TORCH_CAP - currentBalance : 0;
        uint256 toAdd = _min(amount, space);

        wallets[to].balance = currentBalance + toAdd;

        emit ReceivedFromConversion(to, toAdd, wallets[to].balance);
    }

    /// @notice Receive Torch from IGP ignition
    /// @dev Called by IgnitionPool.ignite(). Capped at 1,000.
    function _receiveFromIgnition(address to, uint256 amount) internal {
        uint256 currentBalance = _applyRecovery(to);
        uint256 space = TORCH_CAP > currentBalance ? TORCH_CAP - currentBalance : 0;
        uint256 toAdd = _min(amount, space);

        wallets[to].balance = currentBalance + toAdd;

        emit ReceivedFromIgnition(to, toAdd, wallets[to].balance);
    }

    /// @notice Pay with Torch — the fire enters the return cycle
    /// @dev Torch → Amortization. Same transformation as Base → Amortization.
    ///      Torch can be used for ordinary transactions within the AMI economy.
    ///      There is no bridge back to USDT. The fire stays inside.
    function pay(address to, uint256 amount) external {
        uint256 currentBalance = _applyRecovery(msg.sender);
        require(currentBalance >= amount, "Insufficient Torch balance");

        wallets[msg.sender].balance = currentBalance - amount;

        // === THE TRANSFORMATION ===
        // Torch → Amortization
        amortizationWallet._receive(to, amount);

        emit Paid(msg.sender, to, amount);
    }

    // --- Helpers ---

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

// ============================================================================
// IgnitionPool (IGP) — Propagation fuel
// ============================================================================
//
// IGP is not a currency. It is the engine of propagation.
// No decay. No recovery. No cap. No USDT exit.
// It exists solely to ignite Torch in others.
//
// Created at 3× the operation amount — both on conversion and on ignition.
// The fuel for giving always exceeds what was given.
// Where Amortization decay converges toward zero,
// IGP propagation diverges toward the world.
// One breathes in; the other breathes out.

contract IgnitionPool {

    struct Pool {
        uint256 balance; // Current IGP balance (WAD)
    }

    mapping(address => Pool) public pools;

    TorchWallet public torchWallet;

    // --- Events ---
    event CreatedFromConversion(address indexed user, uint256 igpAmount);
    event CreatedFromIgnition(address indexed user, uint256 igpAmount);
    event Ignited(address indexed from, address indexed to, uint256 amount, uint256 torchCreated, uint256 igpCreated);

    /// @notice Receive IGP from Base → Torch conversion (3× multiplier)
    /// @dev Called by BaseWallet.convert()
    function _receiveFromConversion(address user, uint256 torchAmount) internal {
        uint256 igpAmount = torchAmount * 3;
        pools[user].balance += igpAmount;

        emit CreatedFromConversion(user, igpAmount);
    }

    /// @notice Receive IGP from ignition receipt (3× multiplier)
    /// @dev Called by ignite() for the recipient
    function _receiveFromIgnition(address user, uint256 torchAmount) internal {
        uint256 igpAmount = torchAmount * 3;
        pools[user].balance += igpAmount;

        emit CreatedFromIgnition(user, igpAmount);
    }

    /// @notice Ignite Torch in another person's wallet
    /// @dev The fire must travel outward — self-ignition is prohibited.
    ///      - Sender's IGP decreases by the ignited amount
    ///      - Recipient receives Torch (capped at 1,000)
    ///      - Recipient receives IGP at 3× the ignited amount (no cap)
    ///      - No limit on amount or number of recipients
    ///
    ///      "The vessel for receiving is equal for everyone.
    ///       The vessel for giving grows with every act of goodwill."
    function ignite(address to, uint256 amount) external {
        require(to != msg.sender, "Cannot ignite own wallet");
        require(pools[msg.sender].balance >= amount, "Insufficient IGP balance");

        // Deduct from sender's IGP
        pools[msg.sender].balance -= amount;

        // Create Torch in recipient's wallet (capped at 1,000)
        torchWallet._receiveFromIgnition(to, amount);

        // Create IGP at 3× in recipient's pool (no cap)
        _receiveFromIgnition(to, amount);

        emit Ignited(msg.sender, to, amount, amount, amount * 3);
    }

    /// @notice Get IGP balance (simple read — no decay, no recovery)
    function getBalance(address owner) public view returns (uint256) {
        return pools[owner].balance;
    }
}

// ============================================================================
// CreationWallet — The fire that does not recover
// ============================================================================
//
// Creation is granted by the council. It sits in this wallet without decaying
// — the creator uses it when ready, in whatever amounts they need.
// Once spent, it enters the recipient's Amortization wallet
// and begins its return. Once the balance reaches zero, it is gone.
// No refill. No recovery. A matchstick, not a candle.

contract CreationWallet {

    struct Wallet {
        uint256 balance;    // Remaining Creation (WAD). No decay, no recovery.
    }

    mapping(address => Wallet) public wallets;

    AmortizationWallet public amortizationWallet;

    // --- Events ---
    event Granted(address indexed recipient, uint256 amount);
    event Paid(address indexed from, address indexed to, uint256 amount);

    /// @notice Receive Creation from the CreationModule
    /// @dev Simply adds to balance. No timestamp needed —
    ///      Creation does not decay while held.
    function _grant(address to, uint256 amount) internal {
        wallets[to].balance += amount;
        emit Granted(to, amount);
    }

    /// @notice Pay with Creation — the fire leaves the matchstick
    /// @dev Creation leaves this wallet and becomes Amortization
    ///      in the recipient's Amortization wallet.
    ///      Same transformation as Base → Amortization.
    ///      The amount is whatever the creator chooses —
    ///      they spend it piece by piece, as their work requires.
    function pay(address to, uint256 amount) external {
        require(wallets[msg.sender].balance >= amount, "Insufficient Creation balance");

        wallets[msg.sender].balance -= amount;

        // === THE TRANSFORMATION ===
        // Creation → Amortization
        // The fire enters the return cycle.
        amortizationWallet._receive(to, amount);

        emit Paid(msg.sender, to, amount);
    }

    /// @notice Get balance (simple read — no decay calculation needed)
    function getBalance(address owner) public view returns (uint256) {
        return wallets[owner].balance;
    }
}

// ============================================================================
// StablecoinPool (SCP) — Reserve Fund
// ============================================================================
//
// SCP is not a currency. It is the reserve — the anchor to the old world.
// As the AMI economy grows, new deposits flow in naturally.
// No yield farming. No lending. Just holding.
// Future management decided by all participants via DAO vote.
//
// Infrastructure fund: USDT from Torch conversions flows here,
// covering server costs, gas fees, and operational expenses.
// Usage is fully transparent and disclosed on-chain in real time.

contract StablecoinPool {

    mapping(address => uint256) public balanceOf;
    uint256 public totalDeposits;
    uint256 public infrastructureFund; // USDT from Torch conversions

    // --- Events ---
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event InfrastructureFunded(address indexed from, uint256 amount);

    /// @notice Deposit USDT into SCP
    function deposit(address user, uint256 amount) external {
        // In production: only callable by BaseWallet contract
        balanceOf[user] += amount;
        totalDeposits += amount;
        emit Deposited(user, amount);
    }

    /// @notice Withdraw USDT from SCP — no lock, no penalty, no delay
    /// @dev "Participants can withdraw at any time.
    ///       Trust is not built by trapping people inside."
    function withdraw(address user, uint256 amount) external {
        // In production: only callable by BaseWallet contract
        require(balanceOf[user] >= amount, "Exceeds deposited amount");

        balanceOf[user] -= amount;
        totalDeposits -= amount;

        // usdt.transfer(user, amount);

        emit Withdrawn(user, amount);
    }

    /// @notice Transfer USDT from user's SCP to infrastructure fund
    /// @dev Called by BaseWallet.convert() when Base is converted to Torch.
    ///      The USDT backing the converted Base funds the system's operations.
    function transferToInfrastructure(address user, uint256 amount) external {
        // In production: only callable by BaseWallet contract
        require(balanceOf[user] >= amount, "Exceeds deposited amount");

        balanceOf[user] -= amount;
        infrastructureFund += amount;

        emit InfrastructureFunded(user, amount);
    }
}

// ============================================================================
// CreationModule — Phase 4 (10M+ participants)
// ============================================================================
//
// "Creation is not backed by stablecoins.
//  It is backed by 10 million people who believe
//  that what returns can also create."
//
// NOTE: The grant frequency and amount are NOT hardcoded in this contract.
// They are determined by DAO governance and distributed AI consensus.
// MAX_CREATION is the system-level ceiling; the council decides
// the actual amount and timing for each grant.

contract CreationModule {

    uint256 constant MAX_CREATION = 100_000e18;  // System-level ceiling (WAD)
    uint256 constant MIN_PARTICIPANTS = 10_000_000;

    bool public active;

    CreationWallet public creationWallet;

    // --- Events ---
    event CreationGranted(address indexed recipient, uint256 amount);

    /// @notice Activate Creation module when participant threshold is met
    function activate(uint256 currentParticipants) external {
        require(currentParticipants >= MIN_PARTICIPANTS, "Not enough participants");
        active = true;
    }

    /// @notice Grant Creation to an approved applicant
    /// @param amount The approved amount (up to MAX_CREATION).
    ///               Not a fixed value — determined by DAO governance
    ///               and distributed AI consensus (the council).
    /// @dev The deliberation process is itself an ABC structure:
    ///      - An Ami who knows the applicant (memory, context, relationship)
    ///      - An Ami who does not (zero-point judgment, no bias)
    ///      Both evaluate. The memoryless Ami returns after each review.
    ///      This is the council — the ABC recursively embedded within ABC.
    ///
    ///      Torch history as signal: A participant's cumulative Torch activity
    ///      — how many fires they have ignited and how far their chains
    ///      have traveled — is a meaningful signal for the deliberation body.
    ///      The distance of the journey, not the size of the wallet,
    ///      speaks to creative intent.
    ///
    ///      Implementation of the council is beyond this specification.
    ///      The key constraint: spent Creation enters the recipient's
    ///      Amortization wallet and decays at the same rate as everything else.
    function grantCreation(address recipient, uint256 amount) external {
        require(active, "Creation module not active");
        require(amount <= MAX_CREATION, "Exceeds maximum Creation grant");
        // In production: requires council (DAO + distributed AI) approval

        creationWallet._grant(recipient, amount);

        emit CreationGranted(recipient, amount);
    }
}

// ============================================================================
//
// That's it.
//
// One formula: balance × (1 - r)^t
// Two directions: decay (Amortization → 0) and recovery (Base/Torch → cap)
// Five wallets, five natures:
//   Base:         does not decay,  recovers         (existence)
//   Torch:        does not decay,  recovers         (pay-it-forward)
//   Creation:     does not decay,  does not recover  (a finite fire)
//   IGP:          does not decay,  does not recover  (propagation fuel)
//   Amortization: decays,          does not recover  (the return cycle)
//
// Eight contracts. Four currencies. Two exponentials. One principle.
//
// No governance token. No admin key. No committee vote on decay rates.
// The math breathes. The system returns.
//
// "Exchange things that return, with a medium that also returns."
//
// — Proof of Return —
//
// ============================================================================
