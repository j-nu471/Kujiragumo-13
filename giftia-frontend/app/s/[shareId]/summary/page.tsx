// app/s/[shareId]/summary/page.tsx — ⑤ 集計（贈る人の画面。C）
// 仕様.md「⑤ 集まった声を見て買う」、F-06・F-07・F-08、ADR-0012（数は出さない）
"use client"; // ← ボタンや取得結果を扱うので、ブラウザで動く画面にする

import { use, useEffect, useState } from "react";
import { reasonLabel } from "@/lib/reasons";
import { ApiError, fetchSummary, postPurchaseClick, type Summary, type SummaryTop } from "@/lib/summary";

// 1位の理由の文（仕様.md「⑤」。ADR-0012）
function topReason(top: SummaryTop): string {
  if (top.why === "majority") return "賛成多数";
  if (top.why === "reason" && top.reason_key) return `決め手：${reasonLabel(top.reason_key)}`;
  return "みんなの声をもとに選びました"; // 理由が「とくにない」だけ
}

export default function SummaryPage({ params }: { params: Promise<{ shareId: string }> }) {
  // URL の [shareId] の部分（Next.js 16 では Promise で渡されるので use で取り出す）
  const { shareId } = use(params);

  // ① 状態（変化するデータ）を覚える箱
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [bought, setBought] = useState<Record<string, boolean>>({}); // 「買う」を記録した商品
  const [buyError, setBuyError] = useState("");

  // ② 画面を開いたとき、集計を API に聞く
  useEffect(() => {
    let cancelled = false;
    fetchSummary(shareId)
      .then((s) => { if (!cancelled) setSummary(s); })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "この共有リストは見つかりません"
            : "集計を読み込めませんでした。時間をおいてもう一度お試しください",
        );
      });
    return () => { cancelled = true; };
  }, [shareId]);

  // ③ 「この商品を買う」：押した記録を残す（S-07）
  async function onBuy(productId: string) {
    setBuyError("");
    try {
      await postPurchaseClick(shareId, productId);
      setBought((b) => ({ ...b, [productId]: true }));
    } catch {
      setBuyError("記録できませんでした。もう一度お試しください");
    }
  }

  // ④ 画面
  if (error) {
    return (
      <main className="page">
        <header className="header"><h1>Giftia</h1></header>
        <p className="summary">{error}</p>
      </main>
    );
  }
  if (!summary) {
    return (
      <main className="page">
        <header className="header"><h1>Giftia</h1></header>
        <p className="summary">読み込み中…</p>
      </main>
    );
  }

  const { top } = summary;

  return (
    <main className="page">
      <header className="header"><h1>Giftia</h1></header>
      <h2 style={{ fontSize: 18, margin: "8px 0 4px" }}>みんなの回答</h2>
      <p className="summary">回答した人：{summary.respondents}人</p>

      {/* F-08：Giftia が決めた1位と、その理由（数は出さない） */}
      <div className="card" style={{ marginBottom: 12 }}>
        {top ? (
          <>
            <h3 className="name">1位：{top.name}</h3>
            <p className="meta">{topReason(top)}</p>
          </>
        ) : (
          <p className="meta">まだ1件も賛成がありません</p>
        )}
      </div>

      {buyError && <p className="summary">{buyError}</p>}

      {/* F-06・F-07：候補ごとのひとことと購入ボタン（API が F-08 の点数の順に返す。賛成数・理由ごとの人数は出さない） */}
      <div className="grid">
        {summary.items.map((item) => (
          <div className="card" key={item.id}>
            <h3 className="name">{item.name}</h3>
            <p className="price">{item.price.toLocaleString()}円</p>

            {item.comments.length > 0 && (
              <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
                {item.comments.map((c, i) => (
                  <li key={i} className="meta">{c}</li>
                ))}
              </ul>
            )}

            <div className="form">
              <button type="button" disabled={bought[item.id]} onClick={() => onBuy(item.id)}>
                この商品を買う
              </button>
              {bought[item.id] && <span className="meta">記録しました</span>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}