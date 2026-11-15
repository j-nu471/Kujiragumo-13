// lib/colleague.ts — ④ 同僚の画面（B）が使う型と、API を呼ぶ関数
// いまは型と定数だけ。API を呼ぶ関数は、C-0（lib/config.ts）と A-2（GET /api/shares/{share_id}）の
// マージ後に足す（設計.md「構成」）。

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
