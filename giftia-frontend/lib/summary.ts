// lib/summary.ts — ⑤ 集計画面（C-2）が使う型と、API を呼ぶ関数
// 仕様.md「GET /api/shares/{share_id}/summary」「POST …/purchase-click」
import { API_BASE_URL } from "./config";
import type { ReasonKey } from "./reasons";

// 理由ごとの人数（理由の key は lib/reasons.ts。ADR-0013）
export type ReasonCounts = Record<ReasonKey, number>;

// 候補1件の集計（API が賛成の多い順に並べて返す）
export type SummaryItem = {
  id: string;
  name: string;
  price: number;
  votes: number;
  reasons: ReasonCounts;
  comments: string[]; // ひとことの本文
};

// F-08：いちばん賛成が多い候補。賛成が1件もなければ null
export type SummaryTop = {
  id: string;
  name: string;
  votes: number;
  reason_key: ReasonKey | null;
  reason_count: number;
};

export type Summary = {
  respondents: number;
  items: SummaryItem[];
  top: SummaryTop | null;
};

// HTTP の状態（404 など）を画面に伝えるためのエラー
export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

export async function fetchSummary(shareId: string): Promise<Summary> {
  const res = await fetch(
    `${API_BASE_URL}/api/shares/${encodeURIComponent(shareId)}/summary`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

export async function postPurchaseClick(shareId: string, productId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/shares/${encodeURIComponent(shareId)}/purchase-click`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    },
  );
  if (!res.ok) throw new ApiError(res.status);
}