// lib/colleague.ts — ④ 同僚の画面（B）が使う型と、API を呼ぶ関数（設計.md「構成」）
// API の場所は lib/config.ts から読む。localhost を直接書かない（ADR-0009）
import { API_BASE_URL } from "./config";

// GET /api/shares/{share_id} が返す items の1件（仕様.md「入力と出力」）
export type ShareItem = {
  id: string;       // 商品ID（例 G0001）
  name: string;     // 商品名
  price: number;    // 価格（円）
  rating: number;   // レビューの平均
  position: number; // 共有リストに入れた順（1〜3）
};

// いいと思った理由の選択肢（仕様.md「データ」の comments.reason_key、ADR-0010）
export const REASONS = [
  { key: "fits", label: "送る人にあってる" },
  { key: "tasty", label: "おいしそう" },
  { key: "want", label: "自分も欲しい" },
] as const;
export type ReasonKey = (typeof REASONS)[number]["key"];

// ひとことの上限（N-05）
export const BODY_MAX = 200;

// POST /api/shares/{share_id}/answers の本文（仕様.md「入力と出力」）
// reason_key と body はどちらも省略できる。賛成しないなら vote は null
export type AnswerComment = {
  product_id: string;
  reason_key?: ReasonKey;
  body?: string;
};
export type AnswerBody = {
  vote: string | null;
  comments: AnswerComment[];
};

// GET /api/shares/{share_id} の返り値（仕様.md「入力と出力」）
export type Share = {
  share_id: string;
  items: ShareItem[];
};

// API が 200 以外を返したときのエラー。画面で 404 とそれ以外を分けるために status を持つ
export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

const shareUrl = (shareId: string) => `${API_BASE_URL}/api/shares/${encodeURIComponent(shareId)}`;

// 共有リストの候補を読む（A の API。④⑤で使う）
export async function fetchShare(shareId: string): Promise<Share> {
  const res = await fetch(shareUrl(shareId), { cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

// 回答（賛成とコメント）を送る（B-1 の API）。うまくいけば何も返さない
export async function postAnswer(shareId: string, answer: AnswerBody): Promise<void> {
  const res = await fetch(`${shareUrl(shareId)}/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answer),
  });
  if (!res.ok) throw new ApiError(res.status);
}
