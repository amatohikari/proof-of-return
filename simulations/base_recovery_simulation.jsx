import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

export default function BaseRecoverySimulation() {
  const [depositAmt, setDepositAmt] = useState(1000);
  const [recoveryRatePct, setRecoveryRatePct] = useState(6);
  const [spendDay1, setSpendDay1] = useState(1);
  const [spendAmount1, setSpendAmount1] = useState(800);
  const [spendDay2, setSpendDay2] = useState(30);
  const [spendAmount2, setSpendAmount2] = useState(600);
  const [enableSpend2, setEnableSpend2] = useState(false);
  const [spendDay3, setSpendDay3] = useState(15);
  const [spendAmount3, setSpendAmount3] = useState(1000);
  const [enableSpend3, setEnableSpend3] = useState(false);
  const [days, setDays] = useState(90);

  const recoveryRate = recoveryRatePct / 100;

  const data = useMemo(() => {
    const points = [];
    let balance = depositAmt;

    for (let day = 0; day <= days; day++) {
      // Apply spending events
      if (day === spendDay1) {
        balance = Math.max(0, balance - spendAmount1);
      }
      if (enableSpend2 && day === spendDay2) {
        balance = Math.max(0, balance - spendAmount2);
      }
      if (enableSpend3 && day === spendDay3) {
        balance = Math.max(0, balance - spendAmount3);
      }

      points.push({
        day,
        balance: Math.round(balance * 100) / 100,
        deficit: Math.round((depositAmt - balance) * 100) / 100,
      });

      // Apply daily recovery (end of day)
      const dailyRecovery = (depositAmt - balance) * recoveryRate;
      balance = Math.min(depositAmt, balance + dailyRecovery);
    }
    return points;
  }, [depositAmt, recoveryRatePct, spendDay1, spendAmount1, spendDay2, spendAmount2, enableSpend2, spendDay3, spendAmount3, enableSpend3, days]);

  // Calculate 90% recovery time
  const recoveryTo90 = useMemo(() => {
    // After spending spendAmount1 from depositAmt
    const afterSpend = depositAmt - spendAmount1;
    const target = depositAmt * 0.9;
    if (afterSpend >= target) return 0;
    // (1000 - balance) decreases by factor (1 - r) each day
    // deficit(t) = deficit(0) * (1-r)^t
    // We want deficit(t) = 100 (10% of 1000)
    const deficit0 = depositAmt - afterSpend;
    const targetDeficit = depositAmt - target;
    const t = Math.log(targetDeficit / deficit0) / Math.log(1 - recoveryRate);
    return Math.ceil(t);
  }, [depositAmt, spendAmount1, recoveryRate]);

  // Calculate recovery from zero
  const recoveryFromZeroTo90 = useMemo(() => {
    const deficit0 = depositAmt;
    const targetDeficit = depositAmt * 0.1;
    const t = Math.log(targetDeficit / deficit0) / Math.log(1 - recoveryRate);
    return Math.ceil(t);
  }, [depositAmt, recoveryRate]);

  return (
    <div style={{
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "var(--text-primary, #e0e0e0)",
      padding: "24px",
      maxWidth: 940,
      margin: "0 auto",
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        Baseウォレット 指数回復シミュレーション
      </h2>
      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 20 }}>
        回復量 = (入金額 - 現在残高) × 6%/日 ｜ Base上限 = 入金額
      </p>

      {/* Controls */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        marginBottom: 24,
        background: "var(--bg-secondary, rgba(255,255,255,0.05))",
        borderRadius: 12,
        padding: 16,
      }}>
        {/* 入金額スライダー */}
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>
            入金額（SCP預入・Base上限）
          </label>
          <input type="range" min={100} max={1000} step={100}
            value={depositAmt} onChange={e => setDepositAmt(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#64b5f6" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#64b5f6" }}>{depositAmt} USDT</span>
        </div>
        <div>
          <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>
            日次回復率（固定値：6%）
          </label>
          <input type="range" min={1} max={20} step={0.5}
            value={recoveryRatePct} onChange={e => setRecoveryRatePct(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#64b5f6" }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{recoveryRatePct}%</span>
        </div>
        <div>
          <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>
            シミュレーション期間
          </label>
          <input type="range" min={30} max={180} step={10}
            value={days} onChange={e => setDays(Number(e.target.value))}
            style={{ width: "100%" }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{days}日</span>
        </div>

        {/* Spend event 1 */}
        <div style={{
          gridColumn: "1 / -1",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          paddingTop: 12,
          marginTop: 4,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8, marginBottom: 8 }}>支出イベント</div>
        </div>
        <div>
          <label style={{ fontSize: 11, opacity: 0.7 }}>支出①：日目</label>
          <input type="range" min={1} max={days - 1} value={spendDay1}
            onChange={e => setSpendDay1(Number(e.target.value))}
            style={{ width: "100%" }} />
          <span style={{ fontSize: 13 }}>{spendDay1}日目に</span>
        </div>
        <div>
          <label style={{ fontSize: 11, opacity: 0.7 }}>支出①：金額</label>
          <input type="range" min={100} max={1000} step={50} value={spendAmount1}
            onChange={e => setSpendAmount1(Number(e.target.value))}
            style={{ width: "100%" }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{spendAmount1} Base 使用</span>
        </div>

        <div>
          <label style={{ fontSize: 11, opacity: 0.7 }}>支出②</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="range" min={1} max={days - 1} value={spendDay2}
              onChange={e => setSpendDay2(Number(e.target.value))}
              style={{ flex: 1, opacity: enableSpend2 ? 1 : 0.3 }}
              disabled={!enableSpend2} />
            <span style={{ fontSize: 13, opacity: enableSpend2 ? 1 : 0.3 }}>{spendDay2}日目</span>
            <button onClick={() => setEnableSpend2(!enableSpend2)} style={{
              padding: "2px 10px", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: enableSpend2 ? "rgba(77,171,247,0.2)" : "transparent",
              color: "inherit", cursor: "pointer", fontSize: 12,
            }}>{enableSpend2 ? "ON" : "OFF"}</button>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, opacity: 0.7 }}>支出②：金額</label>
          <input type="range" min={100} max={1000} step={50} value={spendAmount2}
            onChange={e => setSpendAmount2(Number(e.target.value))}
            style={{ width: "100%", opacity: enableSpend2 ? 1 : 0.3 }}
            disabled={!enableSpend2} />
          <span style={{ fontSize: 13, opacity: enableSpend2 ? 1 : 0.3 }}>{spendAmount2} Base</span>
        </div>

        <div>
          <label style={{ fontSize: 11, opacity: 0.7 }}>支出③（全損テスト）</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="range" min={1} max={days - 1} value={spendDay3}
              onChange={e => setSpendDay3(Number(e.target.value))}
              style={{ flex: 1, opacity: enableSpend3 ? 1 : 0.3 }}
              disabled={!enableSpend3} />
            <span style={{ fontSize: 13, opacity: enableSpend3 ? 1 : 0.3 }}>{spendDay3}日目</span>
            <button onClick={() => setEnableSpend3(!enableSpend3)} style={{
              padding: "2px 10px", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: enableSpend3 ? "rgba(255,107,107,0.2)" : "transparent",
              color: "inherit", cursor: "pointer", fontSize: 12,
            }}>{enableSpend3 ? "ON" : "OFF"}</button>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, opacity: 0.7 }}>支出③：金額</label>
          <input type="range" min={100} max={1000} step={50} value={spendAmount3}
            onChange={e => setSpendAmount3(Number(e.target.value))}
            style={{ width: "100%", opacity: enableSpend3 ? 1 : 0.3 }}
            disabled={!enableSpend3} />
          <span style={{ fontSize: 13, opacity: enableSpend3 ? 1 : 0.3, color: spendAmount3 >= depositAmt ? "#ff6b6b" : "inherit" }}>
            {spendAmount3} Base {spendAmount3 >= depositAmt ? "（全損）" : ""}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{
        background: "var(--bg-secondary, rgba(255,255,255,0.03))",
        borderRadius: 12,
        padding: "16px 8px 8px 8px",
        marginBottom: 20,
      }}>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="day" tick={{ fill: "#888", fontSize: 11 }} stroke="rgba(255,255,255,0.15)"
              label={{ value: "日数", position: "insideBottomRight", offset: -5, style: { fill: "#aaa", fontSize: 12 } }} />
            <YAxis domain={[0, depositAmt + 50]} tick={{ fill: "#888", fontSize: 11 }} stroke="rgba(255,255,255,0.15)"
              label={{ value: "Base", angle: -90, position: "insideLeft", offset: 5, style: { fill: "#aaa", fontSize: 12 } }} />
            <Tooltip
              contentStyle={{ background: "rgba(20,20,30,0.95)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 12 }}
              formatter={(v, name) => {
                const l = { balance: "Baseウォレット残高", deficit: "不足分" };
                return [`${v} Base`, l[name] || name];
              }}
              labelFormatter={v => `${v}日目`}
            />
            <Legend formatter={v => v === "balance" ? "Baseウォレット残高" : "不足分（回復対象）"} />
            <ReferenceLine y={depositAmt} stroke="rgba(130,201,30,0.3)" strokeDasharray="5 5"
              label={{ value: `上限 ${depositAmt}`, fill: "rgba(130,201,30,0.6)", fontSize: 11 }} />
            <ReferenceLine y={depositAmt * 0.9} stroke="rgba(255,180,0,0.2)" strokeDasharray="3 3"
              label={{ value: "90%", fill: "rgba(255,180,0,0.4)", fontSize: 10 }} />
            <Line type="monotone" dataKey="balance" stroke="#4dabf7" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="deficit" stroke="#ff6b6b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" activeDot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{
          background: "rgba(77,171,247,0.1)",
          border: "1px solid rgba(77,171,247,0.2)",
          borderRadius: 10, padding: 14,
        }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>支出①後の残高</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#4dabf7" }}>
            {Math.max(0, depositAmt - spendAmount1)} Base
          </div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
            90%回復まで約{recoveryTo90}日
          </div>
        </div>
        <div style={{
          background: "rgba(255,107,107,0.1)",
          border: "1px solid rgba(255,107,107,0.2)",
          borderRadius: 10, padding: 14,
        }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>全損（0 Base）からの回復</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#ff6b6b" }}>
            90%まで{recoveryFromZeroTo90}日
          </div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
            支出③をON・1000 Baseで確認
          </div>
        </div>
        <div style={{
          background: "rgba(130,201,30,0.1)",
          border: "1px solid rgba(130,201,30,0.2)",
          borderRadius: 10, padding: 14,
        }}>
          <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>半減期（不足分が半分になるまで）</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#82c91e" }}>
            {Math.ceil(Math.log(0.5) / Math.log(1 - recoveryRate))}日
          </div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
            r = {recoveryRatePct}% での不足分の半減期
          </div>
        </div>
      </div>

      {/* Insight */}
      <div style={{
        background: "var(--bg-secondary, rgba(255,255,255,0.04))",
        borderRadius: 10,
        padding: 16,
        fontSize: 13,
        lineHeight: 1.7,
        borderLeft: "3px solid rgba(77,171,247,0.5)",
      }}>
        <strong style={{ color: "rgba(77,171,247,0.9)" }}>対称性</strong>
        <div style={{ marginTop: 8 }}>
          償却ウォレット：<code>残高 × (1-r)</code> で0に向かう（呼気）
        </div>
        <div>
          Baseウォレット：<code>(入金額 - 残高) × r</code> で1,000に向かう（吸気）
        </div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
          同じ数学。逆の方向。条件分岐なし。全損からでも回復する。
          支出③を ON にして1,000 Base全額使い切ると、ゼロからの回復曲線が見える。
        </div>
      </div>
    </div>
  );
}
