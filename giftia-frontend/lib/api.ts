// lib/api.ts — 2週目：searchGifts() の中身を「FastAPI に聞く」に差し替える（穴埋め版）
// 【穴5】【穴6】を、対応表と公式ドキュメントを頼りに自分で埋める。
// 1週目の lib/sampleGifts.ts は、このファイルに置き換える（ダミーは使わない）。
// 答えは 配布コード/答え合わせ/frontend/api.ts（自分で埋めてから見る）。

// 画面が使う商品の形。1週目と同じ（画面・ResultCard は変えない）
export type Gift = {
  id: string;          // 商品ID（例 G0001）
  category: string;    // カテゴリ
  brand: string;       // ブランド・店名
  name: string;        // 商品名
  price: number;       // 価格（円）
  rating: number | null; // レビューの平均（【#39】レビューがなければ null。画面は「評価なし」と出す）
  reviewCount: number; // レビュー件数
};

// 画面から渡す検索条件（2つのタブの分をまとめて持つ）
export type SearchCondition = {
  keyword: string;    // シーン・予算で探す：キーワード
  category: string;   // シーン・予算で探す：カテゴリー（空ならすべて）
  scene: string;      // 【#39】シーン・予算で探す：贈るシーン（空ならすべて。送別・誕生日 など）
  priceMin: string;   // 【#39】シーン・予算で探す：予算の下限（円。空なら下限なし）
  priceMax: string;   // 【#39】シーン・予算で探す：予算の上限（円。空なら上限なし）
  indivWrap: boolean; // 取引先へのお礼：個包装だけ
  priceBand: string;  // 取引先へのお礼："" | "3000" | "5000"
};

// 【#39】何も条件を入れていないとき（開いた時点の「人気のギフト」）
export const EMPTY_CONDITION: SearchCondition = {
  keyword: "", category: "", scene: "", priceMin: "", priceMax: "", indivWrap: false, priceBand: "",
};

// 【#39】1回に出す件数（次の20件・前の20件）
export const PAGE_SIZE = 20;

// 【#39】検索の結果：全件数と、その中の offset 件目からの商品
export type SearchResult = { total: number; results: Gift[] };

// API の場所。NEXT_PUBLIC_ の値はブラウザに配られる＝秘密は置かない（.env.local に書く）
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// 入力した条件をサーバー（FastAPI）に送り、全件数と結果をもらう（【#39】offset 件目から PAGE_SIZE 件）
export async function searchGifts(c: SearchCondition, offset = 0): Promise<SearchResult> {
  // ① 条件を URL のクエリ（?q=...&category=...）に組み立てる。空の条件は送らない
  const params = new URLSearchParams();
  if (c.keyword) params.set("q", c.keyword);
  if (c.category) params.set("category", c.category);
  if (c.indivWrap) params.set("indiv_wrap", "true");
  if (c.priceBand === "3000") { params.set("price_min", "3000"); params.set("price_max", "4999"); } // 3,000以上 5,000未満
  if (c.priceBand === "5000") { params.set("price_min", "5000"); params.set("price_max", "9999"); } // 5,000以上 10,000未満
  if (c.scene) params.set("scene", c.scene);              // 【#39】贈るシーン
  if (c.priceMin) params.set("price_min", c.priceMin);    // 【#39】予算の下限（以上）
  if (c.priceMax) params.set("price_max", c.priceMax);    // 【#39】予算の上限（以下）
  if (offset > 0) params.set("offset", String(offset));   // 【#39】21件目以降

  // ② fetch で API を呼ぶ（通信が終わるまで待つ＝await）
  const res = await fetch(`${API}/api/search?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // ③ 返ってきた JSON を読む。{ total（全件数）, results（Gift の配列） }
  const data = await res.json();
  return { total: data.total, results: data.results };
}
