# reasons.py — いいと思った理由の key と重み（設計.md「構成」、ADR-0012・ADR-0013）
#
# 理由の key と重みは、ここ1か所にだけ書く。colleague.py（④の回答）と summary.py（⑤の集計）はここから読む。
# 画面に出す文言は giftia-frontend/lib/reasons.ts（key はここと同じにする）。
# 重みは、いったんこの数で実装し、使ってみて見直す（ADR-0012。数字を直すだけで変えられる）。

# key → 重み（⑤の点数で、賛成した人が選んだ理由1つにつき足す点）
REASON_WEIGHTS = {
    "wanted": 4,     # 本人が欲しがっていた（まだ持っていなさそう）
    "fits": 3,       # 贈る相手にぴったりだと思う
    "memorable": 2,  # 特別感があって記念になりそう
    "practical": 1,  # 実用的で使ってもらえそう
    "safe": 1,       # 好みを選ばず、誰からも喜ばれそう
    "none": 0,       # とくにない
}

# 選べる理由の key（並びは画面の選択肢と同じ）
REASON_KEYS = tuple(REASON_WEIGHTS)

# 賛成1つの点数（ADR-0012：点数 ＝ 賛成の数 × VOTE_POINT ＋ 理由の重みの合計）
VOTE_POINT = 5
