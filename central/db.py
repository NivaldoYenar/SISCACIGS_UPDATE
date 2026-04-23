import os
import uuid
import psycopg2
import psycopg2.extras
from datetime import datetime



DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/orf",
)


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def validate_kiosk(kiosk_code: str, kiosk_token: str):
    """
    Retorna kiosk_id (string UUID) se válido, senão None.
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute(
        """
        SELECT id::text
        FROM kiosks
        WHERE code = %s
          AND secret_token = %s
          AND active = TRUE
        """,
        (kiosk_code, kiosk_token),
    )
    row = cur.fetchone()
    conn.close()
    return row["id"] if row else None

def change_status_of_item(item_id: str, new_status: str):
    """
    Atualiza o status do item.
    """
    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE items
                    SET status = %s,
                        updated_at = NOW()
                    WHERE id = %s::uuid
                    """,
                    (new_status, item_id),
                )
    finally:
        conn.close()


def insert_movement_and_update_state(
    # kiosk_id: str | None,
    user_id: str,
    # user_name: str,
    item_id: str,
    action: str,
    confidence,
    captured_at_iso: str,
    face_snapshot_b64: str | None,
    disturbance: str | None = None,
    destination: str | None = None,
    observation: str | None = None,
    logged_user_id: str | None = None,
):
    """
    1. Insere linha em movements (incluindo snapshot da disturbance)
    2. Atualiza current_possession + status do item
    3. Atualiza items.disturbance na descautela (quando informado)
    4. Retorna (movement_id, requires_review)
    """

    # MESMO threshold que você já está usando
    CONF_THRESHOLD = 0.6
    requires_review = confidence is None or confidence < CONF_THRESHOLD

    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                movement_id = str(uuid.uuid4())
                captured_dt = datetime.fromisoformat(captured_at_iso)

                # disturbance atual do item no banco
                cur.execute(
                    "SELECT disturbance FROM items WHERE id = %s::uuid",
                    (item_id,),
                )
                row = cur.fetchone()
                current_disturbance = row[0] if row else None

                # o que vamos gravar na tabela movements
                disturbance_to_save = disturbance if disturbance is not None else current_disturbance

                # 1) INSERT em movements, agora com coluna disturbance
                cur.execute(
                    """
                    INSERT INTO movements (
                        id, user_id, item_id,
                        action, confidence, requires_review,
                        captured_at, face_snapshot_b64, disturbance, logged_user_id
                    )
                    VALUES (
                        %s,
                        %s::uuid,
                        %s::uuid,
                        
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s::uuid
                    )
                    """,
                    (
                        movement_id,
                        user_id,
                        item_id,
                        # kiosk_id if kiosk_id is not None else None,
                        action,
                        confidence,
                        requires_review,
                        captured_dt,
                        face_snapshot_b64,
                        disturbance_to_save,
                        logged_user_id,
                    ),
                )

                # 2) pega posse atual
                cur.execute(
                    """
                    SELECT user_id
                    FROM current_possession
                    WHERE item_id = %s::uuid
                    """,
                    (item_id,),
                )
                row = cur.fetchone()
                current_holder_user_id = row[0] if row else None

                if action == "cautela":

                    cur.execute(
                        """
                        UPDATE items
                        SET status = 'checked_out',
                            updated_at = NOW()
                        WHERE id = %s::uuid
                        """,
                        (item_id,),
                    )
                    # default de destino se não vier nada
                    if destination is None:
                        destination_to_save = "servico"
                    else:
                        destination_to_save = destination

                    cur.execute(
                        """
                        INSERT INTO current_possession (
                            item_id,
                            user_id,
                            since_timestamp,
                            destination,
                            observation
                        )
                        VALUES (%s::uuid, %s::uuid, %s, %s, %s)
                        ON CONFLICT (item_id) DO UPDATE
                        SET user_id      = EXCLUDED.user_id,
                            since_timestamp = EXCLUDED.since_timestamp,
                            destination  = EXCLUDED.destination,
                            observation  = EXCLUDED.observation,
                            updated_at   = NOW()
                        """,
                        (item_id, user_id, captured_dt, destination_to_save, observation),
                    )


                elif action == "descautela":
                    # só devolve de fato se o item estiver em posse desse usuário
                    if current_holder_user_id is None:
                        requires_review = True
                    elif current_holder_user_id != user_id:
                        requires_review = True
                    else:
                        # devolução normal
                        cur.execute(
                            "DELETE FROM current_possession WHERE item_id = %s::uuid",
                            (item_id,),
                        )
                        cur.execute(
                            """
                            UPDATE items
                            SET status = 'available',
                                updated_at = NOW()
                            WHERE id = %s::uuid
                            """,
                            (item_id,),
                        )

                    # se veio nova disturbance, atualiza o item
                    if disturbance is not None and disturbance.strip():
                        d_clean = disturbance.strip()
                        cur.execute(
                            """
                            UPDATE items
                            SET disturbance = %s,
                                updated_at = NOW()
                            WHERE id = %s::uuid
                            """,
                            (d_clean, item_id),
                        )
                        # e garante que a movement tenha essa versão nova
                        cur.execute(
                            """
                            UPDATE movements
                            SET disturbance = %s
                            WHERE id = %s
                            """,
                            (d_clean, movement_id),
                        )

                # se requires_review ficou true depois da lógica de posse, reflete na movement
                if requires_review:
                    cur.execute(
                        """
                        UPDATE movements
                        SET requires_review = TRUE
                        WHERE id = %s
                        """,
                        (movement_id,),
                    )

        return movement_id, requires_review
    finally:
        conn.close()




def fetch_recent_movements(limit: int = 50):
    """
    Retorna últimos movimentos (log) com nomes resolvidos.
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            m.id::text           AS movement_id,
            m.action,
            m.confidence,
            m.requires_review,
            m.captured_at,
            m.received_at,
            m.disturbance       AS movement_disturbance,

            m.user_id::text      AS user_id,
            u.name               AS user_name,
            u.identity_number    AS user_identity_number,

            m.item_id::text      AS item_id,
            i.name               AS item_name,
            i.serial_number      AS item_serial_number,
            i.disturbance        AS item_disturbance,

            m.kiosk_id::text     AS kiosk_id,
            k.code               AS kiosk_code,
            k.name               AS kiosk_name,

            m.logged_user_id::text AS logged_user_id,
            lu.name                AS logged_user_name
        FROM movements m
        LEFT JOIN users  u ON u.id = m.user_id
        LEFT JOIN items  i ON i.id = m.item_id
        LEFT JOIN kiosks k ON k.id = m.kiosk_id
        LEFT JOIN users  lu ON lu.id = m.logged_user_id
        ORDER BY m.captured_at DESC
        LIMIT %s;
        """,
        (limit,),
    )
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def fetch_items_with_status():
    """
    Retorna lista de itens com status, tipo e, se estiver emprestado,
    quem está com ele e em qual kiosk.
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            i.id::text            AS item_id,
            i.name                AS item_name,
            i.serial_number,
            i.description,
            i.status,
            i.model,
            i.brand,
            i.disturbance,
            i.asset_number,
            i.item_type_id::text  AS item_type_id,
            it.name               AS item_type_name,

            cp.user_id::text      AS current_user_id,
            u.name                AS current_user_name,
            u.identity_number     AS current_user_identity_number,
            cp.kiosk_id::text     AS kiosk_id,
            k.name                AS kiosk_name,
            cp.since_timestamp,
            cp.destination        AS current_destination,
            cp.observation        AS current_observation
        FROM items i
        LEFT JOIN current_possession cp ON cp.item_id = i.id
        LEFT JOIN users u              ON u.id = cp.user_id
        LEFT JOIN kiosks k             ON k.id = cp.kiosk_id
        LEFT JOIN item_types it        ON it.id = i.item_type_id
        WHERE i.active = TRUE
        ORDER BY i.name;
        """
    )
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# db.py

def fetch_items_with_status_paginated(
    search: str | None,
    status: str | None,
    item_type_id: str | None,
    item_id: str | None,
    page: int,
    page_size: int,
):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    base_from = """
        FROM items i
        LEFT JOIN current_possession cp ON cp.item_id = i.id
        LEFT JOIN users u              ON u.id = cp.user_id
        LEFT JOIN kiosks k             ON k.id = cp.kiosk_id
        LEFT JOIN item_types it        ON it.id = i.item_type_id
    """

    conditions = ["i.active = TRUE"]
    params: list[object] = []

    if status:
        conditions.append("i.status = %s")
        params.append(status)

    if item_type_id:
        conditions.append("i.item_type_id = %s::uuid")
        params.append(item_type_id)

    if item_id:
        conditions.append("i.id = %s::uuid")
        params.append(item_id)

    if search:
        like = f"%{search}%"
        conditions.append(
            """(
                i.name ILIKE %s
                OR COALESCE(i.serial_number, '') ILIKE %s
                OR COALESCE(it.name, '') ILIKE %s
                OR COALESCE(u.name, '') ILIKE %s
                OR COALESCE(u.identity_number, '') ILIKE %s
            )"""
        )
        params.extend([like, like, like, like, like])

    where_sql = ""
    if conditions:
        where_sql = "WHERE " + " AND ".join(conditions)

    # total
    count_sql = f"SELECT COUNT(*) {base_from} {where_sql}"
    cur.execute(count_sql, params)
    total = cur.fetchone()["count"]

    # page
    offset = (page - 1) * page_size
    data_sql = f"""
        SELECT
            i.id::text            AS item_id,
            i.name                AS item_name,
            i.serial_number,
            i.description,
            i.status,
            i.model,
            i.brand,
            i.disturbance,
            i.asset_number,
            i.item_type_id::text  AS item_type_id,
            it.name               AS item_type_name,
            cp.user_id::text      AS current_user_id,
            u.name                AS current_user_name,
            u.identity_number     AS current_user_identity_number,
            cp.kiosk_id::text     AS kiosk_id,
            k.name                AS kiosk_name,
            cp.since_timestamp,
            cp.destination        AS current_destination,
            cp.observation        AS current_observation
        {base_from}
        {where_sql}
        ORDER BY i.name
        LIMIT %s OFFSET %s
    """
    cur.execute(data_sql, params + [page_size, offset])
    rows = cur.fetchall()
    conn.close()

    return [dict(r) for r in rows], int(total)


def fetch_movements_paginated(
    search: str | None,
    action: str | None,
    page: int,
    page_size: int,
    item_id: str | None = None,
):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    base_from = """
        FROM movements m
        LEFT JOIN users  u ON u.id = m.user_id
        LEFT JOIN items  i ON i.id = m.item_id
        LEFT JOIN kiosks k ON k.id = m.kiosk_id
        LEFT JOIN users  lu ON lu.id = m.logged_user_id
    """

    conditions = []
    params: list[object] = []

    if item_id:
        conditions.append("m.item_id = %s::uuid")
        params.append(item_id)

    if action in ("cautela", "descautela"):
        conditions.append("m.action = %s")
        params.append(action)

    if search:
        like = f"%{search}%"
        conditions.append(
            """(
                COALESCE(u.name, '') ILIKE %s
                OR COALESCE(u.identity_number, '') ILIKE %s
                OR COALESCE(i.name, '') ILIKE %s
                OR COALESCE(i.serial_number, '') ILIKE %s
                OR COALESCE(k.name, '') ILIKE %s
            )"""
        )
        params.extend([like, like, like, like, like])

    where_sql = "WHERE " + " AND ".join(conditions) if conditions else ""

    # total
    count_sql = f"SELECT COUNT(*) {base_from} {where_sql}"
    cur.execute(count_sql, params)
    total = cur.fetchone()["count"]

    # page
    offset = (page - 1) * page_size
    data_sql = f"""
        SELECT
            m.id::text           AS movement_id,
            m.action,
            m.confidence,
            m.requires_review,
            m.captured_at,
            m.received_at,
            m.disturbance       AS movement_disturbance,
            m.user_id::text      AS user_id,
            u.name               AS user_name,
            u.identity_number    AS user_identity_number,
            m.item_id::text      AS item_id,
            i.name               AS item_name,
            i.serial_number      AS item_serial_number,
            i.disturbance        AS item_disturbance,
            m.kiosk_id::text     AS kiosk_id,
            k.code               AS kiosk_code,
            k.name               AS kiosk_name,
            m.logged_user_id::text AS logged_user_id,
            lu.name                AS logged_user_name
        {base_from}
        {where_sql}
        ORDER BY m.captured_at DESC
        LIMIT %s OFFSET %s
    """
    cur.execute(data_sql, params + [page_size, offset])
    rows = cur.fetchall()
    conn.close()

    return [dict(r) for r in rows], int(total)


from datetime import datetime, date

import psycopg2.extras

def fetch_relatorio_1(report_date: date | None = None):
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # GERAL
    cur.execute(
        """
        SELECT
            it.name AS material,
            COUNT(*) FILTER (
                WHERE i.status IN ('available', 'checked_out')
            ) AS total,
            COUNT(*) FILTER (
                WHERE i.status = 'checked_out'
                  AND cp.destination = 'servico'
            ) AS servico,
            COUNT(*) FILTER (
                WHERE i.status = 'checked_out'
                  AND cp.destination IN ('missao', 'outro')
            ) AS cautela,
            COUNT(*) FILTER (
                WHERE i.status = 'available'
            ) AS res_armt
        FROM items i
        JOIN item_types it ON it.id = i.item_type_id
        LEFT JOIN current_possession cp ON cp.item_id = i.id
        WHERE it.category = 'GERAL' AND i.active = TRUE
        GROUP BY it.name
        ORDER BY it.name;
        """
    )
    geral = [dict(r) for r in cur.fetchall()]

    # OPTRONICO
    cur.execute(
        """
        SELECT
            it.name AS material,
            COUNT(*) FILTER (
                WHERE i.status IN ('available', 'checked_out')
            ) AS total,
            COUNT(*) FILTER (
                WHERE i.status = 'checked_out'
                  AND cp.destination = 'servico'
            ) AS servico,
            COUNT(*) FILTER (
                WHERE i.status = 'checked_out'
                  AND cp.destination IN ('missao', 'outro')
            ) AS cautela,
            COUNT(*) FILTER (
                WHERE i.status = 'available'
            ) AS res_armt
        FROM items i
        JOIN item_types it ON it.id = i.item_type_id
        LEFT JOIN current_possession cp ON cp.item_id = i.id
        WHERE it.category = 'OPTRONICO'
        GROUP BY it.name
        ORDER BY it.name;
        """
    )
    optronico = [dict(r) for r in cur.fetchall()]

    # PARTICULAR
    cur.execute(
        """
        SELECT
            i.id::text      AS item_id,
            i.name          AS material,
            i.description   AS description,
            i.status        AS status
        FROM items i
        JOIN item_types it ON it.id = i.item_type_id
        WHERE it.category = 'PARTICULAR'
        ORDER BY i.name;
        """
    )
    particular = [dict(r) for r in cur.fetchall()]

    # FORA_DA_CARGA
    cur.execute(
        """
        SELECT
            i.id::text      AS item_id,
            i.name          AS material,
            i.description   AS description,
            i.status        AS status
        FROM items i
        JOIN item_types it ON it.id = i.item_type_id
        WHERE it.category = 'FORA_DA_CARGA'
        ORDER BY i.name;
        """
    )
    fora_da_carga = [dict(r) for r in cur.fetchall()]

    conn.close()

    from datetime import date as _date
    if report_date is None:
        report_date = _date.today()

    return {
        "report_date": report_date.isoformat(),
        "geral": geral,
        "optronico": optronico,
        "particular": particular,
        "fora_da_carga": fora_da_carga,
    }


from itertools import groupby
import psycopg2.extras


def fetch_relatorio_2_servico(report_date: date | None = None):
    """
    Relatório 2 – Armamentos cautelados para serviço.

    Filtra:
      - current_possession.destination = 'servico'
      - items.status = 'checked_out'

    Retorna grupos por tipo de arma, com lista de militares + armas.
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT
            it.name                   AS tipo_arma,
            u.posto_graduacao::text   AS pg,
            u.name                    AS usuario_nome,
            COALESCE(i.serial_number, '') AS numero_serie,
            cp.observation            AS observacao
        FROM items i
        JOIN item_types it       ON it.id = i.item_type_id
        JOIN current_possession cp ON cp.item_id = i.id
        JOIN users u             ON u.id = cp.user_id
        WHERE cp.destination = 'servico'
          AND i.status = 'checked_out'
        ORDER BY it.name, u.posto_graduacao::text, u.name, i.serial_number;
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    if report_date is None:
        report_date = date.today()

    # Agrupar por tipo_arma pra fazer as células com rowspan no HTML
    groups: list[dict] = []
    for tipo_arma, grp in groupby(rows, key=lambda r: r["tipo_arma"]):
        itens = list(grp)
        groups.append(
            {
                "tipo_arma": tipo_arma,
                "qtd": len(itens),
                "itens": itens,
            }
        )

    return {
        "report_date": report_date.isoformat(),
        "groups": groups,
    }


def fetch_relatorio_3_missao(report_date: date | None = None):
    """
    Relatório 3 – Armamentos cautelados para MISSÃO.

    Filtra:
      - current_possession.destination = 'missao'
      - items.status = 'checked_out'
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT
            it.name                       AS tipo_arma,
            u.posto_graduacao::text       AS pg,
            u.name                        AS usuario_nome,
            COALESCE(i.serial_number, '') AS numero_serie,
            cp.observation                AS observacao
        FROM items i
        JOIN item_types it         ON it.id = i.item_type_id
        JOIN current_possession cp ON cp.item_id = i.id
        JOIN users u               ON u.id = cp.user_id
        WHERE cp.destination = 'missao'
          AND i.status = 'checked_out'
        ORDER BY it.name, u.posto_graduacao::text, u.name, i.serial_number;
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    if report_date is None:
        report_date = date.today()

    groups: list[dict] = []
    for tipo_arma, grp in groupby(rows, key=lambda r: r["tipo_arma"]):
        itens = list(grp)
        groups.append(
            {
                "tipo_arma": tipo_arma,
                "qtd": len(itens),
                "itens": itens,
            }
        )

    return {
        "report_date": report_date.isoformat(),
        "groups": groups,
    }

from itertools import groupby
import psycopg2.extras
from datetime import date


def fetch_relatorio_4_perdidos_manutencao(report_date: date | None = None):
    """
    Relatório 4 – Itens PERDIDOS e em MANUTENÇÃO.

    - Perdidos:
        i.status = 'lost'
        junta com current_possession + users para pegar P/G, nome, destino, observação
    - Manutenção:
        i.status = 'maintenance'
        pega número de série + disturbance do item
    """
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # ----- PERDIDOS -----
    cur.execute(
        """
        SELECT
            it.name                       AS tipo_arma,
            u.posto_graduacao::text       AS pg,
            u.name                        AS usuario_nome,
            COALESCE(i.serial_number, '') AS numero_serie,
            cp.destination                AS destino,
            cp.observation                AS observacao
        FROM items i
        JOIN item_types it         ON it.id = i.item_type_id
        LEFT JOIN current_possession cp ON cp.item_id = i.id
        LEFT JOIN users u               ON u.id = cp.user_id
        WHERE i.status = 'lost' AND i.active = TRUE
        ORDER BY it.name, u.posto_graduacao::text, u.name, i.serial_number;
        """
    )
    lost_rows = [dict(r) for r in cur.fetchall()]

    lost_groups: list[dict] = []
    for tipo_arma, grp in groupby(lost_rows, key=lambda r: r["tipo_arma"]):
        itens = list(grp)
        lost_groups.append(
            {
                "tipo_arma": tipo_arma,
                "qtd": len(itens),
                "itens": itens,
            }
        )

    # ----- MANUTENÇÃO -----
    cur.execute(
        """
        SELECT
            it.name                       AS tipo_arma,
            COALESCE(i.serial_number, '') AS numero_serie,
            i.disturbance                 AS disturbance
        FROM items i
        JOIN item_types it ON it.id = i.item_type_id
        WHERE i.status = 'maintenance'
        ORDER BY it.name, i.serial_number;
        """
    )
    maint_rows = [dict(r) for r in cur.fetchall()]

    maint_groups: list[dict] = []
    for tipo_arma, grp in groupby(maint_rows, key=lambda r: r["tipo_arma"]):
        itens = list(grp)
        maint_groups.append(
            {
                "tipo_arma": tipo_arma,
                "qtd": len(itens),
                "itens": itens,
            }
        )

    conn.close()

    if report_date is None:
        report_date = date.today()

    return {
        "report_date": report_date.isoformat(),
        "perdidos": lost_groups,
        "manutencao": maint_groups,
    }


import uuid
from datetime import datetime, timezone

def create_recognition_session(user_id: str) -> str:
    token = str(uuid.uuid4())
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO recognition_sessions (id, user_id, created_at, expires_at)
        VALUES (%s::uuid, %s::uuid, NOW(), NOW() + INTERVAL '2 minutes')
        """,
        (token, user_id),
    )
    conn.commit()
    conn.close()
    return token

def consume_recognition_session(token: str) -> dict | None:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, user_id, created_at, expires_at, used
        FROM recognition_sessions
        WHERE id = %s::uuid
        """,
        (token,),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        return None

    session = {
        "id": row[0],
        "user_id": row[1],
        "created_at": row[2],   # timezone-aware (timestamptz)
        "expires_at": row[3],   # timezone-aware
        "used": row[4],
    }

    # usa um "agora" timezone-aware também
    now = datetime.now(timezone.utc)

    if session["used"] or session["expires_at"] < now:
        conn.close()
        return None

    cur.execute(
        "UPDATE recognition_sessions SET used = TRUE WHERE id = %s::uuid",
        (token,),
    )
    conn.commit()
    conn.close()
    return session