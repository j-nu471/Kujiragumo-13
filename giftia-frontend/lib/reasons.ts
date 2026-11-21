// lib/reasons.ts — いいと思った理由の key と、画面に出す文言（設計.md「構成」、ADR-0013）
// 理由の選択肢は、画面ではここ1か所にだけ書く。④（lib/colleague.ts・同僚の画面）と⑤はここから読む。
// key は backend/reasons.py と同じにする（重みは backend にだけ置く。画面には点数を出さないため。ADR-0012）

export const REASONS = [
  { key: "wanted", label: "本人が欲しがっていた（まだ持っていなさそう）" },
  { key: "fits", label: "贈る相手にぴったりだと思う" },
  { key: "memorable", label: "特別感があって記念になりそう" },
  { key: "practical", label: "実用的で使ってもらえそう" },
  { key: "safe", label: "好みを選ばず、誰からも喜ばれそう" },
  { key: "none", label: "とくにない" },
] as const;

export type ReasonKey = (typeof REASONS)[number]["key"];

// 理由の key（wanted など）を、画面の文言に直す。知らない key ならそのまま返す
export const reasonLabel = (key: string) => REASONS.find((r) => r.key === key)?.label ?? key;
