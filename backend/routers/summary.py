# routers/summary.py — C 担当（⑤集まった声を見て買う）。実装計画 C-1
#   GET  /api/shares/{share_id}/summary         … 賛成・理由・ひとことを集計して F-08 の順に返す（F-06・F-08）
#   POST /api/shares/{share_id}/purchase-click  … 購入ボタンを押した記録を残す（F-07）
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import execute, fetch_all

router = APIRouter()
logger = logging.getLogger(__name__)

# いいと思った理由（fits=送る人にあってる／tasty=おいしそう／want=自分も欲しい）
REASON_KEYS = ("fits", "tasty", "want")


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="この共有リストは見つかりません")


def _server_error() -> HTTPException:
    # 接続情報やエラーの全文は返さない（仕様「エラー時の挙動」）
    return HTTPException(status_code=500, detail="時間をおいてもう一度お試しください")


def _share_exists(share_id: str) -> bool:
    return bool(fetch_all("SELECT 1 AS x FROM share_lists WHERE share_id = %s", (share_id,)))


def _build_summary(share_id: str) -> dict:
    # 共有リストの候補（商品名・価格は products から）
    item_rows = fetch_all(
        """SELECT i.product_id, i.position, p.product_name, p.price
           FROM share_items i JOIN products p ON p.product_id = i.product_id
           WHERE i.share_id = %s ORDER BY i.position""",
        (share_id,),
    )
    # 賛成数（商品ごと）
    votes = {
        r["product_id"]: r["n"]
        for r in fetch_all(
            "SELECT product_id, COUNT(*) AS n FROM votes WHERE share_id = %s GROUP BY product_id",
            (share_id,),
        )
    }
    # 理由の数（商品ごと・理由ごと）
    reasons: dict[str, dict[str, int]] = {}
    for r in fetch_all(
        """SELECT product_id, reason_key, COUNT(*) AS n FROM comments
           WHERE share_id = %s AND reason_key IS NOT NULL GROUP BY product_id, reason_key""",
        (share_id,),
    ):
        if r["reason_key"] in REASON_KEYS:
            reasons.setdefault(r["product_id"], {k: 0 for k in REASON_KEYS})[r["reason_key"]] = r["n"]
    # ひとこと（古い順）
    bodies: dict[str, list[str]] = {}
    for r in fetch_all(
        """SELECT product_id, body FROM comments
           WHERE share_id = %s AND body IS NOT NULL AND body <> '' ORDER BY comment_id""",
        (share_id,),
    ):
        bodies.setdefault(r["product_id"], []).append(r["body"])
    # 回答した人数 ＝ votes と comments に出てくる answer_id の種類の数（UNION は重複を1つにする）
    respondents = fetch_all(
        """SELECT COUNT(*) AS n FROM (
             SELECT answer_id FROM votes WHERE share_id = %s
             UNION
             SELECT answer_id FROM comments WHERE share_id = %s) AS a""",
        (share_id, share_id),
    )[0]["n"]

    # F-08 の順：①賛成数 → ②理由の数（3種類の合計）→ ③共有リストに入れた順（position）
    ranked = []
    for r in item_rows:
        pid = r["product_id"]
        item = {
            "id": pid,
            "name": r["product_name"],
            "price": r["price"],
            "votes": votes.get(pid, 0),
            "reasons": reasons.get(pid, {k: 0 for k in REASON_KEYS}),
            "comments": bodies.get(pid, []),
        }
        ranked.append(((-item["votes"], -sum(item["reasons"].values()), r["position"]), item))
    ranked.sort(key=lambda x: x[0])
    items = [item for _, item in ranked]

    # 1位（賛成が全部0なら null）。理由は人数がいちばん多いもの
    top = None
    if items and items[0]["votes"] > 0:
        first = items[0]
        best = max(REASON_KEYS, key=lambda k: first["reasons"][k])
        count = first["reasons"][best]
        top = {
            "id": first["id"],
            "name": first["name"],
            "votes": first["votes"],
            "reason_key": best if count > 0 else None,
            "reason_count": count,
        }
    return {"respondents": respondents, "items": items, "top": top}


@router.get("/api/shares/{share_id}/summary")
def get_summary(share_id: str):
    """集まった声（賛成数・理由の数・ひとこと）を、F-08 の順に並べて返す"""
    try:
        if not _share_exists(share_id):
            raise _not_found()
        return _build_summary(share_id)
    except HTTPException:
        raise
    except Exception:
        logger.exception("summary の集計に失敗")
        raise _server_error()


class PurchaseClick(BaseModel):
    product_id: str


@router.post("/api/shares/{share_id}/purchase-click")
def purchase_click(share_id: str, body: PurchaseClick):
    """購入ボタンを押した記録を残す（商品ページは開かない。決済もしない）"""
    try:
        if not _share_exists(share_id):
            raise _not_found()
        in_list = fetch_all(
            "SELECT 1 AS x FROM share_items WHERE share_id = %s AND product_id = %s",
            (share_id, body.product_id),
        )
        if not in_list:
            raise HTTPException(status_code=400, detail="この共有リストにない商品です")
        execute(
            "INSERT INTO purchase_clicks (share_id, product_id) VALUES (%s, %s)",
            (share_id, body.product_id),
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        logger.exception("purchase-click の保存に失敗")
        raise _server_error()