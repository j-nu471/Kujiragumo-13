// app/s/[shareId]/page.tsx — ④ 賛成・コメント（同僚の画面。B）
// 仕様.md「④ 賛成・コメント」、F-04、ADR-0010（匿名・賛成は1つだけ）
//
// 開いたときに候補を API（GET /api/shares/{share_id}）から読み、
// 「送信する」で回答を API（POST …/answers）に保存する。
"use client"; // ← ボタンや入力を扱うので、ブラウザで動く画面にする

import { use, useEffect, useState } from "react";
import {
  REASONS,
  BODY_MAX,
  ApiError,
  fetchShare,
  postAnswer,
  type ShareItem,
  type ReasonKey,
  type AnswerComment,
  type AnswerBody,
} from "@/lib/colleague";

// 仕様.md「エラー時の挙動」の文言
const NOT_FOUND_MESSAGE = "この共有リストは見つかりません";
const RETRY_MESSAGE = "時間をおいてもう一度お試しください";

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

  // ① 状態（変化するデータ）を覚える箱
  const [items, setItems] = useState<ShareItem[] | null>(null);  // 候補（読み込むまでは null）
  const [loadError, setLoadError] = useState("");                 // 候補を読めなかったときの文言
  const [vote, setVote] = useState<string | null>(null);         // 賛成した商品の ID（1つだけ）
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}); // 候補ごとの理由とひとこと
  const [error, setError] = useState("");                         // 送れなかったときの文言
  const [sending, setSending] = useState(false);                  // 送信中かどうか（二重送信を防ぐ）
  const [sent, setSent] = useState(false);                        // 保存できたかどうか

  // ② 画面を開いたとき、共有リストの候補を API に聞く
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

  const draftOf = (id: string) => drafts[id] ?? EMPTY_DRAFT;
  function updateDraft(id: string, change: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? EMPTY_DRAFT), ...change } }));
  }

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

  // ひとことが長すぎる候補があれば、送れないようにする（仕様.md「エラー時の挙動」）
  const tooLong = items.some((item) => countChars(draftOf(item.id).body) > BODY_MAX);

  // ③ 「送信する」の処理
  async function onSend(e: React.FormEvent) {
    e.preventDefault(); // ページの再読み込みを止める
    if (!items || sending || sent) return; // 送信中・送信済みなら何もしない（二重送信を防ぐ）
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
    setSending(true);
    try {
      await postAnswer(shareId, answer);
      setSent(true); // 保存できたときだけ。送ったあとは送信ボタンを押せなくする（ADR-0010）
    } catch (err) {
      // 失敗したら、お礼は出さずにエラーを出す。入力はそのままなので、もう一度送れる
      setError(err instanceof ApiError && err.status === 404 ? NOT_FOUND_MESSAGE : RETRY_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  // ④ 画面
  return (
    <main className="page">
      <header className="header"><h1>Giftia</h1></header>
      <h2 style={{ fontSize: 18, margin: "8px 0 4px" }}>ギフト候補</h2>
      <p className="summary">
        いいと思ったギフト候補ひとつに賛成ボタンを押してください。（匿名での回答となります）
      </p>

      <form onSubmit={onSend}>
        {/* 送信中と送ったあとは、まとめて押せなくする */}
        <fieldset disabled={sending || sent} style={{ border: "none", padding: 0, margin: 0 }}>
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

          {/* role="alert"：エラーが出たことを、読み上げソフトにも伝える */}
          {error && <p className="summary" role="alert">{error}</p>}

          <div className="form">
            {/* 押せないとき（送信中・送信済み・ひとことが長すぎる）は、薄くして見た目でもわかるようにする */}
            <button
              type="submit"
              disabled={tooLong}
              style={tooLong || sending || sent ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
            >
              {sending ? "送信中…" : "送信する"}
            </button>
          </div>
        </fieldset>
      </form>

      {sent && <p className="summary">ご回答ありがとうございました。</p>}
    </main>
  );
}
