// app/s/[shareId]/page.tsx — ④ 賛成・コメント（同僚の画面。B）
// 仕様.md「④ 賛成・コメント」、F-04、ADR-0010（匿名・賛成は1つだけ）
//
// いまは候補を仮のデータで出し、「送る」でも保存しない（送る内容をブラウザの Console に出すだけ）。
// C-0・A-2・B-1 のマージ後に、lib/colleague.ts の関数で API につなぐ。
"use client"; // ← ボタンや入力を扱うので、ブラウザで動く画面にする

import { use, useState } from "react";
import {
  REASONS,
  BODY_MAX,
  type ShareItem,
  type ReasonKey,
  type AnswerComment,
  type AnswerBody,
} from "@/lib/colleague";

// 仮のデータ（API につないだら消す）
const SAMPLE_ITEMS: ShareItem[] = [
  { id: "G0001", name: "（仮）商品A", price: 3240, rating: 4.5, position: 1 },
  { id: "G0002", name: "（仮）商品B", price: 4320, rating: 4.1, position: 2 },
  { id: "G0003", name: "（仮）商品C", price: 2980, rating: 3.8, position: 3 },
];

// 候補ごとの入力（理由とひとこと）
type Draft = { reason: ReasonKey | ""; body: string };
const EMPTY_DRAFT: Draft = { reason: "", body: "" };

// 賛成ボタンの見た目（globals.css は配布のものなので触らず、この画面の中だけで決める）
// 幅は固定（チェックの有無で横の入力欄の位置が動かないように）
// 賛成している候補：緑＋チェック／ほかの候補に賛成したあとの残りの候補：薄いグレー
const VOTE_GREEN = "#2f855a";
const VOTE_BASE_STYLE: React.CSSProperties = {
  flex: "0 0 104px", width: 104,
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  cursor: "pointer",
};
const VOTED_STYLE: React.CSSProperties = {
  ...VOTE_BASE_STYLE, background: VOTE_GREEN, color: "#fff", borderColor: VOTE_GREEN, fontWeight: 700,
};
const NOT_CHOSEN_STYLE: React.CSSProperties = {
  ...VOTE_BASE_STYLE, background: "#f3f4f6", color: "#9aa5b1", borderColor: "#e4e7eb",
};

// 賛成している候補に付けるチェックの印（文字の「☑」ではなく線で描く）
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 文字数を数える（絵文字なども1文字と数える。API 側の Python の数え方に合わせる）
const countChars = (s: string) => [...s].length;

export default function ColleaguePage({ params }: { params: Promise<{ shareId: string }> }) {
  // URL の [shareId] の部分（Next.js 16 では Promise で渡されるので use で取り出す）
  const { shareId } = use(params);
  const items = SAMPLE_ITEMS;

  // ① 状態（変化するデータ）を覚える箱
  const [vote, setVote] = useState<string | null>(null);         // 賛成した商品の ID（1つだけ）
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}); // 候補ごとの理由とひとこと
  const [error, setError] = useState("");                         // 送れなかったときの文言
  const [sent, setSent] = useState(false);                        // 送ったかどうか

  const draftOf = (id: string) => drafts[id] ?? EMPTY_DRAFT;
  function updateDraft(id: string, change: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? EMPTY_DRAFT), ...change } }));
  }

  // ひとことが長すぎる候補があれば、送れないようにする（仕様.md「エラー時の挙動」）
  const tooLong = items.some((item) => countChars(draftOf(item.id).body) > BODY_MAX);

  // ② 「送る」の処理
  function onSend(e: React.FormEvent) {
    e.preventDefault(); // ページの再読み込みを止める
    setError("");

    // 理由かひとことがある候補だけをコメントにする（両方空の候補は送らない）
    const comments: AnswerComment[] = [];
    for (const item of items) {
      const { reason, body } = draftOf(item.id);
      const text = body.trim();
      if (!reason && !text) continue;
      const comment: AnswerComment = { product_id: item.id };
      if (reason) comment.reason_key = reason;
      if (text) comment.body = text;
      comments.push(comment);
    }

    // 賛成もコメントも空なら送らない（S-05）
    if (vote === null && comments.length === 0) {
      setError("賛成か理由を1つ以上選んでください");
      return;
    }

    const answer: AnswerBody = { vote, comments };
    // 仮：まだ保存しない。B-1 のマージ後に API を呼ぶ形に置き換える
    console.log("送る内容（仮。まだ保存しない）", shareId, answer);
    setSent(true); // 送ったあとは送るボタンを押せなくする（ADR-0010）
  }

  // ③ 画面
  return (
    <main className="page">
      <header className="header"><h1>Giftia</h1></header>
      <h2 style={{ fontSize: 18, margin: "8px 0 4px" }}>ギフト候補</h2>
      <p className="summary">
        いいと思ったギフト候補ひとつに賛成ボタンを押してください。（匿名での回答となります）
      </p>

      <form onSubmit={onSend}>
        {/* 送ったあとは、まとめて押せなくする */}
        <fieldset disabled={sent} style={{ border: "none", padding: 0, margin: 0 }}>
          <div className="grid">
            {items.map((item) => {
              const draft = draftOf(item.id);
              const voted = vote === item.id;
              const length = countChars(draft.body);
              return (
                <div className="card" key={item.id}>
                  <h3 className="name">{item.name}</h3>
                  <p className="price">{item.price.toLocaleString()}円</p>
                  <p className="meta">評価{item.rating}</p>

                  <div className="form">
                    {/* 賛成は1つだけ。別の候補を押すと賛成が移る */}
                    <button
                      type="button"
                      aria-pressed={voted}
                      onClick={() => setVote(item.id)}
                      style={voted ? VOTED_STYLE : vote !== null ? NOT_CHOSEN_STYLE : VOTE_BASE_STYLE}
                    >
                      {voted && <CheckIcon />}
                      賛成
                    </button>

                    {/* いいと思った理由（任意。賛成していない候補にも付けられる） */}
                    <select
                      value={draft.reason}
                      onChange={(e) => updateDraft(item.id, { reason: e.target.value as ReasonKey | "" })}
                    >
                      <option value="">いいと思った理由（任意）</option>
                      {REASONS.map((r) => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>

                    {/* ひとこと（任意・200文字まで） */}
                    <input
                      className="q"
                      value={draft.body}
                      onChange={(e) => updateDraft(item.id, { body: e.target.value })}
                      placeholder={`ひとこと（任意・${BODY_MAX}文字以内）`}
                    />
                  </div>
                  {length > BODY_MAX && (
                    <p className="meta">ひとことは{BODY_MAX}文字までです（いま{length}文字）</p>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="summary">{error}</p>}

          <div className="form">
            <button type="submit" disabled={tooLong}>送信する</button>
          </div>
        </fieldset>
      </form>

      {sent && <p className="summary">ご回答ありがとうございました。</p>}
    </main>
  );
}
