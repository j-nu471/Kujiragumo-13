-- 私たちの表にインデックスを足す（ADR-0018、#36）
-- ⑤の集計（共有リストごとの賛成・理由・回答した人数）で、表を全部読まないようにする。
-- 足すだけ。列を消す・型を変える・既存の7つの表（products など）を触る、はしない（N-02・ADR-0005）。
--
-- 流す前に：Workbench で班の DB を選んでおく（USE <班のDB名>;）。ほかの班の DB を選んでいないか必ず確かめる
-- 1回だけ流す。もう一度流すと「すでにある」（エラー 1061）で止まるだけで、表は壊れない
-- votes の UNIQUE は、重複した行があると付けられない（エラー 1062）。流す前に下の「確かめ」の1つ目が 0 件であること

-- 確かめ（流す前）：同じ回答で同じ候補への賛成が2行以上ある組の数。0 であること
-- SELECT COUNT(*) FROM (SELECT 1 FROM votes GROUP BY share_id, product_id, answer_id HAVING COUNT(*) > 1) t;

-- votes：⑤の賛成の数・理由の集計（comments との結合）・回答した人数は、どれも share_id から探す。
--   3列そろえると、表の本体を読まずにインデックスだけで答えが出る。
--   UNIQUE にして「1回の回答で、同じ候補への賛成は1行まで」（ADR-0014）を DB でも守る
ALTER TABLE votes ADD UNIQUE INDEX uq_votes_share_product_answer (share_id, product_id, answer_id);

-- comments：⑤の理由・ひとことの集計が share_id で探す
ALTER TABLE comments ADD INDEX idx_comments_share_product (share_id, product_id);

-- purchase_clicks：KPI（購入ボタンが押された割合）を共有リストごとに出すときに使う
ALTER TABLE purchase_clicks ADD INDEX idx_clicks_share (share_id);

-- 確かめ（流したあと）：type が ref、key が新しいインデックスの名前になること（テスト設計 I-07）
-- SHOW INDEX FROM votes;
-- EXPLAIN SELECT product_id, COUNT(*) AS n FROM votes WHERE share_id = '<共有リストの番号>' GROUP BY product_id;
-- EXPLAIN SELECT product_id, body FROM comments WHERE share_id = '<共有リストの番号>';
