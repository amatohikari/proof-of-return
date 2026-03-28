import { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const T_DAYS = 108;
const RESIDUAL_RATE = 0.03;
const DAILY_RETENTION = Math.pow(RESIDUAL_RATE, 1 / T_DAYS);
const MONTHLY_RETENTION = Math.pow(DAILY_RETENTION, 30);

export default function ChallengeSimulation() {
  const [participants, setParticipants] = useState(10_000_000);
  const [monthlyBase, setMonthlyBase] = useState(1000);
  const [baseUsageRate, setBaseUsageRate] = useState(70);
  const [baseVelocity, setBaseVelocity] = useState(3);
  const [creationAmount, setCreationAmount] = useState(100_000);
  const [creationUsageRate, setCreationUsageRate] = useState(50);
  const [creationVelocity, setCreationVelocity] = useState(2);
  const [months, setMonths] = useState(36);

  const sim = useMemo(() => {
    const data = [];
    let baseCirculating = 0;
    let creationCirculating = 0;

    // Creation: 1,000万人達成後、参加者のX%が申請する
    // → 月あたり: participants × rate/100 / 12 人が使う
    const creationUsersPerMonth = participants * (creationUsageRate / 100) / 12;
    const monthlyCreationIssued = creationUsersPerMonth * creationAmount;

    // Base monthly
    const baseEffectiveRefill = baseUsageRate < 90 ? monthlyBase : monthlyBase * (1 - baseUsageRate / 100) * 10;
    const monthlyBaseSpent = participants * baseEffectiveRefill * (baseUsageRate / 100);

    for (let m = 0; m <= months; m++) {
      // Decay existing
      baseCirculating = baseCirculating * MONTHLY_RETENTION;
      creationCirculating = creationCirculating * MONTHLY_RETENTION;

      // New issuance
      baseCirculating += monthlyBaseSpent;
      creationCirculating += monthlyCreationIssued;

      const baseTxVolume = monthlyBaseSpent * baseVelocity;
      const creationTxVolume = monthlyCreationIssued * creationVelocity;
      const totalTxVolume = baseTxVolume + creationTxVolume;

      const baseDecay = baseCirculating * (1 - MONTHLY_RETENTION);
      const creationDecay = creationCirculating * (1 - MONTHLY_RETENTION);

      data.push({
        month: m,
        baseCirc: Math.round(baseCirculating),
        creationCirc: Math.round(creationCirculating),
        totalCirc: Math.round(baseCirculating + creationCirculating),
        baseTx: Math.round(baseTxVolume),
        creationTx: Math.round(creationTxVolume),
        totalTx: Math.round(totalTxVolume),
        baseDecay: Math.round(baseDecay),
        creationDecay: Math.round(creationDecay),
        // for chart (billions)
        baseCircB: baseCirculating / 1e9,
        creationCircB: creationCirculating / 1e9,
        baseTxB: baseTxVolume / 1e9,
        creationTxB: creationTxVolume / 1e9,
      });
    }
    return data;
  }, [participants, monthlyBase, baseUsageRate, baseVelocity, creationAmount, creationUsageRate, creationVelocity, months]);

  const steady = sim[sim.length - 1];

  // Steady state calculations
  const baseEffRefill = baseUsageRate < 90 ? monthlyBase : monthlyBase * (1 - baseUsageRate / 100) * 10;
  const monthlyBaseSpent = participants * baseEffRefill * (baseUsageRate / 100);
  const baseSteady = monthlyBaseSpent / (1 - MONTHLY_RETENTION);

  const creationUsersPerMonth = participants * (creationUsageRate / 100) / 12;
  const monthlyCreationIssued = creationUsersPerMonth * creationAmount;
  const creationSteady = monthlyCreationIssued / (1 - MONTHLY_RETENTION);

  const creationRatio = creationSteady / (baseSteady + creationSteady) * 100;

  const fmt = (n) => {
    if (n >= 1e12) return (n / 1e12).toFixed(2) + "兆";
    if (n >= 1e8) return (n / 1e8).toFixed(1) + "億";
    if (n >= 1e4) return (n / 1e4).toFixed(0) + "万";
    return n.toLocaleString();
  };

  const fmtUSD = (n) => {
    if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
    return "$" + n.toLocaleString();
  };

  return (
    <div style={{
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "var(--text-primary, #e0e0e0)",
      padding: "24px",
      maxWidth: 940,
      margin: "0 auto",
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        Base + Creation 統合経済圏シミュレーション
      </h2>
      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 20 }}>
        指数減衰モデル｜T = {T_DAYS}日｜残存率 {RESIDUAL_RATE * 100}%｜全通貨に同一式適用
      </p>

      {/* Controls */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 12,
        background: "var(--bg-secondary, rgba(255,255,255,0.05))",
        borderRadius: 12,
        padding: 16,
      }}>
        <div style={{ gridColumn: "1 / -1", fontSize: 13, fontWeight: 600, opacity: 0.8, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 6 }}>
          共通パラメータ
        </div>
        <div>
          <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>参加者数</label>
          <input type="range" min={1_000_000} max={50_000_000} step={1_000_000}
            value={participants} onChange={e => setParticipants(Number(e.target.value))}
            style={{ width: "100%" }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{fmt(participants)}人</span>
        </div>
        <div>
          <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>シミュレーション期間</label>
          <input type="range" min={12} max={60} step={6}
            value={months} onChange={e => setMonths(Number(e.target.value))}
            style={{ width: "100%" }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{months}ヶ月</span>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 24,
      }}>
        {/* Base controls */}
        <div style={{
          background: "rgba(77,171,247,0.08)",
          border: "1px solid rgba(77,171,247,0.15)",
          borderRadius: 12, padding: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#4dabf7", marginBottom: 10 }}>
            Base通貨（存在保障）
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, opacity: 0.7 }}>月額発行</label>
            <input type="range" min={500} max={2000} step={100}
              value={monthlyBase} onChange={e => setMonthlyBase(Number(e.target.value))}
              style={{ width: "100%" }} />
            <span style={{ fontSize: 13 }}>{monthlyBase} Base/人</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, opacity: 0.7 }}>使用率</label>
            <input type="range" min={10} max={95} step={5}
              value={baseUsageRate} onChange={e => setBaseUsageRate(Number(e.target.value))}
              style={{ width: "100%" }} />
            <span style={{ fontSize: 13 }}>{baseUsageRate}%</span>
          </div>
          <div>
            <label style={{ fontSize: 11, opacity: 0.7 }}>回転率</label>
            <input type="range" min={1} max={10} step={0.5}
              value={baseVelocity} onChange={e => setBaseVelocity(Number(e.target.value))}
              style={{ width: "100%" }} />
            <span style={{ fontSize: 13 }}>{baseVelocity}回</span>
          </div>
        </div>

        {/* Creation controls */}
        <div style={{
          background: "rgba(190,75,219,0.08)",
          border: "1px solid rgba(190,75,219,0.15)",
          borderRadius: 12, padding: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#be4bdb", marginBottom: 10 }}>
            Creation通貨（創造）
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, opacity: 0.7 }}>1回の使用額</label>
            <input type="range" min={10000} max={500000} step={10000}
              value={creationAmount} onChange={e => setCreationAmount(Number(e.target.value))}
              style={{ width: "100%" }} />
            <span style={{ fontSize: 13 }}>{fmt(creationAmount)} USDT</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, opacity: 0.7 }}>年間参加者率</label>
            <input type="range" min={5} max={80} step={5}
              value={creationUsageRate} onChange={e => setCreationUsageRate(Number(e.target.value))}
              style={{ width: "100%" }} />
            <span style={{ fontSize: 13 }}>{creationUsageRate}%（年1回）</span>
          </div>
          <div>
            <label style={{ fontSize: 11, opacity: 0.7 }}>回転率</label>
            <input type="range" min={1} max={10} step={0.5}
              value={creationVelocity} onChange={e => setCreationVelocity(Number(e.target.value))}
              style={{ width: "100%" }} />
            <span style={{ fontSize: 13 }}>{creationVelocity}回</span>
          </div>
        </div>
      </div>

      {/* Key metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 10,
        marginBottom: 20,
      }}>
        <div style={{
          background: "rgba(77,171,247,0.1)",
          border: "1px solid rgba(77,171,247,0.2)",
          borderRadius: 10, padding: 12,
        }}>
          <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>Base 定常流通量</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#4dabf7" }}>{fmt(Math.round(baseSteady))}</div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>≈ {fmtUSD(Math.round(baseSteady))}</div>
        </div>
        <div style={{
          background: "rgba(190,75,219,0.1)",
          border: "1px solid rgba(190,75,219,0.2)",
          borderRadius: 10, padding: 12,
        }}>
          <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>Creation 定常流通量</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#be4bdb" }}>{fmt(Math.round(creationSteady))}</div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>≈ {fmtUSD(Math.round(creationSteady))}</div>
        </div>
        <div style={{
          background: "rgba(255,169,77,0.1)",
          border: "1px solid rgba(255,169,77,0.2)",
          borderRadius: 10, padding: 12,
        }}>
          <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>月間総取引量</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#ffa94d" }}>{fmt(steady.totalTx)}</div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>年 ≈ {fmtUSD(steady.totalTx * 12)}</div>
        </div>
        <div style={{
          background: "rgba(130,201,30,0.1)",
          border: "1px solid rgba(130,201,30,0.2)",
          borderRadius: 10, padding: 12,
        }}>
          <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>Creation比率</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#82c91e" }}>{creationRatio.toFixed(1)}%</div>
          <div style={{ fontSize: 10, opacity: 0.5 }}>経済圏に占める割合</div>
        </div>
      </div>

      {/* Chart 1: Circulating supply */}
      <div style={{
        background: "var(--bg-secondary, rgba(255,255,255,0.03))",
        borderRadius: 12,
        padding: "16px 8px 8px 8px",
        marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, paddingLeft: 12 }}>
          流通量の推移（十億 USDT相当）
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={sim.map(d => ({
            month: d.month,
            base: d.baseCirc / 1e9,
            challenge: d.creationCirc / 1e9,
          }))} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="month" tick={{ fill: "#888", fontSize: 11 }} stroke="rgba(255,255,255,0.15)"
              label={{ value: "月", position: "insideBottomRight", offset: -5, style: { fill: "#aaa", fontSize: 12 } }} />
            <YAxis tick={{ fill: "#888", fontSize: 11 }} stroke="rgba(255,255,255,0.15)" />
            <Tooltip
              contentStyle={{ background: "rgba(20,20,30,0.95)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }}
              formatter={(v, name) => {
                const l = { base: "Base", challenge: "Creation" };
                return [`${v.toFixed(2)}B`, l[name]];
              }}
              labelFormatter={v => `${v}ヶ月目`}
            />
            <Legend formatter={v => v === "base" ? "Base（存在保障）" : "Creation（創造）"} />
            <Area type="monotone" dataKey="base" stackId="1" stroke="#4dabf7" fill="rgba(77,171,247,0.25)" strokeWidth={2} />
            <Area type="monotone" dataKey="challenge" stackId="1" stroke="#be4bdb" fill="rgba(190,75,219,0.25)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Transaction volume */}
      <div style={{
        background: "var(--bg-secondary, rgba(255,255,255,0.03))",
        borderRadius: 12,
        padding: "16px 8px 8px 8px",
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, paddingLeft: 12 }}>
          月間取引量の推移（十億 USDT相当）
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={sim.map(d => ({
            month: d.month,
            base: d.baseTx / 1e9,
            challenge: d.creationTx / 1e9,
          }))} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="month" tick={{ fill: "#888", fontSize: 11 }} stroke="rgba(255,255,255,0.15)"
              label={{ value: "月", position: "insideBottomRight", offset: -5, style: { fill: "#aaa", fontSize: 12 } }} />
            <YAxis tick={{ fill: "#888", fontSize: 11 }} stroke="rgba(255,255,255,0.15)" />
            <Tooltip
              contentStyle={{ background: "rgba(20,20,30,0.95)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }}
              formatter={(v, name) => {
                const l = { base: "Base取引", challenge: "Creation取引" };
                return [`${v.toFixed(2)}B`, l[name]];
              }}
              labelFormatter={v => `${v}ヶ月目`}
            />
            <Legend formatter={v => v === "base" ? "Base取引量" : "Creation取引量"} />
            <Area type="monotone" dataKey="base" stackId="1" stroke="#4dabf7" fill="rgba(77,171,247,0.2)" strokeWidth={2} />
            <Area type="monotone" dataKey="challenge" stackId="1" stroke="#be4bdb" fill="rgba(190,75,219,0.2)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Insight */}
      <div style={{
        background: "var(--bg-secondary, rgba(255,255,255,0.04))",
        borderRadius: 10,
        padding: 16,
        fontSize: 13,
        lineHeight: 1.7,
        borderLeft: "3px solid rgba(190,75,219,0.5)",
      }}>
        <strong style={{ color: "rgba(190,75,219,0.9)" }}>同じ式、同じ均衡</strong>
        <div style={{ marginTop: 8 }}>
          Creation通貨もBase通貨も、同じ指数減衰 <code>残高 × (1-r)</code> で償却される。
          金額が100倍でも、使用頻度が年1回でも、系は同じ速度で定常状態に収束する。
        </div>
        <div style={{ marginTop: 4 }}>
          <strong>一本の式が、経済圏全体を支配している。</strong>
        </div>
      </div>
    </div>
  );
}
