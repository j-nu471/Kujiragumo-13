# database.py — 班のDB（Azure Database for MySQL）につなぐ（穴なし。置いて、読む）
#
# 接続情報は .env に置く（Workbench に入れたものと同じ5つ）。コードに書かない。GitHub に上げない。
#   DB_HOST     = ホスト名（xxx.mysql.database.azure.com）
#   DB_PORT     = 3306
#   DB_USER     = 配られたユーザー名（例 tech0gen13-class1）
#   DB_PASSWORD = 班のパスワード
#   DB_NAME     = 班のDB名（例 giftia_t101 ＝ クラス1の班1）
#   DB_SSL_CA   = 配布された SSL証明書のパス（任意。入れると Workbench の「Verify CA」と同じく相手を確かめる）

import os
import threading

import pymysql
from dotenv import load_dotenv

load_dotenv()  # 同じフォルダの .env を読み、os.environ に入れる


def get_connection(autocommit: bool = False):
    """班のDBへの接続を1つ作って返す。使い終わったら close() する（execute 系が面倒を見る）。
    autocommit=True は「読むだけ」の接続用（fetch_all が使い回す。下の _read_connection）"""
    required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise EnvironmentError(f".env に設定がありません: {', '.join(missing)}（.env.example を .env にコピーして埋める）")

    # Azure は暗号化（SSL/TLS）しない接続を断る。証明書のパスがあれば、相手が Azure のサーバーかも確かめる
    ssl = {"ca": os.environ["DB_SSL_CA"]} if os.environ.get("DB_SSL_CA") else {"ssl_disabled": False}

    return pymysql.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,  # 行を {列名: 値} の形で受け取る（JSON にしやすい）
        connect_timeout=10,
        ssl=ssl,
        autocommit=autocommit,
    )


# ── 読む用の接続を使い回す（F-3：呼び出しごとの接続をやめる）──────────────────
# 検索は「件数」と「一覧」で fetch_all を2回呼ぶ。毎回 Azure へ暗号化接続を張ると遅い。
# ・スレッドごとに1本だけ持つ（FastAPI の通常の関数は別スレッドで動く。1本を共有すると同時利用で壊れる）
# ・autocommit=True にする。しないと、読んだ時点の状態（スナップショット）が残り、
#   別の接続で入った賛成が、あとから読んでも見えなくなる
# ・使う前に ping で生きているか確かめ、切れていたら張り直す（reconnect=True）
# 書き込み（execute / execute_all）は今までどおり、1回ごとに接続して commit / rollback する
_local = threading.local()


def _read_connection():
    conn = getattr(_local, "conn", None)
    if conn is not None:
        try:
            conn.ping(reconnect=True)
            return conn
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
    conn = get_connection(autocommit=True)
    _local.conn = conn
    return conn


def fetch_all(query: str, params: tuple = ()) -> list[dict]:
    """SELECT を実行して、行を dict のリストで返す。
    値は params で渡す（SQL の中の %s に入る）。文字列に直接つなげると、入力次第で DB を壊される。
    接続はスレッドごとに使い回す（閉じない）。"""
    conn = _read_connection()
    with conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchall()


def execute(query: str, params: tuple = ()) -> int:
    """【C-0追加】INSERT / UPDATE を実行して commit し、影響した行数を返す。
    値は fetch_all と同じく params で渡す（SQL の %s に入る）。commit しないと DB に確定しない。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            n = cur.execute(query, params)
        conn.commit()
        return n
    except Exception:
        conn.rollback()  # 途中で失敗したら、書きかけを取り消す
        raise
    finally:
        conn.close()


def execute_all(statements: list[tuple[str, tuple]]) -> None:
    """【B-1追加】いくつかの INSERT / UPDATE を、1つの接続で順に実行して、最後に1回だけ commit する。
    1つでも失敗したら全部を取り消す（rollback）。④の回答（votes と comments）を「全部入るか、何も入らないか」にするため。
    statements は (SQL, params) の組のリスト。値は execute と同じく params で渡す。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for query, params in statements:
                cur.execute(query, params)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
