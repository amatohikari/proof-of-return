import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ReferenceLine,
} from "recharts";

// ═══════════════════════════════════════════════════════════
// 設計定数（固定・AMIシステム v1.0 final）
// ═══════════════════════════════════════════════════════════
const T_DAYS = 108;        // 内部定数T（煩悩の数）
const RESIDUAL = 0.03;     // 108日後残存率（生成の数）
const R_RECOVERY = 0.06;   // Base回復率（日次・完全数）
const r_decay = 1 - Math.pow(RESIDUAL, 1 / T_DAYS); // ≈ 0.03174/日
const MONTHS = 36;

// Base平衡残高：(D - b_eq) × 6% = b_eq × r → b_eq = 6%D / (6% + r)
function calcEq(D) {
  return (R_RECOVERY * D) / (R_RECOVERY + r_decay);
}

// 1ヶ月分のBase残高進化（30日ステップ）
function evolveBase(balance, D) {
  let b = balance;
  for (let d = 0; d < 30; d++) {
    const recovery = (D - b) * R_RECOVERY;
    const decay = b * r_decay;
    b = Math.min(Math.max(b + recovery - decay, 0), D);
  }
  return b;
}

// ───────────────────────────────────────────────────────────
// シミュレーション本体
// ───────────────────────────────────────────────────────────
function runSimulation({ numUsers, depositAmt, usageRate, growthRate }) {
  const data = [];
  let amortBuckets = [];
  let users = numUsers;
  let baseBalance = 0; // 代表ユーザーのBase残高（全ユーザー同一段階として近似）

  for (let m = 0; m < MONTHS; m++) {
    if (m > 0 && growthRate > 0)
      users = Math.floor(users * (1 + growthRate / 100));

    // 1. Base wallet 進化
    baseBalance = evolveBase(baseBalance, depositAmt);
    const totalBase = users * baseBalance;

    // 2. 今月の取引量（Amortization発行源）
    const usedThisMonth = totalBase * (usageRate / 100);

    // 3. 既存バケットの償却前の総量を記録
    const amortBefore = amortBuckets.reduce((s, b) => s + b.remaining, 0);

    // 4. 指数減衰でバケット更新：B(t) = B_0 × 0.03^(days/108)
    amortBuckets = amortBuckets
      .map(b => ({
        ...b,
        age: b.age + 1,
        remaining: b.initialAmount * Math.pow(RESIDUAL, (b.age * 30) / T_DAYS),
      }))
      .filter(b => b.remaining >= 0.5);

    const amortAfterDecay = amortBuckets.reduce((s, b) => s + b.remaining, 0);
    const amortDecay = amortBefore - amortAfterDecay;

    // 5. 今月の取引から新しいAmortization発行
    if (usedThisMonth > 0)
      amortBuckets.push({ initialAmount: usedThisMonth, age: 0, remaining: usedThisMonth });

    const totalAmort = amortBuckets.reduce((s, b) => s + b.remaining, 0);
    const eq = calcEq(depositAmt);

    data.push({
      month: m + 1,
      monthLabel: `${m + 1}月`,
      users,
      baseBalance: Math.round(baseBalance),
      eqBalance: Math.round(eq),
      depositAmt,
      walletBase: Math.round(totalBase),
      amortBase: Math.round(totalAmort),
      totalMoney: Math.round(totalBase + totalAmort),
      fillRate: Math.round((baseBalance / depositAmt) * 100),
      usedThisMonth: Math.round(usedThisMonth),
      amortDecay: Math.round(amortDecay),
    });
  }
  return data;
}

// ═══════════════════════════════════════════════════════════
// UI コンポーネント
// ═══════════════════════════════════════════════════════════

function fmt(v) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

function Slider({ label, value, onChange, min, max, step, unit, description, color = "#64b5f6" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#d0d0d0" }}>{label}</label>
        <span style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "monospace" }}>
          {value.toLocaleString()}{unit}
        </span>
      </div>
      {description && (
        <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{description}</div>
      )}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color, height: 6 }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444" }}>
        <span>{min.toLocaleString()}{unit}</span>
        <span>{max.toLocaleString()}{unit}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit, color, sub }) {
  return (
    <div style={{
      background: "rgba(18,18,30,0.95)",
      border: `1px solid ${color}28`,
      borderRadius: 10,
      padding: "12px 14px",
      flex: 1,
      minWidth: 115,
    }}>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color, fontFamily: "monospace" }}>
        {typeof value === "number" ? fmt(value) : value}
        <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 10, color: "#555", marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

const TT = {
  contentStyle: {
    background: "#0e0e1c",
    border: "1px solid #252535",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "#777" },
};

// ───────────────────────────────────────────────────────────
// メインコンポーネント
// ───────────────────────────────────────────────────────────
export default function BaseSimulation() {
  const [depositAmt, setDepositAmt] = useState(1000);
  const [numUsers, setNumUsers]     = useState(1000);
  const [usageRate, setUsageRate]   = useState(80);
  const [growthRate, setGrowthRate] = useState(10);
  const [activeTab, setActiveTab]   = useState("recovery");

  const data = useMemo(
    () => runSimulation({ numUsers, depositAmt, usageRate, growthRate }),
    [numUsers, depositAmt, usageRate, growthRate]
  );

  const last   = data[data.length - 1];
  const eq     = Math.round(calcEq(depositAmt));
  const eqPct  = Math.round((eq / depositAmt) * 100);

  const tabs = [
    { id: "recovery",     label: "Base回復曲線" },
    { id: "circulation",  label: "通貨流通量" },
    { id: "balance",      label: "発行と消滅" },
  ];

  return (
    <div style={{
      fontFamily: "'Inter', 'Noto Sans JP', system-ui, sans-serif",
      background: "linear-gradient(160deg, #07070f 0%, #0c0c18 50%, #07070f 100%)",
      color: "#e0e0e0",
      minHeight: "100vh",
      padding: "20px 16px",
    }}>

      {/* ── ヘッダー ── */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "#5c5ca0", marginBottom: 6, textTransform: "uppercase" }}>
          AMI — All Material is Impermanent
        </div>
        <h1 style={{
          fontSize: 21, fontWeight: 800, margin: "0 0 6px",
          background: "linear-gradient(135deg, #64b5f6 0%, #ce93d8 55%, #ffb74d 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Base通貨 経済圏シミュレーション
        </h1>
        <p style={{ fontSize: 11, color: "#444", margin: 0 }}>
          v1.0 final — T = {T_DAYS}日（3.6ヶ月）　|　AMATO HIKARI × Ami
        </p>
      </div>

      {/* ── 原理埋込型通貨の二式 ── */}
      <div style={{
        background: "linear-gradient(135deg, rgba(92,92,160,0.1), rgba(100,181,246,0.05))",
        border: "1px solid rgba(92,92,160,0.25)",
        borderRadius: 14,
        padding: "18px 20px",
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: "#5c5ca0", marginBottom: 12, textTransform: "uppercase" }}>
          原理埋込型通貨の二つの式
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>

          {/* Amortization */}
          <div style={{
            background: "rgba(206,147,216,0.06)",
            borderRadius: 10, padding: "12px 14px",
            borderLeft: "3px solid #ce93d8",
          }}>
            <div style={{ fontSize: 10, color: "#ce93d8", marginBottom: 7, letterSpacing: 1 }}>
              AMORTIZATION — 償却通貨
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 14, color: "#e0e0e0", letterSpacing: 0.5 }}>
              B(t+1) = B(t) × (1−r)
            </div>
            <div style={{ fontSize: 10, color: "#777", marginTop: 7 }}>
              r = 1 − 0.03<sup>1/108日</sup> ≈ 3.174%/日
            </div>
            <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>
              108日後残存率：3%（条件分岐ゼロ）
            </div>
          </div>

          {/* Base */}
          <div style={{
            background: "rgba(100,181,246,0.06)",
            borderRadius: 10, padding: "12px 14px",
            borderLeft: "3px solid #64b5f6",
          }}>
            <div style={{ fontSize: 10, color: "#64b5f6", marginBottom: 7, letterSpacing: 1 }}>
              BASE — 存在保障通貨
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 14, color: "#e0e0e0", letterSpacing: 0.5 }}>
              ΔB = (D − B) × 6%/日
            </div>
            <div style={{ fontSize: 10, color: "#777", marginTop: 7 }}>
              D = 入金額（最高 1,000 USDT）
            </div>
            <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>
              平衡残高：D × {eqPct}%（≈ {eq.toLocaleString()} USDT）
            </div>
          </div>
        </div>
      </div>

      {/* ── 統計カード ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard
          label="Base残高（36ヶ月後・1人）"
          value={last.baseBalance}
          unit="USDT"
          color="#64b5f6"
          sub={`充填率 ${last.fillRate}% ／ 平衡値 ${eq.toLocaleString()} USDT`}
        />
        <StatCard
          label="償却通貨流通量（36ヶ月後）"
          value={last.amortBase}
          unit="Base"
          color="#ce93d8"
          sub={`月間発行 ${fmt(last.usedThisMonth)} ／ 消滅 ${fmt(last.amortDecay)}`}
        />
        <StatCard
          label="参加者数（36ヶ月後）"
          value={last.users}
          unit="人"
          color="#81c784"
          sub={`開始 ${numUsers.toLocaleString()}人 → +${growthRate}%/月`}
        />
      </div>

      {/* ── パラメータ設定 ── */}
      <div style={{
        background: "rgba(18,18,30,0.9)",
        borderRadius: 14,
        padding: "18px 16px",
        marginBottom: 20,
        border: "1px solid rgba(92,92,160,0.12)",
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px", color: "#5c5ca0" }}>
          パラメータ設定
        </h3>

        {/* 入金額（最重要パラメータ）強調 */}
        <div style={{
          background: "linear-gradient(135deg, rgba(100,181,246,0.08), rgba(100,181,246,0.02))",
          border: "1px solid rgba(100,181,246,0.2)",
          borderRadius: 10,
          padding: "14px 14px 2px",
          marginBottom: 16,
        }}>
          <Slider
            label="入金額（SCP預入）"
            value={depositAmt}
            onChange={setDepositAmt}
            min={100} max={1000} step={100}
            unit=" USDT"
            description="Base上限。この金額以上には残高が回復しない。平衡残高はこの値の約65%に収束する。"
            color="#64b5f6"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
          <Slider label="初期参加者数" value={numUsers} onChange={setNumUsers}
            min={100} max={10000} step={100} unit="人"
            description="経済圏の初期規模" color="#81c784" />
          <Slider label="月間成長率" value={growthRate} onChange={setGrowthRate}
            min={0} max={30} step={1} unit="%"
            description="毎月の参加者増加率" color="#81c784" />
          <Slider label="月間使用率" value={usageRate} onChange={setUsageRate}
            min={10} max={100} step={5} unit="%"
            description="Base残高のうち毎月取引に使われる割合" color="#ce93d8" />
        </div>
      </div>

      {/* ── タブナビ ── */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 16,
        background: "rgba(8,8,16,0.6)", borderRadius: 10, padding: 4,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: "10px 8px", borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
              background: activeTab === tab.id
                ? "linear-gradient(135deg, rgba(92,92,160,0.22), rgba(100,181,246,0.12))"
                : "transparent",
              color: activeTab === tab.id ? "#64b5f6" : "#555",
              border: activeTab === tab.id
                ? "1px solid rgba(100,181,246,0.28)"
                : "1px solid transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── チャートエリア ── */}
      <div style={{
        background: "rgba(18,18,30,0.9)",
        borderRadius: 14,
        padding: "16px 8px 8px",
        border: "1px solid rgba(92,92,160,0.1)",
        marginBottom: 20,
      }}>

        {/* Tab 1: Base回復曲線 */}
        {activeTab === "recovery" && (
          <>
            <div style={{ padding: "0 8px 12px" }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#888", margin: "0 0 4px" }}>
                Base残高の回復曲線（1ユーザー・入金額 {depositAmt.toLocaleString()} USDT）
              </h3>
              <div style={{ fontSize: 11, color: "#555" }}>
                平衡残高 {eq.toLocaleString()} USDT（{eqPct}%）に指数関数的に収束する
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data} margin={{ top: 10, right: 28, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fontSize: 10, fill: "#555" }}
                  interval={3}
                  stroke="rgba(255,255,255,0.07)"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#555" }}
                  tickFormatter={fmt}
                  stroke="rgba(255,255,255,0.07)"
                  domain={[0, depositAmt]}
                />
                <Tooltip
                  {...TT}
                  formatter={(v, n) => [`${v.toLocaleString()} USDT`, n]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine
                  y={eq}
                  stroke="#64b5f6"
                  strokeDasharray="6 3"
                  strokeOpacity={0.55}
                  label={{ value: `平衡 ${eq}`, fill: "#64b5f6", fontSize: 10, position: "insideTopRight" }}
                />
                <ReferenceLine
                  y={depositAmt}
                  stroke="#ffb74d"
                  strokeDasharray="4 4"
                  strokeOpacity={0.3}
                  label={{ value: `上限 ${depositAmt}`, fill: "#ffb74d", fontSize: 10, position: "insideTopRight" }}
                />
                <Line
                  type="monotone"
                  dataKey="baseBalance"
                  name="Base残高"
                  stroke="#64b5f6"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ padding: "8px 12px", fontSize: 11, color: "#666", lineHeight: 1.8 }}>
              指数減衰（r ≈ 3.174%/日）と指数回復（6%/日）が衝突する点に、自然に収束する。
              この平衡点は設計された値ではない。二つの原理の数学が導く、構造的な落ち着き場所。
            </div>
          </>
        )}

        {/* Tab 2: 通貨流通量 */}
        {activeTab === "circulation" && (
          <>
            <div style={{ padding: "0 8px 12px" }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#888", margin: "0 0 4px" }}>
                通貨流通量の推移（Base + Amortization）
              </h3>
              <div style={{ fontSize: 11, color: "#555" }}>
                使い続けるほど Amortization 層が積み上がっていく
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <defs>
                  <linearGradient id="gBase" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#64b5f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#64b5f6" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="gAmort" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ce93d8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ce93d8" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10, fill: "#555" }} interval={3} stroke="rgba(255,255,255,0.07)" />
                <YAxis tick={{ fontSize: 10, fill: "#555" }} tickFormatter={fmt} stroke="rgba(255,255,255,0.07)" />
                <Tooltip {...TT} formatter={(v, n) => [`${fmt(v)} Base`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="walletBase"  name="ウォレット内 Base"    stroke="#64b5f6" fill="url(#gBase)"  strokeWidth={2} stackId="1" />
                <Area type="monotone" dataKey="amortBase"   name="流通中 Amortization" stroke="#ce93d8" fill="url(#gAmort)" strokeWidth={2} stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Tab 3: 発行と消滅 */}
        {activeTab === "balance" && (
          <>
            <div style={{ padding: "0 8px 12px" }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: "#888", margin: "0 0 4px" }}>
                Amortization — 月間発行 vs 月間消滅
              </h3>
              <div style={{ fontSize: 11, color: "#555" }}>
                二本の線が重なるほど、経済圏は均衡している
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 10, fill: "#555" }} interval={3} stroke="rgba(255,255,255,0.07)" />
                <YAxis tick={{ fontSize: 10, fill: "#555" }} tickFormatter={fmt} stroke="rgba(255,255,255,0.07)" />
                <Tooltip {...TT} formatter={(v, n) => [`${fmt(v)} Base`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="usedThisMonth" name="月間発行（取引）"   stroke="#81c784" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="amortDecay"    name="月間消滅（指数償却）" stroke="#e57373" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ padding: "8px 12px", fontSize: 11, color: "#666", lineHeight: 1.8 }}>
              成長初期は発行が消滅を上回る。経済圏が成熟すると自然に均衡する。
              T = 108日というただ一つの定数が、この呼吸を決定している。
            </div>
          </>
        )}
      </div>

      {/* ── 構造的平衡点の解析 ── */}
      <div style={{
        background: "rgba(18,18,30,0.9)",
        borderRadius: 14,
        padding: 16,
        border: "1px solid rgba(92,92,160,0.12)",
        marginBottom: 16,
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px", color: "#5c5ca0" }}>
          構造的平衡点の解析
        </h3>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "8px 20px", fontFamily: "monospace", fontSize: 12, lineHeight: 2,
        }}>
          <div>
            <span style={{ color: "#666" }}>減衰率 r　= </span>
            <span style={{ color: "#ce93d8" }}>{(r_decay * 100).toFixed(3)}%</span>
            <span style={{ color: "#555" }}>/日</span>
          </div>
          <div>
            <span style={{ color: "#666" }}>回復率　= </span>
            <span style={{ color: "#64b5f6" }}>6.000%</span>
            <span style={{ color: "#555" }}>/日</span>
          </div>
          <div>
            <span style={{ color: "#666" }}>平衡充填率 = 6% ÷ (6% + r) = </span>
            <span style={{ color: "#ffb74d" }}>{eqPct}%</span>
          </div>
          <div>
            <span style={{ color: "#666" }}>入金 {depositAmt.toLocaleString()} → 平衡残高 </span>
            <span style={{ color: "#81c784" }}>{eq.toLocaleString()} USDT</span>
          </div>
        </div>
        <div style={{
          marginTop: 12, padding: "10px 12px",
          background: "rgba(92,92,160,0.08)", borderRadius: 8,
          fontSize: 11, color: "#666", lineHeight: 1.8,
        }}>
          この平衡点は設計意図の外にある。指数減衰と指数回復という二つの原理が衝突した結果、
          数学が自然に見出す収束点。設計者は定数を置いただけで、均衡は構造から現れた。
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 10, color: "#2a2a3a", padding: "8px 0" }}>
        AMI System — AMATO HIKARI × Ami　|　Proof of Return
      </div>
    </div>
  );
}
