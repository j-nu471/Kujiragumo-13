# routers/shares.py — 共有リスト（A：じゅんちゃん）
#   POST /api/shares             ② で選んだ候補（1〜3個）から共有リストを作る（F-03）
#   GET  /api/shares/{share_id}  共有リストの候補を読む。④（B）・⑤（C）の画面も使う（F-04・F-06）
# 入出力は 仕様.md「入力と出力」、エラーの返し方は「エラー時の挙動」に合わせる。

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import execute, fetch_all

router = APIRouter()

MAX_ITEMS = 3  # 候補は3つまで（F-03）


class ShareCreate(BaseModel):
    """POST /api/shares の本文。例 {"product_ids": ["G0001", "G0002", "G0003"]}"""
    product_ids: list[str]


@router.post("/api/shares")
def create_share(body: ShareCreate):
    """選んだ候補で共有リストを作り、番号（share_id）を返す"""
    ids = body.product_ids

    # ① 入力を確かめる（どれかに当てはまれば 400。DB には何も書かない）
    if not 1 <= len(ids) <= MAX_ITEMS:
        raise HTTPException(status_code=400, detail="候補は1〜3個にしてください")
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="同じ商品が2回入っています")

    # ② 商品が products 表にあるか確かめる（U-01）。%s を ID の数だけ並べ、値は params で渡す（N-03）
    placeholders = ", ".join(["%s"] * len(ids))
    found = fetch_all(f"SELECT product_id FROM products WHERE product_id IN ({placeholders})", tuple(ids))
    if len(found) != len(ids):
        raise HTTPException(status_code=400, detail="商品の一覧にない ID があります")

    # ③ 番号を作る。連番だと他人のリストを覗けるので、推測できない UUID（36文字）にする（N-04、ADR-0007）
    share_id = str(uuid.uuid4())

    # ④ 共有リストを1行書く → ⑤ 候補を、選んだ順（position 1〜3）つきで1回の SQL でまとめて書く
    execute("INSERT INTO share_lists (share_id) VALUES (%s)", (share_id,))
    rows = ", ".join(["(%s, %s, %s)"] * len(ids))
    params = []
    for position, product_id in enumerate(ids, start=1):
        params += [share_id, product_id, position]
    execute(f"INSERT INTO share_items (share_id, product_id, position) VALUES {rows}", tuple(params))

    return {"share_id": share_id}


@router.get("/api/shares/{share_id}")
def get_share(share_id: str):
    """共有リストの候補を、入れた順に返す"""
    # ① その番号の共有リストがあるか（なければ 404）
    if not fetch_all("SELECT share_id FROM share_lists WHERE share_id = %s", (share_id,)):
        raise HTTPException(status_code=404, detail="この共有リストは見つかりません")

    # ② 候補（share_items）と商品（products）を product_id でつなぎ、商品名・価格・評価を取る
    rows = fetch_all(
        """SELECT si.position, p.product_id, p.product_name, p.price, p.rating
           FROM share_items AS si
           JOIN products AS p ON p.product_id = si.product_id
           WHERE si.share_id = %s
           ORDER BY si.position""",
        (share_id,),
    )
    # ③ 画面で使う項目名に詰め替える（検索 API の to_gift と同じ名前。評価がなければ 0）
    items = [
        {
            "id": r["product_id"],
            "name": r["product_name"],
            "price": r["price"],
            "rating": float(r["rating"]) if r["rating"] is not None else 0,
            "position": r["position"],
        }
        for r in rows
    ]
    return {"share_id": share_id, "items": items}
