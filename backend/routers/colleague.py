# routers/colleague.py — ④ 同僚の賛成・コメントを保存する API（B）
# 仕様.md「入力と出力」F-04、「エラー時の挙動」、ADR-0010（匿名・賛成は1つだけ・answer_id）
#
# POST /api/shares/{share_id}/answers
#   本文：{"vote": "G0001" または null, "comments": [{"product_id": "G0001", "reason_key": "fits", "body": "先輩っぽい"}]}
#   返す：{"ok": true}
# 名前は受け取らない・保存しない。1回の回答ごとに answer_id（UUID）を作り、votes と comments にまとめて書く。

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import execute_all, fetch_all

router = APIRouter()

# いいと思った理由の選択肢（仕様.md「データ」の comments.reason_key、N-05）
REASON_KEYS = {"fits", "tasty", "want"}
# ひとことの上限（N-05）
BODY_MAX = 200

DB_ERROR_MESSAGE = "時間をおいてもう一度お試しください"


class CommentIn(BaseModel):
    product_id: str
    reason_key: str | None = None  # 省略できる
    body: str | None = None        # 省略できる


class AnswerIn(BaseModel):
    vote: str | None = None        # 賛成した商品の ID（1つだけ）。賛成しないなら null
    comments: list[CommentIn] = []


def bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=400, detail=message)


def check_answer(answer: AnswerIn, candidates: set[str]) -> list[tuple[str, str | None, str | None]]:
    """入力を確かめて、保存するコメントを (product_id, reason_key, body) のリストで返す。
    おかしいところがあれば 400 を投げる（U-02）。DB は使わないので、単体で確かめられる。"""
    if answer.vote is not None and answer.vote not in candidates:
        raise bad_request("賛成した商品が、この共有リストの候補にありません")

    rows = []
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
        if body is not None and len(body) > BODY_MAX:  # len は画面と同じく、絵文字も1文字と数える
            raise bad_request(f"ひとことは{BODY_MAX}文字までです")
        if reason is None and body is None:
            continue  # 理由もひとことも空なら保存しない（仕様.md「データ」）
        rows.append((c.product_id, reason, body))

    if answer.vote is None and not rows:
        raise bad_request("賛成か理由を1つ以上選んでください")
    return rows


@router.post("/api/shares/{share_id}/answers")
def post_answer(share_id: str, answer: AnswerIn):
    """同僚の回答（賛成とコメント）を、1つの answer_id つきでまとめて保存する（F-04）"""
    # ① 共有リストの候補を読む（共有リストがなければ 404）
    try:
        items = fetch_all("SELECT product_id FROM share_items WHERE share_id = %s", (share_id,))
    except Exception as e:
        print(f"[answers] DB の読み込みに失敗: {type(e).__name__}")  # 接続情報やエラーの全文は出さない
        raise HTTPException(status_code=500, detail=DB_ERROR_MESSAGE)
    if not items:
        raise HTTPException(status_code=404, detail="この共有リストは見つかりません")

    # ② 入力を確かめる（おかしければ 400）
    comments = check_answer(answer, {r["product_id"] for r in items})

    # ③ answer_id を1つ作り、votes（0〜1行）と comments（0〜3行）を「全部入るか、何も入らないか」で書く
    answer_id = str(uuid.uuid4())
    statements = []
    if answer.vote is not None:
        statements.append((
            "INSERT INTO votes (share_id, product_id, answer_id) VALUES (%s, %s, %s)",
            (share_id, answer.vote, answer_id),
        ))
    for product_id, reason, body in comments:
        statements.append((
            "INSERT INTO comments (share_id, product_id, answer_id, reason_key, body) VALUES (%s, %s, %s, %s, %s)",
            (share_id, product_id, answer_id, reason, body),
        ))
    try:
        execute_all(statements)
    except Exception as e:
        print(f"[answers] DB への書き込みに失敗: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=DB_ERROR_MESSAGE)

    return {"ok": True}
