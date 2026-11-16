// app/ResultCard.tsx — 結果カード（部品）。2週目の変更は import の1行だけ（Gift 型の置き場所が lib/api.ts に変わった）
// 【A-1追加】「候補に入れる」のチェック（F-03）。選んだかどうか・押せるかどうかは page.tsx が決めて渡す
import type { Gift } from "@/lib/api";

type Props = {
  gift: Gift;
  rank: number;
  picked: boolean;      // 候補に入っているか
  disabled: boolean;    // 押せないか（3つ選んだあと、まだ選んでいない商品）
  onToggle: () => void; // チェックを押したときに page.tsx に知らせる
};

export default function ResultCard({ gift, rank, picked, disabled, onToggle }: Props) {
  return (
    <div className="card">
      <p className="meta">{rank}位・{gift.category}・{gift.brand}</p>
      <h3 className="name">{gift.name}</h3>
      <p className="price">{gift.price.toLocaleString()}円</p>
      <p className="meta">評価{gift.rating}（{gift.reviewCount}件）</p>
      <label className="meta" style={{ display: "flex", alignItems: "center", gap: 4, opacity: disabled ? 0.4 : 1 }}>
        <input type="checkbox" checked={picked} disabled={disabled} onChange={onToggle} />
        候補に入れる
      </label>
    </div>
  );
}
