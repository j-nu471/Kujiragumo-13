// lib/shares.ts — 共有リストを作る API を呼ぶ（A：じゅんちゃん）
// ② の「共有リストを作る」から使う。入出力は 仕様.md「入力と出力」F-03 の行。
// API の URL は lib/config.ts から読む。localhost を直接書かない（ADR-0009、N-06）
import { API_BASE_URL } from "@/lib/config";

export const MAX_PICKS = 3; // 候補は3つまで（F-03）

// 選んだ商品の ID（選んだ順＝position 1〜3）を送り、共有リストの番号（share_id）をもらう
export async function createShare(productIds: string[]): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_ids: productIds }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: { share_id: string } = await res.json();
  return data.share_id;
}
