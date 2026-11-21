# routers/colleague.py — ④ 同僚の賛成・コメントを保存する API（B）
# 仕様.md「入力と出力」F-04、「エラー時の挙動」、ADR-0010（匿名・answer_id）・ADR-0013（理由の選択肢・必須）・ADR-0014（賛成はいくつでも）
#
# POST /api/shares/{share_id}/answers
#   本文：{"votes": ["G0001", "G0002"],
#          "comments": [{"product_id": "G0001", "reason_key": "wanted", "body": "先輩っぽい"},
#                       {"product_id": "G0002", "reason_key": "none"}]}
#   返す：{"ok": true}
# 賛成した候補には理由（reason_key）が必ず要る。賛成していない候補には理由を付けられない（ひとことだけなら付けられる）。
# 名前は受け取らない・保存しない。1回の回答ごとに answer_id（UUID）を作り、votes と comments にまとめて書く。

import logging
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import execute_all, fetch_all
from reasons import REASON_KEYS

router = APIRouter()
logger = logging.getLogger(__name__)

# ひとことの上限（N-05）
BODY_MAX = 200

DB_ERROR_MESSAGE = "時間をおいてもう一度お試しください"


class CommentIn(BaseModel):
    product_id: str
    reason_key: str | None = None  # 賛成した候補には必ず要る。賛成していない候補には付けない
    body: str | None = None        # 省略できる


class AnswerIn(BaseModel):
    votes: list[str] = []          # 賛成した商品の ID（0〜3つ。ADR-0014）
    comments: list[CommentIn] = []


def bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=400, detail=message)


def check_answer(answer: AnswerIn, candidates: set[str]) -> list[tuple[str, str | None, str | None]]:
    """入力を確かめて、保存するコメントを (product_id, reason_key, body) のリストで返す。
    おかしいところがあれば 400 を投げる（U-02）。DB は使わないので、単体で確かめられる。"""
    # 賛成：候補の中の商品で、同じ商品は1回だけ
    votes = set()
    for product_id in answer.votes:
        if product_id not in candidates:
            raise bad_request("賛成した商品が、この共有リストの候補にありません")
        if product_id in votes:
            raise bad_request("同じ候補に2回賛成しています")
        votes.add(product_id)

    rows = []
    reasons = {}  # 理由を選んだ候補 → 理由
    seen = set()
    for c in answer.comments:
        if c.product_id not in candidates:
            raise bad_request("コメントの商品が、この共有リストの候補にありません")
        if c.product_id in seen:
            raise bad_request("1つの候補に付けられるコメントは1つまでです")
        seen.add(c.product_id)

        reason = c.reason_key or None
        body = (c.body or "").strip() or None
        if reason is not None and reason not in REASON_KEYS:
            raise bad_request("いいと思った理由は、選択肢の中から選んでください")
        if reason is not None and c.product_id not in votes:
            raise bad_request("理由は、賛成した候補にだけ選べます")
        if body is not None and len(body) > BODY_MAX:  # len は画面と同じく、絵文字も1文字と数える
            raise bad_request(f"ひとことは{BODY_MAX}文字までです")
        if reason is not None:
            reasons[c.product_id] = reason
        if reason is None and body is None:
            continue  # 理由もひとことも空なら保存しない（仕様.md「データ」）
        rows.append((c.product_id, reason, body))

    # 賛成した候補には、理由が必ず要る（ADR-0013）
    if any(product_id not in reasons for product_id in votes):
        raise bad_request("賛成した候補の理由を選んでください")

    if not votes and not rows:
        raise bad_request("賛成を1つ以上押すか、ひとことを書いてください")
    return rows


@router.post("/api/shares/{share_id}/answers")
def post_answer(share_id: str, answer: AnswerIn):
    """同僚の回答（賛成とコメント）を、1つの answer_id つきでまとめて保存する（F-04）"""
    # ① 共有リストの候補を読む（共有リストがなければ 404）
    try:
        items = fetch_all("SELECT product_id FROM share_items WHERE share_id = %s", (share_id,))
    except Exception as e:
        logger.error("answers: DB の読み込みに失敗 (%s)", type(e).__name__)  # 接続情報やエラーの全文は出さない
        raise HTTPException(status_code=500, detail=DB_ERROR_MESSAGE)
    if not items:
        raise HTTPException(status_code=404, detail="この共有リストは見つかりません")

    # ② 入力を確かめる（おかしければ 400）
    comments = check_answer(answer, {r["product_id"] for r in items})

    # ③ answer_id を1つ作り、votes（0〜3行）と comments（0〜3行）を「全部入るか、何も入らないか」で書く
    answer_id = str(uuid.uuid4())
    statements = []
    for product_id in answer.votes:
        statements.append((
            "INSERT INTO votes (share_id, product_id, answer_id) VALUES (%s, %s, %s)",
            (share_id, product_id, answer_id),
        ))
    for product_id, reason, body in comments:
        statements.append((
            "INSERT INTO comments (share_id, product_id, answer_id, reason_key, body) VALUES (%s, %s, %s, %s, %s)",
            (share_id, product_id, answer_id, reason, body),
        ))
    try:
        execute_all(statements)
    except Exception as e:
        logger.error("answers: DB への書き込みに失敗 (%s)", type(e).__name__)
        raise HTTPException(status_code=500, detail=DB_ERROR_MESSAGE)

    return {"ok": True}
