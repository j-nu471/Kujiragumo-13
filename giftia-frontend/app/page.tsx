// app/page.tsx — Giftia 検索画面（①②）
// もとは2週目の穴埋め版。【A-1追加】候補を選ぶ、【デザイン】見た目、【#39】シーン・予算・全件数・21件目以降・案内 を足している。
// 1週目との違い：①searchGifts が FastAPI を呼ぶ（async/await）②入力した条件を渡す ③つながらないときの表示
"use client"; // ← ブラウザで動く合図。useState や onClick を使う画面に必要

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation"; // 【A-1追加】③の画面へ移るため（Next.js 16）
import ResultCard from "./ResultCard";
import ProductImage from "./ProductImage"; // 【デザイン】下のバーのサムネイル
import Steps from "./Steps";               // 【デザイン】3つのステップ
import Loading from "./Loading";           // 【デザイン】検索中のくるくる
import { searchGifts, EMPTY_CONDITION, PAGE_SIZE, type Gift, type SearchCondition } from "@/lib/api";
import { createShare, MAX_PICKS } from "@/lib/shares"; // 【A-1追加】共有リストを作る API

// 【#39】シーンのボタン。最初の「すべて」はシーンで絞らない。送別は施策の主役なので「すべて」の隣に置く
// 値は商品のシーンタグ（product_scenes.scene_tag）。API（main.py の SCENES）と同じ9つ
const SCENES = ["送別", "誕生日", "お礼", "母の日", "父の日", "結婚祝い", "出産祝い", "お中元", "お歳暮"];

// 【#39】検索結果の見出しの下に出す「選んだ条件」の文（例：「送別」・4,000〜5,000円）
function describe(c: SearchCondition, mode: "standard" | "business"): string {
  const yen = (v: string) => `${Number(v).toLocaleString()}円`;
  const parts: string[] = [];
  if (mode === "business") {
    parts.push("取引先へのお礼");
    if (c.indivWrap) parts.push("個包装");
    if (c.priceBand === "3000") parts.push("3,000〜5,000円");
    if (c.priceBand === "5000") parts.push("5,000〜10,000円");
    return parts.join("・");
  }
  if (c.scene) parts.push(`「${c.scene}」`);
  if (c.keyword.trim()) parts.push(`キーワード「${c.keyword.trim()}」`);
  if (c.category) parts.push(c.category);
  if (c.priceMin && c.priceMax) parts.push(`${yen(c.priceMin)}〜${yen(c.priceMax)}`.replace("円〜", "〜"));
  else if (c.priceMin) parts.push(`${yen(c.priceMin)}以上`);
  else if (c.priceMax) parts.push(`${yen(c.priceMax)}以下`);
  return parts.join("・") || "条件なし";
}

export default function Home() {
  // ① 状態（変化するデータ）を覚える箱
  const [mode, setMode] = useState<"standard" | "business">("standard");   // どのタブか
  const [keyword, setKeyword] = useState("");                             // 入力した言葉
  const [category, setCategory] = useState("");                           // 選んだカテゴリー
  const [scene, setScene] = useState("");                                 // 【#39】選んだシーン（"" はすべて）
  const [priceMin, setPriceMin] = useState("");                           // 【#39】予算の下限（円）
  const [priceMax, setPriceMax] = useState("");                           // 【#39】予算の上限（円）
  const [indivWrap, setIndivWrap] = useState(false); // 個包装だけ（取引先へのお礼）
  const [priceBand, setPriceBand] = useState("");                         // 価格帯（取引先へのお礼）
  const [results, setResults] = useState<Gift[] | null>(null);            // 検索結果（今のページの分）
  const [total, setTotal] = useState(0);                                  // 【#39】全件数
  const [offset, setOffset] = useState(0);                                // 【#39】今のページが何件目からか（0, 20, 40, …）
  const [shown, setShown] = useState<{ condition: SearchCondition; mode: "standard" | "business"; searched: boolean }>(
    { condition: EMPTY_CONDITION, mode: "standard", searched: false },
  ); // 【#39】今出している結果の条件（前後の20件はこの条件で読む。searched が false なら「人気のギフト」）
  const [error, setError] = useState("");                                 // つながらないときの文言
  const [searching, setSearching] = useState(false);                      // 【デザイン】検索中（画面の中央にくるくるを出す）
  // 【A-1追加】② 候補を選ぶ（F-03）
  const [picked, setPicked] = useState<string[]>([]);   // 選んだ商品の ID（選んだ順＝position 1〜3）。検索し直しても・ページを移っても残す
  const [creating, setCreating] = useState(false);      // 共有リストを作っている最中（ボタンの二度押しを防ぐ）
  const [shareError, setShareError] = useState("");     // 共有リストを作れなかったときの文言
  const router = useRouter();

  // 【デザイン】トップを開いた時点では、ふつうの検索だけ。「みんなで選ぶ」を押すと、
  // 【#39】まず案内（guide）を出し、「はじめる」でステップ・「候補に入れる」・下のバーが出る（URL は / のまま）
  const [together, setTogether] = useState(false);
  const [guide, setGuide] = useState(false);   // 【#39】「みんなで選ぶ」の案内を出しているか
  const [flash, setFlash] = useState(false);   // 【#39】「はじめる」のあと、下のバーを3回光らせる
  const startButton = useRef<HTMLButtonElement>(null);
  const resultsTop = useRef<HTMLElement>(null);
  const scrollAfterLoad = useRef(false); // 【#39】前の20件・次の20件を押した（読み終わったら結果の見出しまでスクロールする）

  // 【デザイン】下のバーにサムネイルを出すため、選んだ商品の中身も覚えておく（検索し直しても消えないように）
  const [pickedGifts, setPickedGifts] = useState<Record<string, Gift>>({});

  // 【#39】条件と何件目からを決めて、API に聞く（検索・前後の20件・開いた時点の人気のギフトで共通）
  async function load(condition: SearchCondition, nextMode: "standard" | "business", nextOffset: number, searched: boolean) {
    setError("");
    setSearching(true); // 結果が返るまで、前の結果のかわりに「検索中…」を出す
    try {
      const r = await searchGifts(condition, nextOffset);
      setResults(r.results);
      setTotal(r.total);
      setOffset(nextOffset);
      setShown({ condition, mode: nextMode, searched });
    } catch (err) {
      setResults(null);
      setError(`APIにつながりません：${(err as Error).message}`); // 原因はブラウザの Console に出る
    } finally {
      setSearching(false);
    }
  }

  // 【#39】開いた時点で、条件なしの人気順（人気のギフト）を出す
  useEffect(() => {
    // 開いた直後に1回だけ API に聞く（画面の外から結果を取り込むので、ここで state を変える）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(EMPTY_CONDITION, "standard", 0, false);
  }, []);

  // 【#39】案内を開いたら、「はじめる」にフォーカスを移す（キーボードでもすぐ押せるように）
  useEffect(() => {
    if (guide) startButton.current?.focus();
  }, [guide]);

  // 「候補に入れる」を押したとき：選んでいれば外す。選んでいなければ、3つ未満のときだけ最後に足す
  function togglePick(gift: Gift) {
    const id = gift.id;
    setPickedGifts((prev) => ({ ...prev, [id]: gift }));
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id)
      : prev.length < MAX_PICKS ? [...prev, id]
      : prev
    );
  }

  // 「共有リストを作る」を押したとき：API で作り、返ってきた番号で ③ の画面へ移る
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

  // 【#39】案内の「はじめる」：②にして、下のバーを光らせる
  function onStart() {
    setGuide(false);
    setTogether(true);
    setFlash(true);
  }

  // ② 検索ボタンの処理（API に聞くので、結果が返るまで待つ＝async/await）
  async function onSearch(e: React.FormEvent) {
    e.preventDefault(); // ページの再読み込みを止める
    // 【#39】予算は0以上の整数（円）だけ送る。入力欄の min では手入力のマイナスや小数を止められないため、ここで確かめる
    if (mode === "standard" && [priceMin, priceMax].some((v) => v !== "" && !/^\d+$/.test(v))) {
      setError("予算は0以上の整数（円）で入れてください");
      return;
    }
    // 【#39】予算は下限 ≦ 上限のときだけ送る
    if (mode === "standard" && priceMin && priceMax && Number(priceMin) > Number(priceMax)) {
      setError("予算の下限が、上限より大きくなっています");
      return;
    }
    // いま開いているタブの条件だけを送る（もう一方のタブの入力は送らない）
    const condition: SearchCondition = mode === "standard"
      ? { ...EMPTY_CONDITION, keyword, category, scene, priceMin, priceMax }
      : { ...EMPTY_CONDITION, indivWrap, priceBand };
    await load(condition, mode, 0, true);
  }

  // 【#39】前の20件・次の20件：今出している結果と同じ条件で、何件目からだけ変える。結果の見出しまで戻す
  // 読んでいる間は結果の <section> が消えるので、スクロールは新しい結果を描いたあと（下の useEffect）でする
  async function onPage(nextOffset: number) {
    scrollAfterLoad.current = true;
    await load(shown.condition, shown.mode, nextOffset, shown.searched);
  }

  // 【#39】ページを移ったあと、新しい結果が画面に出てから、結果の見出しまでスクロールする
  useEffect(() => {
    if (searching || !scrollAfterLoad.current) return;
    scrollAfterLoad.current = false;
    resultsTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searching, results]);

  const pageNo = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showBar = together || guide; // 案内を出している間も、下のバーを見せる（どこに入るかが分かるように）

  // ③ 画面
  return (
    <>
      {/* search-only：「みんなで選ぶ」を押す前。ヘッダー右上の「みんなで選ぶ」を消す（globals.css） */}
      <main className={together ? "page with-bar" : "page search-only"}>
        {together ? (
          <Steps current={1} />
        ) : (
          // 「みんなで選ぶ」の入口（押すまでは、ふつうの Giftia の検索）
          <section className="together-invite">
            <div>
              <h1 className="invite-title">ギフト選び、みんなで決めませんか？</h1>
              <p className="summary">候補を3つまで選んで URL を送ると、一緒に贈る人の声をもとに、Giftia がギフトを1つに絞ります。</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setGuide(true)}>
              みんなで選ぶ
            </button>
          </section>
        )}

        {/* 【#39】ギフトを探す（見出し・タブ・シーン・キーワード・カテゴリー・予算） */}
        <section className="search-section">
          <h2 className="section-title">ギフトを探す</h2>
          <div className="panel">
            {/* タブ：state(mode)＋条件で出し分ける */}
            <nav className="modes" aria-label="探し方">
              <button type="button" className={mode === "standard" ? "on" : ""} aria-pressed={mode === "standard"} onClick={() => setMode("standard")}>シーン・予算で探す</button>
              <button type="button" className={mode === "business" ? "on" : ""} aria-pressed={mode === "business"} onClick={() => setMode("business")}>取引先へのお礼</button>
            </nav>

            <form className="form" onSubmit={onSearch}>
              {mode === "standard" ? (
                <>
                  {/* 【#39】シーン：1つだけ選べる。最初は「すべて」 */}
                  <div className="scene-row">
                    <span className="field-label" id="scene-label">シーン</span>
                    <div className="scenes" role="group" aria-labelledby="scene-label">
                      {["", ...SCENES].map((s) => (
                        <button
                          key={s || "all"}
                          type="button"
                          className={`scene-chip${scene === s ? " on" : ""}`}
                          aria-pressed={scene === s}
                          onClick={() => setScene(s)}
                        >
                          {scene === s && (
                            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          )}
                          {s || "すべて"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input className="q" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="キーワード（例：お菓子）" aria-label="キーワード" />
                  <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="カテゴリー">
                    <option value="">すべてのカテゴリー</option>
                    <option value="コスメ">コスメ</option>
                    <option value="食品">食品</option>
                    <option value="生活雑貨">生活雑貨</option>
                  </select>
                  {/* 【#39】予算：下限と上限を自由に入れる（どちらかだけでもよい） */}
                  <div className="budget" role="group" aria-labelledby="budget-label">
                    <span className="field-label" id="budget-label">予算</span>
                    <input type="number" inputMode="numeric" min={0} step={1} value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="下限" aria-label="予算の下限（円）" />
                    <span aria-hidden="true">〜</span>
                    <input type="number" inputMode="numeric" min={0} step={1} value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="上限" aria-label="予算の上限（円）" />
                    <span>円</span>
                  </div>
                </>
              ) : (
                <>
                  <label className="chk"><input type="checkbox" checked={indivWrap} onChange={(e) => setIndivWrap(e.target.checked)} /> 個包装</label>
                  <select value={priceBand} onChange={(e) => setPriceBand(e.target.value)} aria-label="価格帯">
                    <option value="">すべての価格帯</option>
                    <option value="3000">3,000〜5,000円</option>
                    <option value="5000">5,000〜10,000円</option>
                  </select>
                </>
              )}
              <button type="submit" className="search-button" disabled={searching}>検索</button>
            </form>
          </div>
        </section>

        {error && <p className="error-text" role="alert">{error}</p>}

        {/* 【デザイン】検索中は、画面の中央にくるくると「検索中…」 */}
        {searching && <Loading text="検索中…" />}

        {/* 結果：同じ ResultCard を map で並べる（使い回し）。【#39】見出し・全件数・前後の20件 */}
        {results && !searching && (
          <section ref={resultsTop} className="results" aria-labelledby="results-title">
            <div className="results-head">
              <div>
                <h2 className="section-title" id="results-title">{shown.searched ? "検索結果" : "人気のギフト"}</h2>
                {shown.searched && <p className="summary">{describe(shown.condition, shown.mode)}</p>}
              </div>
              <p className="summary">
                {total > 0 ? `全 ${total.toLocaleString()} 件中 ${offset + 1}〜${offset + results.length} 件` : "全 0 件"}
                {together && `・候補は${MAX_PICKS}つまで選べます`}
              </p>
            </div>
            {results.length === 0 ? (
              <p className="summary">条件に合うギフトが見つかりませんでした。条件を変えてお試しください。</p>
            ) : (
              <div className="grid grid-4">
                {results.map((g, i) => (
                  <ResultCard
                    key={g.id}
                    gift={g}
                    rank={offset + i + 1}
                    picked={picked.includes(g.id)}
                    disabled={!picked.includes(g.id) && picked.length >= MAX_PICKS}
                    onToggle={() => togglePick(g)}
                    showPick={together}
                  />
                ))}
              </div>
            )}
            {total > PAGE_SIZE && (
              <nav className="pager" aria-label="ページ">
                <button type="button" className="btn btn-outline" onClick={() => onPage(offset - PAGE_SIZE)} disabled={offset === 0}>前の20件</button>
                <span className="summary">{pageNo} / {pageCount} ページ</span>
                <button type="button" className="btn btn-outline" onClick={() => onPage(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}>次の20件</button>
              </nav>
            )}
          </section>
        )}
      </main>

      {/* 【#39】「みんなで選ぶ」の案内。後ろを暗くし、下のバーだけ明るく見せる。「はじめる」で②、「閉じる」でふつうの検索のまま */}
      {guide && (
        <div className="guide-backdrop" onClick={() => setGuide(false)}>
          <div
            className="guide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Escape") setGuide(false); }}
          >
            <button type="button" className="guide-close" aria-label="閉じる（ふつうの検索に戻る）" onClick={() => setGuide(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <h2 id="guide-title" className="guide-title">みんなで選ぶ</h2>
            <p className="guide-lead">一緒に贈る人の声をもとに、Giftia がギフトを1つに絞ります。</p>
            <ol className="guide-steps">
              <li><span className="guide-num on">1</span><div><strong>候補を選ぶ</strong><span>気になるギフトの「候補に入れる」を押すと、<b>画面の下のリスト</b>に入ります（3つまで）。</span></div></li>
              <li><span className="guide-num">2</span><div><strong>みんなに聞く</strong><span>「共有リストを作る」を押すと URL ができます。一緒に贈る人に送ってください。</span></div></li>
              <li><span className="guide-num">3</span><div><strong>ギフトを決める</strong><span>集まった声をもとに、Giftia がギフトを1つに絞ります。</span></div></li>
            </ol>
            <button type="button" ref={startButton} className="btn btn-primary guide-start" onClick={onStart}>はじめる</button>
          </div>
        </div>
      )}

      {/* 【A-1追加】画面の下：選んだ候補と「共有リストを作る」（1つ以上選ぶと押せる）
          【デザイン】選んだ候補のサムネイルを並べる
          【#39】見出しと説明を足す。「はじめる」のあとに3回光らせる */}
      {showBar && (
        <div className={`pick-bar${guide ? " on-guide" : ""}${flash ? " flash" : ""}`} onAnimationEnd={() => setFlash(false)}>
          <div className="pick-bar-inner">
            <div className="pick-bar-left">
              <div className="pick-bar-text">
                <strong>共有リストの候補を選ぶ</strong>
                <span>「候補に入れる」を押すと、ここに入ります（3つまで）</span>
              </div>
              <div className="pick-bar-thumbs">
                {picked.map((id) => (
                  <ProductImage key={id} category={pickedGifts[id]?.category} className="thumb-mini" sizes="44px" />
                ))}
                {Array.from({ length: MAX_PICKS - picked.length }, (_, i) => (
                  <span key={`slot-${i}`} className="pick-slot" aria-hidden="true" />
                ))}
                <span className="pick-count">{picked.length} / {MAX_PICKS}</span>
              </div>
              {shareError && <span className="error-text" role="alert">{shareError}</span>}
            </div>
            {/* 作っている間（③に移るまで）は、ボタンの中にくるくるを出す */}
            <button type="button" className={`btn btn-primary${creating ? " is-busy" : ""}`} onClick={onCreateShare} disabled={picked.length === 0 || creating || guide}>
              {creating && <span className="spinner" aria-hidden="true" />}
              {creating ? "作成中…" : "共有リストを作る"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
