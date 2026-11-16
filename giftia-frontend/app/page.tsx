// app/page.tsx — Giftia 検索画面（2週目・穴埋め版）
// 【穴7】【穴8】を、対応表と公式ドキュメントを頼りに自分で埋める。
// 答えは 配布コード/答え合わせ/frontend/page.tsx（自分で埋めてから見る）。
// 1週目との違い：①searchGifts が FastAPI を呼ぶ（async/await）②入力した条件を渡す ③つながらないときの表示
"use client"; // ← ブラウザで動く合図。useState や onClick を使う画面に必要

import { useState } from "react";
import { useRouter } from "next/navigation"; // 【A-1追加】③の画面へ移るため（Next.js 16）
import ResultCard from "./ResultCard";
import { searchGifts, type Gift } from "@/lib/api";
import { createShare, MAX_PICKS } from "@/lib/shares"; // 【A-1追加】共有リストを作る API

export default function Home() {
  // ① 状態（変化するデータ）を覚える箱
  const [mode, setMode] = useState<"standard" | "business" | "friend">("standard"); // どのタブか
  const [keyword, setKeyword] = useState("");                             // 入力した言葉
  const [category, setCategory] = useState("");                           // 選んだカテゴリー
  const [indivWrap, setIndivWrap] = useState(false); // 個包装だけ（取引先へのお礼）
  const [priceBand, setPriceBand] = useState("");                         // 価格帯（取引先へのお礼）
  const [results, setResults] = useState<Gift[] | null>(null);            // 検索結果
  const [error, setError] = useState("");                                 // つながらないときの文言
  // 【A-1追加】② 候補を選ぶ（F-03）
  const [picked, setPicked] = useState<string[]>([]);   // 選んだ商品の ID（選んだ順＝position 1〜3）。検索し直しても残す
  const [creating, setCreating] = useState(false);      // 共有リストを作っている最中（ボタンの二度押しを防ぐ）
  const [shareError, setShareError] = useState("");     // 共有リストを作れなかったときの文言
  const router = useRouter();

  // 「候補に入れる」を押したとき：選んでいれば外す。選んでいなければ、3つ未満のときだけ最後に足す
  function togglePick(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id)
      : prev.length < MAX_PICKS ? [...prev, id]
      : prev
    );
  }

  // 「共有リストを作る」を押したとき：API で作り、返ってきた番号で ③ の画面へ移る（③ は A-3 で作る）
  async function onCreateShare() {
    setShareError("");
    setCreating(true);
    try {
      const shareId = await createShare(picked);
      router.push(`/s/${shareId}/created`);
    } catch {
      setShareError("共有リストを作れませんでした。時間をおいてもう一度お試しください");
      setCreating(false);
    }
  }

  // ② 検索ボタンの処理（API に聞くので、結果が返るまで待つ＝async/await）
  async function onSearch(e: React.FormEvent) {
    e.preventDefault(); // ページの再読み込みを止める
    setError("");
    // いま開いているタブの条件だけを送る（もう一方のタブの入力は送らない）
    const condition = mode === "standard"
      ? { keyword, category, indivWrap: false, priceBand: "" }
      : { keyword: "", category: "", indivWrap, priceBand };
    try {
      setResults(await searchGifts(condition));
    } catch (err) {
      setResults(null);
      setError(`APIにつながりません：${(err as Error).message}`); // 原因はブラウザの Console に出る
    }
  }

  // ③ 画面
  return (
    <main className="page">
      <header className="header"><h1>Giftia</h1></header>

      {/* タブ：state(mode)＋条件で出し分ける */}
      <nav className="modes">
        <button className={mode === "standard" ? "on" : ""} onClick={() => { setMode("standard"); setResults(null); }}>いまの検索</button>
        <button className={mode === "business" ? "on" : ""} onClick={() => { setMode("business"); setResults(null); }}>取引先へのお礼</button>
      </nav>

      <form className="form" onSubmit={onSearch}>
        {mode === "standard" ? (
          <>
            <input className="q" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="キーワード（例：送別 お菓子）" />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">すべてのカテゴリー</option>
              <option value="コスメ">コスメ</option>
              <option value="食品">食品</option>
              <option value="生活雑貨">生活雑貨</option>
            </select>
          </>
        ) : (
          <>
            <label className="chk"><input type="checkbox" checked={indivWrap} onChange={(e) => setIndivWrap(e.target.checked)} /> 個包装</label>
            <select value={priceBand} onChange={(e) => setPriceBand(e.target.value)}>
              <option value="">すべての価格帯</option>
              <option value="3000">3,000〜5,000円</option>
              <option value="5000">5,000〜10,000円</option>
            </select>
          </>
        )}
        <button type="submit">検索</button>
      </form>

      {error && <p className="summary">{error}</p>}

      {/* 結果：同じ ResultCard を map で並べる（使い回し） */}
      {results && (
        <section>
          <p className="summary">上位 {results.length} 件</p>
          <div className="grid" style={{ maxHeight: "70vh", overflowY: "auto" }}>
            {results.map((g, i) => (
              <ResultCard
                key={g.id}
                gift={g}
                rank={i + 1}
                picked={picked.includes(g.id)}
                disabled={!picked.includes(g.id) && picked.length >= MAX_PICKS}
                onToggle={() => togglePick(g.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 【A-1追加】画面の下：「候補 ◯/3」と「共有リストを作る」（1つ以上選ぶと押せる） */}
      <div className="form" style={{ position: "sticky", bottom: 0, background: "#fff", padding: "8px 0" }}>
        <span className="summary">候補 {picked.length}/{MAX_PICKS}</span>
        <button type="button" onClick={onCreateShare} disabled={picked.length === 0 || creating}>
          {creating ? "作成中…" : "共有リストを作る"}
        </button>
        {shareError && <span className="summary">{shareError}</span>}
      </div>
    </main>
  );
}
