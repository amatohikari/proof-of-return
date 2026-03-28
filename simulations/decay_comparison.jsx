import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

const T_DAYS = 108;

export default function DecayComparison() {
  const [initialAmount, setInitialAmount] = useState(1000);
  const [thresholdPercent, setThresholdPercent] = useState(3);
  const [addDay, setAddDay] = useState(null);
  const [addAmount, setAddAmount] = useState(200);

  // For exponential: we want it to reach ~thresholdPercent at day 108
  // (1-r)^(108) = threshold/100
  // r = 1 - (threshold/100)^(1/108)
  const rPerDay = useMemo(() => {
    return 1 - Math.pow(thresholdPercent / 100, 1 / T_DAYS);
  }, [thresholdPercent]);

  const rPerSecond = useMemo(() => {
    return 1 - Math.pow(1 - rPerDay, 1 / 86400);
  }, [rPerDay]);

  const data = useMemo(() => {
    const points = [];
    let expBalance = initialAmount;

    // Linear uses batch tracking — each deposit is a separate batch with its own birthday
    // This is exactly why linear requires batch management
    const linearBatches = [{ amount: initialAmount, birthDay: 0 }];
    let batchAdded = false;

    for (let day = 0; day <= 160; day++) {
      // Add injection as new batch
      if (addDay !== null && day === addDay && !batchAdded) {
        linearBatches.push({ amount: addAmount, birthDay: day });
        expBalance += addAmount;
        batchAdded = true;
      }

      // Linear: sum of all batches, each with its own 108-day countdown
      let linear = 0;
      for (const batch of linearBatches) {
        const elapsed = day - batch.birthDay;
        if (elapsed >= 0) {
          linear += batch.amount * Math.max(0, 1 - elapsed / T_DAYS);
        }
      }

      // Exponential (apply daily)
      if (day > 0) {
        expBalance = expBalance * (1 - rPerDay);
      }

      // Threshold cutoff for exponential
      const expDisplay = expBalance < 0.01 ? 0 : expBalance;

      points.push({
        day,
        linear: Math.round(linear * 100) / 100,
        exponential: Math.round(expDisplay * 100) / 100,
        expRaw: Math.round(expBalance * 100) / 100,
      });
    }
    return points;
  }, [initialAmount, rPerDay, thresholdPercent, addDay, addAmount]);

  const linearZeroDay = useMemo(() => {
    if (addDay !== null) {
      return Math.max(T_DAYS, addDay + T_DAYS);
    }
    return T_DAYS;
  }, [addDay]);
  const expEffectiveZeroDay = useMemo(() => {
    const found = data.find(d => d.exponential === 0 && d.day > 0);
    return found ? found.day : ">130";
  }, [data]);

  return (
    <div style={{
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "var(--text-primary, #e0e0e0)",
      padding: "24px",
      maxWidth: 900,
      margin: "0 auto",
    }}>
      <h2 style={{
        fontSize: 20,
        fontWeight: 700,
        marginBottom: 4,
        color: "var(--text-primary, #fff)",
      }}>
        償却モデル比較：線形 vs 指数減衰
      </h2>
      <p style={{
        fontSize: 13,
        opacity: 0.6,
        marginBottom: 24,
      }}>
        T = {T_DAYS}日（煩悩の数）
      </p>

      {/* Controls */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        marginBottom: 24,
        background: "var(--bg-secondary, rgba(255,255,255,0.05))",
        borderRadius: 12,
        padding: 16,
      }}>
        <div>
          <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>
            初期残高 (Base)
          </label>
          <input
            type="range"
            min={100}
            max={3000}
            step={100}
            value={initialAmount}
            onChange={e => setInitialAmount(Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{initialAmount} Base</span>
        </div>
        <div>
          <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>
            指数減衰：{T_DAYS}日後の残存率
          </label>
          <input
            type="range"
            min={0.01}
            max={10}
            step={0.01}
            value={thresholdPercent}
            onChange={e => setThresholdPercent(Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{thresholdPercent}%</span>
        </div>
        <div>
          <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>
            途中入金日（テスト用）
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="range"
              min={1}
              max={100}
              value={addDay || 30}
              onChange={e => setAddDay(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 13 }}>{addDay ? `${addDay}日目` : "なし"}</span>
            <button
              onClick={() => setAddDay(addDay ? null : 30)}
              style={{
                padding: "2px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: addDay ? "rgba(255,180,0,0.2)" : "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              {addDay ? "ON" : "OFF"}
            </button>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, opacity: 0.7, display: "block", marginBottom: 4 }}>
            途中入金額 (Base)
          </label>
          <input
            type="range"
            min={50}
            max={1000}
            step={50}
            value={addAmount}
            onChange={e => setAddAmount(Number(e.target.value))}
            style={{ width: "100%", opacity: addDay ? 1 : 0.3 }}
            disabled={!addDay}
          />
          <span style={{ fontSize: 14, fontWeight: 600, opacity: addDay ? 1 : 0.3 }}>
            +{addAmount} Base
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{
        background: "var(--bg-secondary, rgba(255,255,255,0.03))",
        borderRadius: 12,
        padding: "20px 8px 8px 8px",
        marginBottom: 20,
      }}>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="day"
              label={{ value: "日数", position: "insideBottomRight", offset: -5, style: { fill: "var(--text-primary, #aaa)", fontSize: 12 } }}
              tick={{ fill: "var(--text-primary, #888)", fontSize: 11 }}
              stroke="rgba(255,255,255,0.15)"
            />
            <YAxis
              label={{ value: "Base", angle: -90, position: "insideLeft", offset: 5, style: { fill: "var(--text-primary, #aaa)", fontSize: 12 } }}
              tick={{ fill: "var(--text-primary, #888)", fontSize: 11 }}
              stroke="rgba(255,255,255,0.15)"
            />
            <Tooltip
              contentStyle={{
                background: "rgba(20,20,30,0.95)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8,
                fontSize: 13,
              }}
              formatter={(value, name) => {
                const labels = { linear: "線形", exponential: "指数減衰" };
                return [`${value} Base`, labels[name] || name];
              }}
              labelFormatter={v => `${v}日目`}
            />
            <Legend
              formatter={value => {
                const labels = { linear: "線形償却", exponential: "指数減衰" };
                return labels[value] || value;
              }}
            />
            <ReferenceLine x={T_DAYS} stroke="rgba(255,180,0,0.4)" strokeDasharray="5 5" label={{ value: `T=${T_DAYS}`, fill: "rgba(255,180,0,0.7)", fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="linear"
              stroke="#4dabf7"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="exponential"
              stroke="#ffa94d"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{
          background: "rgba(77,171,247,0.1)",
          border: "1px solid rgba(77,171,247,0.2)",
          borderRadius: 10,
          padding: 14,
        }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>線形償却</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#4dabf7" }}>
            {addDay ? `${linearZeroDay}日で完全消滅` : `${T_DAYS}日で完全消滅`}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
            {addDay ? `バッチ2つ：0日目＋${addDay}日目（個別追跡が必要）` : `毎日 ${(initialAmount / T_DAYS).toFixed(2)} Base 減少（一定）`}
          </div>
        </div>
        <div style={{
          background: "rgba(255,169,77,0.1)",
          border: "1px solid rgba(255,169,77,0.2)",
          borderRadius: 10,
          padding: 14,
        }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>指数減衰</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#ffa94d" }}>
            {T_DAYS}日後 → {(initialAmount * thresholdPercent / 100).toFixed(2)} Base
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
            日次減衰率: {(rPerDay * 100).toFixed(4)}% / 秒次: {rPerSecond.toExponential(4)}
          </div>
        </div>
      </div>

      {/* Key insight */}
      <div style={{
        background: "var(--bg-secondary, rgba(255,255,255,0.04))",
        borderRadius: 10,
        padding: 16,
        fontSize: 13,
        lineHeight: 1.7,
        borderLeft: "3px solid rgba(255,180,0,0.5)",
      }}>
        <strong style={{ color: "rgba(255,180,0,0.9)" }}>設計上のポイント</strong>
        <div style={{ marginTop: 8 }}>
          <strong>線形：</strong>一定速度で減り、{T_DAYS}日でゼロ。明確で予測しやすい。<span style={{color:"#4dabf7"}}>入金ごとにバッチ追跡が必須。</span>
        </div>
        <div style={{ marginTop: 4 }}>
          <strong>指数：</strong>最初は速く、末期はゆるやかに減る。<span style={{color:"#ffa94d"}}>バッチ不要（残高×率の一本式）。</span>
          自然界の崩壊に一致。閾値でゼロ処理が必要。
        </div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
          途中入金をONにすると差が明確に見える。線形は入金分が独自の108日カウントダウンを持ち、
          全体の消滅が{T_DAYS}日を超えて延びる。指数は全体が一本の率でそのまま溶ける。
        </div>
      </div>
    </div>
  );
}
