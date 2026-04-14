# Proof of Return

**等価交換の回復：還元する通貨システム**

*諸行無常——すべては生まれ、存在し、還っていく。*

---

## 概要

人間が日々取引するもの——労働、時間、食事、サービス——はすべて有限であり、消費された瞬間に還元される。しかし、それを交換するための媒体——通貨——は還元されないように設計されてきた。

本論文は、通貨に「還元」を組み込むことでこの矛盾を解消する通貨システムを提案する。システムは四つの通貨で構成される：Amortization（指数減衰による還元）、Base（存在保障）、Creation（創造支援）、Torch（恩送り）。Torch機構はカンティロン効果を構造的に反転させる——富は中央に蓄積するのではなく、周縁で灯火に変わる。

システム全体は二つの指数関数だけで記述される——Amortizationの減衰と、BaseおよびTorchの回復。8つのスマートコントラクト。4つの通貨。2つの指数関数。1つの原理。

サトシ・ナカモトはProof of Workによって「信頼できる第三者なしに合意する方法」を示した。本論文はProof of Returnによって「還元されるものを、還元されるもので交換する方法」を示す。

本システムを **AMI** と命名する——*All Material is Impermanent（すべての物質は、無常である）*。

## リポジトリ構成

```
proof-of-return/
├── whitepaper/                           — 論文
│   ├── whitepaper_reductive_currency_v2.pdf         （日本語）
│   ├── whitepaper_reductive_currency_v2_en.pdf      （English）
│   ├── whitepaper_reductive_currency_final.pdf      （日本語 v1）
│   └── whitepaper_reductive_currency_final_en.pdf   （English v1）
├── contracts/                            — スマートコントラクト仕様
│   ├── SPEC.md                           — 設計仕様書（English）
│   ├── SPEC_ja.md                        — 設計仕様書（日本語）
│   └── AMI.sol                           — Solidity擬似コード（8コントラクト）
├── simulations/                          — インタラクティブ・シミュレーション（v1）
│   ├── base_currency_simulation.jsx
│   ├── base_recovery_simulation.jsx
│   ├── challenge_simulation.jsx
│   └── decay_comparison.jsx
└── README.md
```

## 論文

**V2（最新版）：**
- [English (PDF)](whitepaper/whitepaper_reductive_currency_v2_en.pdf)
- [日本語 (PDF)](whitepaper/whitepaper_reductive_currency_v2.pdf)

**V1：**
- [English (PDF)](whitepaper/whitepaper_reductive_currency_final_en.pdf)
- [日本語 (PDF)](whitepaper/whitepaper_reductive_currency_final.pdf)

## スマートコントラクト

- [仕様書・English (SPEC.md)](contracts/SPEC.md) — コントラクト構成、設計定数、実装戦略
- [仕様書・日本語 (SPEC_ja.md)](contracts/SPEC_ja.md) — 同上（日本語版）
- [擬似コード (AMI.sol)](contracts/AMI.sol) — 数学的モデルをSolidity構文で表現

**注記：** `AMI.sol` は数学的モデルがスマートコントラクトのロジックにどう対応するかを示す擬似コードであり、プロダクション用コードではない。

## 著者

アマト ヒカリ / AMATO HIKARI — 2026年4月

## ライセンス

本成果物は [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) のもとパブリックドメインに提供される。

---

*— 恐怖からではなく、愛から選ぶ。 —*
