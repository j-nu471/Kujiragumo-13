// app/s/[shareId]/created/page.tsx — ③ 共有URLを送る（贈る人の画面。A：じゅんちゃん）
// 仕様.md「③ 共有URLを送る」、F-03、N-06、ADR-0009
//
// ② の「共有リストを作る」のあとに開く。選んだ候補と共有URLを出し、同僚に送ってもらう。
// 候補は ④ と同じく GET /api/shares/{share_id} から読む（読む関数は lib/colleague.ts の fetchShare を使う）
"use client"; // ← ボタンや window を使うので、ブラウザで動く画面にする

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, fetchShare, type ShareItem } from "@/lib/colleague";

// 仕様.md「エラー時の挙動」の文言（④ と同じ）
const NOT_FOUND_MESSAGE = "この共有リストは見つかりません";
const RETRY_MESSAGE = "時間をおいてもう一度お試しください";

// 同僚に送る文の例（2026-11-17 じゅんちゃんが決めた文面）。最後に共有URLを付けて出す
const MESSAGE_EXAMPLE = "送別のプレゼント候補を3つ挙げます。いいと思うものに賛成をお願いします！（匿名で集計）";

export default function CreatedPage({ params }: { params: Promise<{ shareId: string }> }) {
  // URL の [shareId] の部分（Next.js 16 では Promise で渡されるので use で取り出す）
  const { shareId } = use(params);

  // ① 状態（変化するデータ）を覚える箱
  const [items, setItems] = useState<ShareItem[] | null>(null); // 候補（読み込むまでは null）
  const [loadError, setLoadError] = useState("");                // 候補を読めなかったときの文言
  const [copyNote, setCopyNote] = useState("");                  // コピーのあとに出す文言

  // ② 画面を開いたとき：候補を API に聞く
  useEffect(() => {
    let cancelled = false; // 画面を離れたあとに結果が届いても、使わない
    fetchShare(shareId)
      .then((share) => { if (!cancelled) setItems(share.items); })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError && err.status === 404 ? NOT_FOUND_MESSAGE : RETRY_MESSAGE);
      });
    return () => { cancelled = true; };
  }, [shareId]);

  // 候補を読めなかったとき／読み込み中
  if (loadError) {
    return (
      <main className="page">
        <header className="header"><h1>Giftia</h1></header>
        <p className="summary" role="alert">{loadError}</p>
      </main>
    );
  }
  if (!items) {
    return (
      <main className="page">
        <header className="header"><h1>Giftia</h1></header>
        <p className="summary">読み込み中…</p>
      </main>
    );
  }

  // ③ 共有URL＝今開いているページのアドレスの頭（例 http://localhost:3000）＋ /s/{share_id}
  // localhost を直接書かないので、デプロイ先でもそのまま使える（N-06、ADR-0009、S-02）
  // ここに来るのは候補を読み終えたあと（ブラウザの中）なので、window を使える
  const shareUrl = `${window.location.origin}/s/${encodeURIComponent(shareId)}`;

  // 「コピー」を押したとき：共有URLをクリップボードに入れる
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyNote("コピーしました");
    } catch {
      setCopyNote("コピーできませんでした。URL を選んでコピーしてください");
    }
  }

  // ④ 画面
  return (
    <main className="page">
      <header className="header"><h1>Giftia</h1></header>
      <h2>共有リストができました</h2>

      {/* 選んだ候補（入れた順） */}
      <section>
        <p className="summary">選んだ候補（{items.length}つ）</p>
        <div className="grid">
          {items.map((item) => (
            <div className="card" key={item.id}>
              <p className="meta">候補{item.position}</p>
              <h3 className="name">{item.name}</h3>
              <p className="price">{item.price.toLocaleString()}円</p>
              <p className="meta">評価{item.rating}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 共有URL とコピー */}
      <section>
        <p className="summary">この URL を、一緒に贈る人に送ってください</p>
        <div className="form">
          <input className="q" value={shareUrl} readOnly onFocus={(e) => e.target.select()} aria-label="共有URL" />
          <button type="button" onClick={onCopy}>コピー</button>
          {copyNote && <span className="summary">{copyNote}</span>}
        </div>
      </section>

      {/* 同僚に送る文の例 */}
      <section>
        <p className="summary">送る文の例</p>
        <div className="card" style={{ whiteSpace: "pre-wrap" }}>
          {MESSAGE_EXAMPLE}
          {"\n"}
          {shareUrl}
        </div>
      </section>

      {/* ⑤ へ */}
      <p className="form">
        <Link href={`/s/${encodeURIComponent(shareId)}/summary`}>集まった声を見る</Link>
      </p>
    </main>
  );
}
