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
import time

import pymysql
from dotenv import load_dotenv

load_dotenv()  # 同じフォルダの .env を読み、os.environ に入れる


def get_connection(autocommit: bool = False):
    """班のDBへの接続を1つ作って返す。
    ふだんは下の _connection() が、スレッドごとに1本だけ作って使い回す（autocommit=True）"""
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


# ── 接続を使い回す（F-3 #30、#35：DB との往復を減らす）─────────────────────────
# 時間のほとんどは SQL の実行ではなく、API と DB の間の往復と、新しく接続するときのあいさつ（暗号化）にかかる。
# ・読む・書くとも、スレッドごとに1本だけ持って使い回す
#   （FastAPI の通常の関数は別スレッドで動く。1本を共有すると同時利用で壊れる）
# ・autocommit=True にする。しないと、読んだ時点の状態（スナップショット）が残り、
#   別の接続で入った賛成が、あとから読んでも見えなくなる
# ・ping（生きているかの確認。これも往復1回）は、しばらく使っていなかったときだけする。
#   DB は8時間使わない接続を切る設定だが、途中のネットワークがもっと早く切ることがあるので、60秒にしておく
_local = threading.local()
IDLE_PING_SECONDS = 60

# 「接続が切れていた」ときのエラー番号（2006：サーバーがいない、2013：途中で切れた、2055：読み書きの途中で切れた）
_CONNECTION_LOST = {2006, 2013, 2055}


def _is_connection_lost(err: Exception) -> bool:
    if isinstance(err, pymysql.err.InterfaceError):  # 閉じた接続を使おうとした
        return True
    return isinstance(err, pymysql.err.OperationalError) and bool(err.args) and err.args[0] in _CONNECTION_LOST


def _drop_connection():
    """今のスレッドの接続を捨てる（次に使うとき、新しく作る）"""
    conn = getattr(_local, "conn", None)
    _local.conn = None
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass


def _connection():
    """今のスレッドの接続を返す。なければ作る。60秒以上使っていなければ、ping で確かめてから返す"""
    conn = getattr(_local, "conn", None)
    if conn is not None and time.monotonic() - _local.last_used >= IDLE_PING_SECONDS:
        try:
            conn.ping(reconnect=True)  # 切れていれば、ここでつなぎ直す
        except Exception:
            _drop_connection()
            conn = None
    if conn is None:
        conn = get_connection(autocommit=True)
        _local.conn = conn
    _local.last_used = time.monotonic()
    return conn


def fetch_all(query: str, params: tuple = ()) -> list[dict]:
    """SELECT を実行して、行を dict のリストで返す。
    値は params で渡す（SQL の中の %s に入る）。文字列に直接つなげると、入力次第で DB を壊される。
    接続はスレッドごとに使い回す（閉じない）。
    接続が切れていたら、1回だけつなぎ直してやり直す（読むだけなので、やり直しても DB の中身は変わらない）"""
    for attempt in (1, 2):
        conn = _connection()
        try:
            with conn.cursor() as cur:
                cur.execute(query, params)
                return cur.fetchall()
        except Exception as err:
            if attempt == 1 and _is_connection_lost(err):
                _drop_connection()
                continue
            raise


def _write(statements: list[tuple[str, tuple]]) -> int:
    """INSERT / UPDATE を順に実行して確定し、最後の文で影響した行数を返す。
    ・1つだけのとき：autocommit のまま流す（1つの文は、全部入るか何も入らないかのどちらか。往復が1回で済む）
    ・2つ以上のとき：begin で始めて、最後に1回だけ commit。1つでも失敗したら全部を取り消す（rollback）
    書き込みは、失敗してもやり直さない（どこまで入ったか分からないまま流すと、二重に入るおそれがある）"""
    conn = _connection()
    many = len(statements) > 1
    try:
        if many:
            conn.begin()
        n = 0
        with conn.cursor() as cur:
            for query, params in statements:
                n = cur.execute(query, params)
        if many:
            conn.commit()
        return n
    except Exception as err:
        if many:
            try:
                conn.rollback()  # 途中で失敗したら、書きかけを取り消す
            except Exception:
                _drop_connection()  # 取り消せないほど壊れた接続は捨てる（DB 側でも、切れた接続の書きかけは取り消される）
        if _is_connection_lost(err):
            _drop_connection()
        raise


def execute(query: str, params: tuple = ()) -> int:
    """【C-0追加】INSERT / UPDATE を1つ実行して確定し、影響した行数を返す。
    値は fetch_all と同じく params で渡す（SQL の %s に入る）。"""
    return _write([(query, params)])


def execute_all(statements: list[tuple[str, tuple]]) -> None:
    """【B-1追加】いくつかの INSERT / UPDATE を、1つの接続で順に実行して、最後に1回だけ commit する。
    1つでも失敗したら全部を取り消す（rollback）。④の回答（votes と comments）を「全部入るか、何も入らないか」にするため。
    statements は (SQL, params) の組のリスト。値は execute と同じく params で渡す。"""
    _write(statements)
