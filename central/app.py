from datetime import datetime
import base64
import io
import uuid
from typing import List, Literal, Optional

import numpy as np
from PIL import Image
from psycopg2 import Binary
import psycopg2.extras
from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    Depends,
    UploadFile,
    File,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

import db
import face_detect
import face_embed
from face_embed import compute_embedding_from_bytes
from permissions import require_permission
from auth import (
    get_current_user,
    require_admin,
    get_user_by_identity_or_name,
    verify_password,
    create_access_token,
    hash_password,
)

import logging
from uuid import uuid4

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="ORF Central")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    # allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origins=["*"],
)


@app.on_event("startup")
def startup_event():
    face_detect.load_detector()
    face_embed.load_model()
    print("Central started")


class SyncEventRequest(BaseModel):
    kiosk_code: str
    kiosk_token: str

    user_id: str
    user_name: str

    item_id: str
    action: str  # "cautela" | "descautela"

    confidence: Optional[float]  # similaridade/cosine
    captured_at: str  # ISO timestamp gerado no kiosk
    face_snapshot_b64: Optional[str]


class SyncEventResponse(BaseModel):
    stored: bool
    movement_id: str
    requires_review: bool


@app.post("/sync/event", response_model=SyncEventResponse)
def sync_event(payload: SyncEventRequest):
    # 1. autenticar kiosk
    kiosk_id = db.validate_kiosk(payload.kiosk_code, payload.kiosk_token)
    if kiosk_id is None:
        raise HTTPException(status_code=401, detail="Kiosk inválido ou não autorizado")

    # 2. inserir movement e atualizar estado atual
    movement_id, requires_review = db.insert_movement_and_update_state(
        kiosk_id=kiosk_id,
        user_id=payload.user_id,
        user_name=payload.user_name,
        item_id=payload.item_id,
        action=payload.action,
        confidence=payload.confidence,
        captured_at_iso=payload.captured_at,
        face_snapshot_b64=payload.face_snapshot_b64,
    )

    return SyncEventResponse(
        stored=True,
        movement_id=movement_id,
        requires_review=requires_review,
    )


class ItemStatus(BaseModel):
    item_id: str
    item_name: str
    serial_number: str | None = None
    description: str | None = None
    status: str
    model: str | None = None
    brand: str | None = None
    disturbance: str | None = None
    asset_number: str | None = None

    item_type_id: str | None = None
    item_type_name: str | None = None

    current_user_id: str | None = None
    current_user_name: str | None = None
    current_user_identity_number: str | None = None
    kiosk_id: str | None = None
    kiosk_name: str | None = None
    since_timestamp: str | None = None
    current_destination: str | None = None
    current_observation: str | None = None

class ItemBase(BaseModel):
    name: str
    serial_number: Optional[str] = None
    description: Optional[str] = None
    status: str = "available"
    model: Optional[str] = None
    brand: Optional[str] = None
    disturbance: Optional[str] = None
    asset_number: Optional[str] = None
    item_type_id: Optional[str] = None  # UUID em texto


class ItemCreate(ItemBase):
    # se quiser, pode limitar status aqui a certos valores
    pass


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    serial_number: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    model: Optional[str] = None
    brand: Optional[str] = None
    disturbance: Optional[str] = None
    asset_number: Optional[str] = None
    item_type_id: Optional[str] = None


class ItemOut(ItemBase):
    id: str
    created_at: str
    updated_at: str



class MovementLog(BaseModel):
    movement_id: str
    action: str
    confidence: float | None = None
    requires_review: bool
    captured_at: str
    received_at: str

    user_id: str | None = None
    user_name: str | None = None
    item_id: str | None = None
    item_name: str | None = None
    kiosk_id: str | None = None
    kiosk_code: str | None = None
    kiosk_name: str | None = None

    user_identity_number: str | None = None
    item_serial_number: str | None = None

    item_disturbance: str | None = None
    movement_disturbance: str | None = None

    logged_user_id: str | None = None
    logged_user_name: str | None = None


class ItemType(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: str
    created_at: str
    updated_at: str


class ItemTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str


class ItemTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None



# @app.get("/items/status", response_model=List[ItemStatus])
# def get_items_status(user=Depends(require_permission("items", "read"))):
#     rows = db.fetch_items_with_status()
#     # converter datetime -> isoformat pra bater com Pydantic
#     for r in rows:
#         if r.get("since_timestamp") is not None:
#             r["since_timestamp"] = r["since_timestamp"].isoformat()
#     return rows

@app.get("/items/status")
def get_items_status(
    search: str | None = Query(None),
    status: str | None = Query(None),
    item_type_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    item_id: str | None = Query(None),
    user=Depends(require_permission("items", "read")),
):
    rows, total = db.fetch_items_with_status_paginated(
        search=search,
        status=status,
        item_type_id=item_type_id,
        item_id=item_id,
        page=page,
        page_size=page_size,
    )

    for r in rows:
        if r.get("since_timestamp") is not None:
            r["since_timestamp"] = r["since_timestamp"].isoformat()

    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
    }



@app.get("/item-types", response_model=List[ItemType])
def list_item_types(user=Depends(require_permission("items", "read"))):
    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id::text, name, description, category, created_at, updated_at
        FROM item_types
        ORDER BY name
        """
    )
    rows = cur.fetchall()
    conn.close()
    return [
        ItemType(
            id=r[0],
            name=r[1],
            description=r[2],
            category=r[3],
            created_at=r[4].isoformat(),
            updated_at=r[5].isoformat(),
        )
        for r in rows
    ]


@app.post("/item-types", response_model=ItemType)
def create_item_type(
    payload: ItemTypeCreate,
    user=Depends(require_permission("items", "write")),
):
    item_type_id = str(uuid.uuid4())

    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO item_types (id, name, description, category)
        VALUES (%s::uuid, %s, %s, %s)
        RETURNING category, created_at, updated_at
        """,
        (item_type_id, payload.name, payload.description, payload.category),
    )
    category, created_at, updated_at = cur.fetchone()
    conn.commit()
    conn.close()

    return ItemType(
        id=item_type_id,
        name=payload.name,
        description=payload.description,
        category=category,
        created_at=created_at.isoformat(),
        updated_at=updated_at.isoformat(),
    )


@app.put("/item-types/{item_type_id}", response_model=ItemType)
def update_item_type(item_type_id: str, payload: ItemTypeUpdate, user=Depends(require_permission("items", "write"))):

    fields = []
    values = []

    if payload.name is not None:
        fields.append("name = %s")
        values.append(payload.name)
    if payload.description is not None:
        fields.append("description = %s")
        values.append(payload.description)
    if payload.category is not None:
        fields.append("category = %s")
        values.append(payload.category)

    if not fields:
        # Retorna o tipo atual sem mudar nada
        conn = db.get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id::text, name, description, category, created_at, updated_at
            FROM item_types WHERE id = %s::uuid
            """,
            (item_type_id,)
        )
        row = cur.fetchone()
        conn.close()
        return ItemType(
            id=row[0],
            name=row[1],
            description=row[2],
            category=row[3],
            created_at=row[4].isoformat(),
            updated_at=row[5].isoformat(),
        )

    values.append(item_type_id)

    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        f"""
        UPDATE item_types
        SET {", ".join(fields)}, updated_at = NOW()
        WHERE id = %s::uuid
        RETURNING id::text, name, description, category, created_at, updated_at
        """,
        values
    )
    row = cur.fetchone()
    conn.commit()
    conn.close()

    return ItemType(
        id=row[0],
        name=row[1],
        description=row[2],
        category=row[3],
        created_at=row[4].isoformat(),
        updated_at=row[5].isoformat(),
    )



@app.delete("/item-types/{item_type_id}")
def delete_item_type(
    item_type_id: str,
    user=Depends(require_permission("items", "write")),
):
    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM item_types WHERE id = %s::uuid",
        (item_type_id,),
    )
    conn.commit()
    conn.close()
    return {"deleted": True}


@app.get("/items", response_model=List[ItemOut])
def list_items(user=Depends(require_permission("items", "read"))):
    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
          id::text,
          name,
          serial_number,
          description,
          status,
          model,
          brand,
          disturbance,
          asset_number,
          item_type_id::text,
          created_at,
          updated_at
        FROM items
        WHERE active = true
        ORDER BY name
        """
    )
    rows = cur.fetchall()
    conn.close()

    items: list[ItemOut] = []
    for r in rows:
        items.append(
            ItemOut(
                id=r[0],
                name=r[1],
                serial_number=r[2],
                description=r[3],
                status=r[4],
                model=r[5],
                brand=r[6],
                disturbance=r[7],
                asset_number=r[8],
                item_type_id=r[9],
                created_at=r[10].isoformat(),
                updated_at=r[11].isoformat(),
            )
        )
    return items


@app.get("/items/{item_id}", response_model=ItemOut)
def get_item(
    item_id: str,
    user=Depends(require_permission("items", "read")),
):
    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT
          id::text,
          name,
          serial_number,
          description,
          status,
          model,
          brand,
          disturbance,
          asset_number,
          item_type_id::text,
          created_at,
          updated_at
        FROM items
        WHERE id = %s::uuid AND active = true
        """,
        (item_id,),
    )
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    return ItemOut(
        id=row[0],
        name=row[1],
        serial_number=row[2],
        description=row[3],
        status=row[4],
        model=row[5],
        brand=row[6],
        disturbance=row[7],
        asset_number=row[8],
        item_type_id=row[9],
        created_at=row[10].isoformat(),
        updated_at=row[11].isoformat(),
    )


@app.post("/items", response_model=ItemOut)
def create_item(
    payload: ItemCreate,
    user=Depends(require_permission("items", "write")),
):
    item_id = str(uuid.uuid4())

    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO items (
          id,
          name,
          serial_number,
          description,
          status,
          model,
          brand,
          disturbance,
          asset_number,
          item_type_id
        )
        VALUES (
          %s::uuid,
          %s, %s, %s,
          %s,
          %s, %s, %s,
          %s,
          %s::uuid
        )
        RETURNING created_at, updated_at
        """,
        (
            item_id,
            payload.name,
            payload.serial_number,
            payload.description,
            payload.status or "available",
            payload.model,
            payload.brand,
            payload.disturbance,
            payload.asset_number,
            payload.item_type_id,
        ),
    )
    created_at, updated_at = cur.fetchone()
    conn.commit()
    conn.close()

    return ItemOut(
        id=item_id,
        name=payload.name,
        serial_number=payload.serial_number,
        description=payload.description,
        status=payload.status or "available",
        model=payload.model,
        brand=payload.brand,
        disturbance=payload.disturbance,
        asset_number=payload.asset_number,
        item_type_id=payload.item_type_id,
        created_at=created_at.isoformat(),
        updated_at=updated_at.isoformat(),
    )


@app.put("/items/{item_id}")
def update_item(
    item_id: str,
    payload: ItemUpdate,
    user=Depends(require_permission("items", "write")),
):
    fields = []
    values: list[object] = []

    if payload.name is not None:
        fields.append("name = %s")
        values.append(payload.name)
    if payload.serial_number is not None:
        fields.append("serial_number = %s")
        values.append(payload.serial_number)
    if payload.description is not None:
        fields.append("description = %s")
        values.append(payload.description)
    if payload.status is not None:
        fields.append("status = %s")
        values.append(payload.status)
    if payload.model is not None:
        fields.append("model = %s")
        values.append(payload.model)
    if payload.brand is not None:
        fields.append("brand = %s")
        values.append(payload.brand)
    if payload.disturbance is not None:
        fields.append("disturbance = %s")
        values.append(payload.disturbance)
    if payload.asset_number is not None:
        fields.append("asset_number = %s")
        values.append(payload.asset_number)
    if payload.item_type_id is not None:
        fields.append("item_type_id = %s::uuid")
        values.append(payload.item_type_id)

    if not fields:
        return {"updated": False}

    values.append(item_id)

    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        f"""
        UPDATE items
        SET {", ".join(fields)}, updated_at = NOW()
        WHERE id = %s::uuid
        """,
        values,
    )
    conn.commit()
    conn.close()
    return {"updated": True}


@app.delete("/items/{item_id}")
def delete_item(
    item_id: str,
    user=Depends(require_permission("items", "write")),
):
    conn = db.get_conn()
    cur = conn.cursor()

    # Verifica se o item existe
    cur.execute("SELECT id FROM items WHERE id = %s::uuid", (item_id,))
    if cur.fetchone() is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Item não encontrado")

    # Verifica se está em posse de alguém
    cur.execute(
        "SELECT 1 FROM current_possession WHERE item_id = %s::uuid",
        (item_id,),
    )
    if cur.fetchone():
        conn.close()
        raise HTTPException(
            status_code=409,
            detail="Não é possível remover um item que está cautelado. Realize a descautela primeiro.",
        )

    # Verifica se tem histórico de movimentos — se sim, faz soft delete
    cur.execute(
        "SELECT 1 FROM movements WHERE item_id = %s::uuid LIMIT 1",
        (item_id,),
    )
    has_movements = cur.fetchone() is not None

    if has_movements:
        cur.execute(
            "UPDATE items SET active = false, updated_at = now() WHERE id = %s::uuid",
            (item_id,),
        )
        conn.commit()
        conn.close()
        return {"deleted": True, "method": "soft"}
    else:
        cur.execute("DELETE FROM items WHERE id = %s::uuid", (item_id,))
        conn.commit()
        conn.close()
        return {"deleted": True, "method": "hard"}


@app.get("/movements/recent", response_model=List[MovementLog])
def get_recent_movements(
    limit: int = Query(50, ge=1, le=200),
    user=Depends(require_permission("movements", "read")),
):
    print("user:", user)
    logger.info(f"user: {user}")
    rows = db.fetch_recent_movements(limit=limit)
    for r in rows:
        if r.get("captured_at") is not None:
            r["captured_at"] = r["captured_at"].isoformat()
        if r.get("received_at") is not None:
            r["received_at"] = r["received_at"].isoformat()
    return rows

@app.get("/movements")
def list_movements(
    search: str | None = Query(None),
    action: str | None = Query(None, regex="^(cautela|descautela)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    item_id: str | None = Query(None),
    user=Depends(require_permission("movements", "read")),
):
    rows, total = db.fetch_movements_paginated(
        search=search,
        action=action,
        page=page,
        page_size=page_size,
        item_id=item_id,
    )
    for r in rows:
        if r.get("captured_at"):
            r["captured_at"] = r["captured_at"].isoformat()
        if r.get("received_at"):
            r["received_at"] = r["received_at"].isoformat()

    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
    }



class EnrollFromImageRequest(BaseModel):
    user_id: str  # UUID já cadastrado em users
    name: str  # opcionalmente atualizar nome
    image_b64: str  # data URL ou base64 puro


def _decode_image_b64(image_b64: str) -> np.ndarray:
    # aceita "data:image/jpeg;base64,...." ou só o base64
    if "," in image_b64:
        _, b64data = image_b64.split(",", 1)
    else:
        b64data = image_b64
    data = base64.b64decode(b64data)
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return np.array(img)


@app.post("/api/enroll-from-image")
def enroll_from_image(payload: EnrollFromImageRequest):
    img = _decode_image_b64(payload.image_b64)

    face_img = face_detect.extract_face(img)
    if face_img is None:
        raise HTTPException(status_code=400, detail="Nenhum rosto único detectado")

    emb = face_embed.get_embedding(face_img)
    emb_list = [float(x) for x in emb]

    conn = db.get_conn()
    cur = conn.cursor()

    # garante que o user exista e nome esteja atualizado
    cur.execute(
        """
        INSERT INTO users (id, name, active)
        VALUES (%s::uuid, %s, TRUE)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            active = TRUE,
            updated_at = NOW();
        """,
        (payload.user_id, payload.name),
    )

    # insere template de rosto
    cur.execute(
        """
        INSERT INTO face_templates (id, user_id, embedding)
        VALUES (%s::uuid, %s::uuid, %s)
        """,
        (str(uuid.uuid4()), payload.user_id, emb_list),
    )

    conn.commit()
    conn.close()

    return {"stored": True}


class RecognizeFromImageRequest(BaseModel):
    action: Literal["cautela", "descautela"]
    item_id: str  # UUID de items
    image_b64: str  # data URL / base64
    kiosk_code: str | None = None  # opcional se quiser identificar terminal
    destination: Optional[Literal["servico", "missao", "outro"]] = None
    observation: Optional[str] = None


@app.post("/api/recognize-from-image")
def recognize_from_image(payload: RecognizeFromImageRequest, user=Depends(require_permission("terminal", "terminal")),):
    img = _decode_image_b64(payload.image_b64)
    face_img = face_detect.extract_face(img)

    if face_img is None:
        # sem rosto: nada de registro, só avisa a UI
        return {
            "matched": False,
            "reason": "no_face",
        }

    emb_now = face_embed.get_embedding(face_img)

    # buscar templates
    conn = db.get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            ft.user_id::text AS user_id,
            u.name           AS user_name,
            ft.embedding     AS embedding
        FROM face_templates ft
        JOIN users u ON u.id = ft.user_id
        WHERE u.active = TRUE
        """
    )
    rows = cur.fetchall()
    conn.close()

    known_users = [
        {
            "user_id": r["user_id"],
            "name": r["user_name"],
            "embedding": np.array(r["embedding"], dtype="float32"),
        }
        for r in rows
    ]

    best_user, best_score = face_embed.find_best_match(emb_now, known_users)
    CONF_THRESHOLD = 0.5
    matched_flag = best_score is not None and best_score >= CONF_THRESHOLD

    captured_at = datetime.now().isoformat(timespec="seconds")

    if not matched_flag:
        return {
            "matched": False,
            "reason": "no_match",
            "best_score": float(best_score) if best_score is not None else None,
            "captured_at": captured_at,
        }

    user_id = best_user["user_id"]
    user_name = best_user["name"]
    confidence = float(best_score)

    # agora só central: sem kiosk
    movement_id, requires_review = db.insert_movement_and_update_state(
        user_id=user_id,
        item_id=payload.item_id,
        action=payload.action,
        confidence=confidence,
        captured_at_iso=captured_at,
        face_snapshot_b64=payload.image_b64,
        disturbance=None,
        destination=payload.destination,
        observation=payload.observation,
        logged_user_id=user["id"],
    )


    return {
        "matched": True,
        "user_id": user_id,
        "user_name": user_name,
        "confidence": confidence,
        "action": payload.action,
        "item_id": payload.item_id,
        "captured_at": captured_at,
        "movement_id": movement_id,
        "requires_review": requires_review,
    }


@app.post("/api/users/{user_id}/photo")
async def upload_user_photo(
    user_id: str,
    file: UploadFile = File(...),
    user=Depends(require_permission("users", "write")),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Arquivo precisa ser uma imagem")

    data = await file.read()

    # proteção básica: travar em, sei lá, 5MB
    MAX_SIZE = 5 * 1024 * 1024
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Imagem muito grande")

    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE users
        SET profile_photo = %s,
            profile_photo_mime = %s,
            updated_at = NOW()
        WHERE id = %s::uuid
        """,
        (Binary(data), file.content_type, user_id),
    )
    conn.commit()
    conn.close()

    return {"ok": True}


@app.get("/api/users/{user_id}/photo")
def get_user_photo(
    user_id: str,
    user=Depends(require_permission("users", "read")),
):
    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT profile_photo, profile_photo_mime
        FROM users
        WHERE id = %s::uuid
        """,
        (user_id,),
    )
    row = cur.fetchone()
    conn.close()

    if not row or row[0] is None:
        # pode devolver uma imagem default ou 404
        raise HTTPException(status_code=404, detail="Foto não encontrada")

    data, mime = row
    return Response(content=data, media_type=mime or "image/jpeg")


@app.post("/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # por padrão, OAuth2PasswordRequestForm manda username/password
    user = get_user_by_identity_or_name(form_data.username)
    if not user or not user["password"]:
        raise HTTPException(status_code=400, detail="Credenciais inválidas")

    if not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=400, detail="Credenciais inválidas")

    token = create_access_token({"sub": user["id"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "role": user["role"],
        },
    }


@app.get("/auth/me")
def me(current_user=Depends(get_current_user)):
    return current_user


class UserCreate(BaseModel):
    name: str
    identity_number: Optional[str] = None
    om: Optional[str] = None
    observation: Optional[str] = None
    role: Literal["ADMIN", "USER", "SCMT_OM", "CMT_SU_E_S2", "STI_OM", "ARMEIRO"]
    password: str
    posto_graduacao: Literal['General de Exército',
  'General de Divisão',
  'General de Brigada',
  'Coronel',
  'Tenente-Coronel',
  'Major',
  'Capitão',
  '1º Tenente',
  '2º Tenente',
  'Aspirante a Oficial',
  'Cadete',
  'Subtenente',
  '1º Sargento',
  '2º Sargento',
  '3º Sargento',
  'Cabo',
  'Taifeiro-mor',
  'Taifeiro 1ª Classe',
  'Taifeiro 2ª Classe',
  'Soldado']


class UserUpdate(BaseModel):
    name: Optional[str] = None
    identity_number: Optional[str] = None
    om: Optional[str] = None
    observation: Optional[str] = None
    role: Optional[Literal["ADMIN", "USER", "SCMT_OM", "CMT_SU_E_S2", "STI_OM", "ARMEIRO"]] = None
    password: Optional[str] = None
    active: Optional[bool] = None
    posto_graduacao: Optional[Literal['General de Exército',
                                      'General de Divisão',
  'General de Brigada',
  'Coronel',
  'Tenente-Coronel',
  'Major',
  'Capitão',
  '1º Tenente',
  '2º Tenente',
  'Aspirante a Oficial',
  'Cadete',
  'Subtenente',
  '1º Sargento',
  '2º Sargento',
  '3º Sargento',
  'Cabo',
  'Taifeiro-mor',
  'Taifeiro 1ª Classe',
  'Taifeiro 2ª Classe',
  'Soldado']] = None


# @app.get("/users")
# def list_users(user=Depends(require_permission("users", "read"))):
#     conn = db.get_conn()
#     cur = conn.cursor()
#     cur.execute(
#         """
#         SELECT id::text, name, identity_number, om, role, active, created_at, posto_graduacao
#         FROM users
#         WHERE active = TRUE
#         ORDER BY created_at DESC
#         """
#     )
#     rows = cur.fetchall()
#     conn.close()
#     users = [
#         {
#             "id": r[0],
#             "name": r[1],
#             "identity_number": r[2],
#             "om": r[3],
#             "role": r[4],
#             "active": r[5],
#             "created_at": r[6].isoformat(),
#             "posto_graduacao": r[7],
#         }
#         for r in rows
#     ]
#     return users


@app.get("/users")
def list_users(
    search: str | None = Query(None),
    role: str | None = Query(None),
    active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user=Depends(require_permission("users", "read")),
):
    conn = db.get_conn()
    cur = conn.cursor()

    base_from = "FROM users"
    conditions = []
    params: list[object] = []

    # antes era fixo active = TRUE; agora vira filtro opcional
    if active is not None:
        conditions.append("active = %s")
        params.append(active)

    if role:
        conditions.append('"role" = %s::user_role')
        params.append(role)

    if search:
        like = f"%{search}%"
        conditions.append(
            """(
                name ILIKE %s
                OR COALESCE(identity_number, '') ILIKE %s
                OR COALESCE(om, '') ILIKE %s
                OR COALESCE(posto_graduacao::text, '') ILIKE %s
                OR id::text ILIKE %s
                OR COALESCE(observation, '') ILIKE %s
            )"""
        )
        params.extend([like, like, like, like, like, like])

    where_sql = "WHERE " + " AND ".join(conditions) if conditions else ""

    # total
    count_sql = f"SELECT COUNT(*) {base_from} {where_sql}"
    cur.execute(count_sql, params)
    total = cur.fetchone()[0]

    # page
    offset = (page - 1) * page_size
    data_sql = f"""
        SELECT id::text,
               name,
               identity_number,
               om,
               observation,
               role,
               active,
               created_at,
               posto_graduacao
        {base_from}
        {where_sql}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
    """
    cur.execute(data_sql, params + [page_size, offset])
    rows = cur.fetchall()
    conn.close()

    users = [
        {
            "id": r[0],
            "name": r[1],
            "identity_number": r[2],
            "om": r[3],
            "observation": r[4],
            "role": r[5],
            "active": r[6],
            "created_at": r[7].isoformat(),
            "posto_graduacao": r[8],
        }
        for r in rows
    ]

    return {
        "items": users,
        "total": total,
        "page": page,
        "page_size": page_size,
    }



@app.post("/users")
def create_user(
    payload: UserCreate,
    user=Depends(require_permission("users", "write")),
):
    user_id = str(uuid.uuid4())
    password_hash = hash_password(payload.password)

    conn = db.get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (
                        id, name, identity_number, om, observation, role,
                        password, active, posto_graduacao
                    )
                    VALUES (
                        %s::uuid,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s::user_role,
                        %s,
                        TRUE,
                        %s::army_rank
                    )
                    """,
                    (
                        user_id,
                        payload.name,
                        payload.identity_number,
                        payload.om,
                        payload.observation,
                        payload.role,
                        password_hash,
                        payload.posto_graduacao,
                    ),
                )
    except UniqueViolation:
        conn.rollback()
        raise HTTPException(
            status_code=400,
            detail="Já existe um usuário (ativo ou inativo) com essa identidade.",
        )
    finally:
        conn.close()

    return {"id": user_id}




@app.put("/users/{user_id}")
def update_user(
    user_id: str,
    payload: UserUpdate,
    user=Depends(require_permission("users", "write")),
):
    fields = []
    values: list[object] = []

    if payload.name is not None:
        fields.append("name = %s")
        values.append(payload.name)

    if payload.identity_number is not None:
        fields.append("identity_number = %s")
        values.append(payload.identity_number)

    if payload.om is not None:
        fields.append("om = %s")
        values.append(payload.om)

    if payload.observation is not None:
        fields.append("observation = %s")
        values.append(payload.observation)

    if payload.role is not None:
        fields.append("role = %s::user_role")
        values.append(payload.role)

    if payload.active is not None:
        fields.append("active = %s")
        values.append(payload.active)

    if payload.posto_graduacao is not None:
        fields.append("posto_graduacao = %s::army_rank")
        values.append(payload.posto_graduacao)

    if payload.password is not None:
        fields.append("password = %s")
        values.append(hash_password(payload.password))

    if not fields:
        return {"updated": False}

    values.append(user_id)

    conn = db.get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE users
                    SET {", ".join(fields)}, updated_at = NOW()
                    WHERE id = %s::uuid
                    """,
                    values,
                )
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="Usuário não encontrado")
    except UniqueViolation:
        conn.rollback()
        raise HTTPException(
            status_code=400,
            detail="Já existe outro usuário (ativo ou inativo) com essa identidade.",
        )
    finally:
        conn.close()

    return {"updated": True}




@app.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    user=Depends(require_permission("users", "write")),
):
    conn = db.get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                # limpa posse atual
                cur.execute(
                    """
                    DELETE FROM current_possession
                    WHERE user_id = %s::uuid
                    """,
                    (user_id,),
                )

                # limpa templates de rosto
                cur.execute(
                    """
                    DELETE FROM face_templates
                    WHERE user_id = %s::uuid
                    """,
                    (user_id,),
                )

                # soft delete do usuário
                cur.execute(
                    """
                    UPDATE users
                    SET active = FALSE,
                        updated_at = NOW()
                    WHERE id = %s::uuid
                    """,
                    (user_id,),
                )

                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="Usuário não encontrado")
    finally:
        conn.close()

    return {"deleted": True}


@app.post("/users/{user_id}/profile-photo")
def upload_profile_photo(
    user_id: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    user=Depends(require_permission("users", "write")),
):
    # só ADMIN ou o próprio usuário
    if current_user["role"] != "ADMIN" and current_user["id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if file.content_type not in ("image/jpeg", "image/png"):
        raise HTTPException(
            status_code=400,
            detail="Apenas JPEG ou PNG são aceitos",
        )

    image_bytes = file.file.read()

    # gera embedding
    try:
        embedding = compute_embedding_from_bytes(image_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao processar imagem: {e}",
        )

    conn = db.get_conn()
    try:
        with conn:
            with conn.cursor(
                cursor_factory=psycopg2.extras.RealDictCursor
            ) as cur:
                # atualiza foto do usuário
                cur.execute(
                    """
                    UPDATE users
                    SET profile_photo = %s,
                        profile_photo_mime = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (psycopg2.Binary(image_bytes), file.content_type, user_id),
                )

                if cur.rowcount == 0:
                    raise HTTPException(
                        status_code=404,
                        detail="Usuário não encontrado",
                    )

                # apaga templates antigos desse usuário (se quiser manter só um)
                cur.execute(
                    "DELETE FROM face_templates WHERE user_id = %s",
                    (user_id,),
                )

                # cria novo template
                cur.execute(
                    """
                    INSERT INTO face_templates (id, user_id, embedding, created_at)
                    VALUES (%s, %s, %s, NOW())
                    """,
                    (
                        str(uuid.uuid4()),
                        user_id,
                        embedding,  # DOUBLE PRECISION[]
                    ),
                )
        conn.commit()
    finally:
        conn.close()

    return {"status": "ok"}


@app.get("/users/{user_id}/profile-photo")
def get_profile_photo(
    user_id: str,
    current_user=Depends(get_current_user),
    user=Depends(require_permission("users", "read")),
):
    # se quiser, pode permitir qualquer logado ver, ou só ADMIN/mesmo user
    conn = db.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT profile_photo, profile_photo_mime
                FROM users
                WHERE id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="Foto não encontrada")

    photo_bytes, mime = row
    return Response(
        content=photo_bytes.tobytes()
        if hasattr(photo_bytes, "tobytes")
        else photo_bytes,
        media_type=mime or "image/jpeg",
    )


class ManualMovementRequest(BaseModel):
    user_id: str
    item_ids: List[str]
    action: Literal["cautela", "descautela"]
    disturbances: Optional[dict[str, str]] = None
    destination: Optional[Literal["servico", "missao", "outro"]] = None
    observation: Optional[str] = None

class TerminalMovementRequest(BaseModel):
    user_id: str
    item_ids: list[str]
    action: Literal["cautela", "descautela"]
    disturbances: dict[str, str] | None = None
    destination: Literal["servico", "missao", "outro"] | None = None
    observation: str | None = None

    # NOVO: token emitido pelo /api/recognize-user
    recognition_token: str | None = None


from fastapi import HTTPException

@app.post("/manual/movements/terminal")
def register_manual_movements(
    payload: TerminalMovementRequest,
    user=Depends(require_permission("terminal", "terminal")),
):
    # só aceita descautela se tiver token de reconhecimento
    if payload.action == "descautela":
      if not payload.recognition_token:
          raise HTTPException(
              status_code=403,
              detail="Reconhecimento facial obrigatório para descautela no terminal.",
          )

      session = db.consume_recognition_session(payload.recognition_token)
      if not session:
          raise HTTPException(
              status_code=403,
              detail="Sessão de reconhecimento facial inválida ou expirada.",
          )

      if str(session["user_id"]) != payload.user_id:
          raise HTTPException(
              status_code=403,
              detail="Token de reconhecimento não corresponde ao usuário informado.",
          )

    results = []

    for item_id in payload.item_ids:
        disturbance = None
        if payload.disturbances:
            disturbance = payload.disturbances.get(item_id)

        movement_id, requires_review = db.insert_movement_and_update_state(
            user_id=payload.user_id,
            item_id=item_id,
            action=payload.action,
            confidence=None,  # fluxo manual (sem rosto nessa etapa)
            captured_at_iso=datetime.now().isoformat(),
            face_snapshot_b64=None,
            disturbance=disturbance,
            destination=payload.destination,
            observation=payload.observation,
            logged_user_id=user["id"],
        )

        if disturbance:
            conn = db.get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE items
                SET disturbance = %s,
                    updated_at = NOW()
                WHERE id = %s::uuid
                """,
                (disturbance, item_id),
            )
            cur.execute(
                "UPDATE movements SET requires_review = TRUE WHERE id = %s::uuid",
                (movement_id,),
            )
            conn.commit()
            conn.close()
            requires_review = True

        results.append(
            {
                "item_id": item_id,
                "movement_id": movement_id,
                "requires_review": requires_review,
            }
        )

    return {"ok": True, "results": results}


@app.post("/manual/movements")
def register_manual_movements(
    payload: ManualMovementRequest,
    user=Depends(require_permission("movements", "write")),
):
    results = []

    for item_id in payload.item_ids:
        disturbance = None
        if payload.disturbances:
            disturbance = payload.disturbances.get(item_id)

        movement_id, requires_review = db.insert_movement_and_update_state(
            user_id=payload.user_id,
            item_id=item_id,
            action=payload.action,
            confidence=None,  # fluxo manual, sem rosto
            captured_at_iso=datetime.now().isoformat(),
            face_snapshot_b64=None,
            disturbance=disturbance,
            destination=payload.destination,
            observation=payload.observation,
            logged_user_id=user["id"],
        )

        if disturbance:
            conn = db.get_conn()
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE items
                SET disturbance = %s,
                    updated_at = NOW()
                WHERE id = %s::uuid
                """,
                (disturbance, item_id),
            )
            cur.execute(
                "UPDATE movements SET requires_review = TRUE WHERE id = %s::uuid",
                (movement_id,),
            )
            conn.commit()
            conn.close()
            requires_review = True

        results.append(
            {
                "item_id": item_id,
                "movement_id": movement_id,
                "requires_review": requires_review,
            }
        )

    return {"ok": True, "results": results}


class RecognizeUserRequest(BaseModel):
    image_b64: str


@app.post("/api/recognize-user")
def recognize_user(payload: RecognizeUserRequest):
    img = _decode_image_b64(payload.image_b64)
    face_img = face_detect.extract_face(img)

    captured_at = datetime.now().isoformat(timespec="seconds")

    if face_img is None:
        return {
            "matched": False,
            "reason": "no_face",
            "captured_at": captured_at,
        }

    emb_now = face_embed.get_embedding(face_img)

    conn = db.get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            ft.user_id::text AS user_id,
            u.name           AS user_name,
            ft.embedding     AS embedding
        FROM face_templates ft
        JOIN users u ON u.id = ft.user_id
        WHERE u.active = TRUE
        """
    )
    rows = cur.fetchall()
    conn.close()

    if not rows:
        return {
            "matched": False,
            "reason": "no_templates",
            "captured_at": captured_at,
        }

    known_users = [
        {
            "user_id": r["user_id"],
            "name": r["user_name"],
            "embedding": np.array(r["embedding"], dtype="float32"),
        }
        for r in rows
    ]

    best_user, best_score = face_embed.find_best_match(emb_now, known_users)
    CONF_THRESHOLD = 0.6  # o mesmo que você já ajustou no outro endpoint

    if best_score is None or best_score < CONF_THRESHOLD:
        return {
            "matched": False,
            "reason": "no_match",
            "best_score": float(best_score) if best_score is not None else None,
            "captured_at": captured_at,
        }
    
    token = db.create_recognition_session(best_user["user_id"])

    return {
        "matched": True,
        "user_id": best_user["user_id"],
        "user_name": best_user["name"],
        "confidence": float(best_score),
        "captured_at": captured_at,
        "recognition_token": token,   # <--- importante
    }


@app.get("/items/status/summary")
def get_items_summary(user=Depends(require_permission("items", "read"))):
  conn = db.get_conn()
  cur = conn.cursor()
  cur.execute("""
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'checked_out') AS emprestados,
      COUNT(*) FILTER (WHERE status = 'available')   AS disponiveis,
      COUNT(*) FILTER (WHERE status = 'maintenance') AS em_manutencao,
      COUNT(*) FILTER (WHERE status = 'lost')        AS perdidos
    FROM items
    WHERE active = true
  """)
  total, emprestados, disponiveis, maintenance, lost = cur.fetchone()
  conn.close()
  return {
    "total": int(total),
    "emprestados": int(emprestados),
    "disponiveis": int(disponiveis),
    "em_manutencao": int(maintenance),
    "perdidos": int(lost),
  }

@app.put("/item-status/{item_id}")
def update_item_status(
    item_id: str,
    status: Literal["available", "checked_out", "maintenance", "lost"],
    user=Depends(require_permission("items", "write")),
):
    conn = db.get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE items
        SET status = %s,
            updated_at = NOW()
        WHERE id = %s::uuid
        """,
        (status, item_id),
    )
    conn.commit()
    conn.close()
    return {"updated": True}


class BulkUserRow(BaseModel):
    identity_number: str
    name: str
    om: Optional[str] = None
    role: Literal["ADMIN", "USER", "SCMT_OM", "CMT_SU_E_S2", "STI_OM", "ARMEIRO"] = "USER"
    posto_graduacao: Optional[
        Literal[
            'General de Exército',
            'General de Divisão',
            'General de Brigada',
            'Coronel',
            'Tenente-Coronel',
            'Major',
            'Capitão',
            '1º Tenente',
            '2º Tenente',
            'Aspirante a Oficial',
            'Cadete',
            'Subtenente',
            '1º Sargento',
            '2º Sargento',
            '3º Sargento',
            'Cabo',
            'Taifeiro-mor',
            'Taifeiro 1ª Classe',
            'Taifeiro 2ª Classe',
            'Soldado'
        ]
    ] = "Soldado"
    active: Optional[bool] = True
    observation: Optional[str] = None

    # NOVO
    profile_photo_url: Optional[str] = None

    password: Optional[str] = None  # se não vier, usa identity_number

class BulkUserImportRequest(BaseModel):
    rows: list[BulkUserRow]


class BulkUserImportResult(BaseModel):
    identity_number: str
    status: Literal["created", "updated", "reactivated", "skipped", "error"]
    message: Optional[str] = None


import re
from typing import Tuple, Optional

import requests

def resolve_drive_direct_url(url: str) -> str:
    url = url.strip()
    if "drive.google.com" not in url:
        return url

    # formatos comuns:
    # https://drive.google.com/open?id=FILE_ID
    # https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    m = re.search(r"[?&]id=([^&]+)", url)
    if m:
        file_id = m.group(1)
    else:
        m = re.search(r"/file/d/([^/]+)/", url)
        if not m:
            return url
        file_id = m.group(1)

    # link de download direto
    return f"https://drive.google.com/uc?export=download&id={file_id}"


def fetch_image_from_url(url: str) -> Optional[Tuple[bytes, str]]:
    """
    Baixa a imagem a partir de uma URL (Drive ou direta).
    Retorna (bytes, mime_type) ou None se der errado.
    """
    if not url:
        return None

    url = url.strip()
    if not url:
        return None

    direct_url = resolve_drive_direct_url(url)

    try:
        resp = requests.get(direct_url, timeout=15)
        if resp.status_code != 200:
            print(f"Erro ao baixar imagem {url}: status {resp.status_code}")
            return None

        content_type = resp.headers.get("Content-Type", "image/jpeg")
        return resp.content, content_type
    except Exception as e:
        print(f"Erro ao baixar imagem {url}: {e}")
        return None


from face_embed import compute_embedding_from_bytes
import psycopg2

@app.post("/users/bulk-import")
def bulk_import_users(
    payload: BulkUserImportRequest,
    user=Depends(require_permission("users", "write")),
):
    conn = db.get_conn()
    results: list[BulkUserImportResult] = []

    try:
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                from auth import hash_password

                for row in payload.rows:
                    idn = row.identity_number.strip()
                    if not idn:
                        results.append(
                            BulkUserImportResult(
                                identity_number="",
                                status="skipped",
                                message="identity_number vazio",
                            )
                        )
                        continue

                    try:
                        # 1) find-or-create por identity_number (igual já fizemos)
                        cur.execute(
                            "SELECT id, active FROM users WHERE identity_number = %s",
                            (idn,),
                        )
                        existing = cur.fetchone()

                        if existing:
                            user_id = existing["id"]
                            was_active = existing["active"]

                            fields = [
                                "name = %s",
                                "om = %s",
                                "role = %s::user_role",
                                "observation = %s",
                                "posto_graduacao = %s::army_rank",
                                "active = TRUE",
                                "updated_at = NOW()",
                            ]
                            values: list[object] = [
                                row.name,
                                row.om,
                                row.role,
                                row.observation,
                                row.posto_graduacao,
                            ]

                            if row.password:
                                fields.append("password = %s")
                                values.append(hash_password(row.password))
                            else:
                                fields.append("password = %s")
                                values.append(hash_password(row.identity_number))
                        

                            values.append(user_id)

                            cur.execute(
                                f"UPDATE users SET {', '.join(fields)} WHERE id = %s::uuid",
                                values,
                            )

                            status = "reactivated" if not was_active else "updated"
                        else:
                            # senha inicial = identity_number
                            user_id = str(uuid.uuid4())
                            cur.execute(
                                """
                                INSERT INTO users (
                                    id, name, identity_number, om, observation,
                                    role, password, active, posto_graduacao
                                )
                                VALUES (
                                    %s::uuid,
                                    %s,
                                    %s,
                                    %s,
                                    %s,
                                    %s::user_role,
                                    %s,
                                    %s,
                                    %s::army_rank
                                )
                                """,
                                (
                                    user_id,
                                    row.name,
                                    idn,
                                    row.om,
                                    row.observation,
                                    row.role,
                                    hash_password(idn),  # <--- AQUI
                                    row.active if row.active is not None else True,
                                    row.posto_graduacao,
                                ),
                            )
                            status = "created"

                        # 2) Foto de perfil via URL (Google Drive)
                        if row.profile_photo_url:
                            img = fetch_image_from_url(row.profile_photo_url)
                            if img is not None:
                                image_bytes, mime = img

                                embedding = compute_embedding_from_bytes(image_bytes)

                                # limpa templates antigos
                                cur.execute(
                                    "DELETE FROM face_templates WHERE user_id = %s",
                                    (user_id,),
                                )

                                # atualiza foto
                                cur.execute(
                                    """
                                    UPDATE users
                                    SET profile_photo = %s,
                                        profile_photo_mime = %s,
                                        updated_at = NOW()
                                    WHERE id = %s::uuid
                                    """,
                                    (
                                        psycopg2.Binary(image_bytes),
                                        mime,
                                        user_id,
                                    ),
                                )

                                # insere novo template
                                cur.execute(
                                    """
                                    INSERT INTO face_templates (
                                        id, user_id, embedding, created_at
                                    )
                                    VALUES (%s::uuid, %s::uuid, %s, NOW())
                                    """,
                                    (str(uuid.uuid4()), user_id, embedding),
                                )

                        results.append(
                            BulkUserImportResult(
                                identity_number=idn,
                                status=status,
                                message=None,
                            )
                        )
                    except Exception as e:
                        results.append(
                            BulkUserImportResult(
                                identity_number=idn,
                                status="error",
                                message=str(e),
                            )
                        )

        conn.commit()
    finally:
        conn.close()

    return {"results": [r.dict() for r in results]}


from pydantic import BaseModel
from typing import List

class Relatorio1TypeSummary(BaseModel):
    material: str
    total: int
    servico: int
    cautela: int
    res_armt: int

class Relatorio1Item(BaseModel):
    item_id: str
    material: str
    description: str | None = None
    status: str

class Relatorio1Response(BaseModel):
    report_date: str
    geral: List[Relatorio1TypeSummary]
    optronico: List[Relatorio1TypeSummary]
    particular: List[Relatorio1Item]
    fora_da_carga: List[Relatorio1Item]

from datetime import date
import db
from permissions import require_permission
from fastapi import Depends

@app.get("/reports/relatorio1", response_model=Relatorio1Response)
def get_relatorio_1(
    report_date: str | None = Query(None),
    user=Depends(require_permission("items", "read")),
):
    """
    Relatório 1 (até linha 143 da planilha):
    Usa o estado atual dos itens (items + current_possession).
    report_date é só informativo no JSON (data "do relatório").
    """
    if report_date is not None:
        try:
            dt = date.fromisoformat(report_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="report_date inválida (use YYYY-MM-DD)")
    else:
        dt = date.today()

    data = db.fetch_relatorio_1(report_date=dt)
    # Pydantic já faz o cast para Relatorio1Response
    return data


RELATORIO_1_HTML = r"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <title>Relatório Diário de Material</title>
        <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            margin: 20px;
        }
        h1, h2, h3 {
            margin: 4px 0;
            text-align: center;
        }
        .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
        }
        .header-table td {
            border: 0;
            font-size: 10px;
            vertical-align: top;
        }
        .header-title {
            font-weight: bold;
            text-align: center;
        }
        .header-dates {
            text-align: right;
            font-size: 10px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            margin-bottom: 16px;
        }
        th, td {
            border: 1px solid #000;
            padding: 3px 4px;
            text-align: center;
        }
        th {
            font-weight: bold;
        }
        td.material {
            text-align: left;
        }
        .section-title {
            margin-top: 16px;
            font-weight: bold;
            text-align: left;
            text-transform: uppercase;
        }

        .signatures {
            width: 100%;
            margin-top: 32px;
        }
        .signatures td {
            border: 0;
            text-align: center;
            padding-top: 36px;
            font-size: 10px;
        }
        .sig-line {
            border-top: 1px solid #000;
            width: 100%;
            display: block;
            margin-bottom: 4px;
        }

        .small {
            font-size: 9px;
        }

        .obs-column {
            width: 18%;
        }
        </style>
    </head>
    <body>

        <!-- Cabeçalho -->
        <table class="header-table">
        <tr>
            <td class="header-title" colspan="2">
            MINISTÉRIO DA DEFESA – EXÉRCITO BRASILEIRO<br />
            CENTRO DE INSTRUÇÃO – (preencher OM)
            </td>
        </tr>
        <tr>
            <td class="small">
            Relatório diário de controle de material<br />
            Data de referência: {{ report_date }}
            </td>
            <td class="header-dates">
            Elaboração em: {{ hoje }}
            </td>
        </tr>
        </table>

        <h2>RELATÓRIO 1 – SITUAÇÃO DOS MATERIAIS</h2>

        <!-- GERAL -->
        <div class="section-title">Categoria: GERAL</div>
        <table>
        <thead>
            <tr>
            <th>Material</th>
            <th>Recolh</th>
            <th>Serviço</th>
            <th>Cautela</th>
            <th>Res Armt</th>
            <th>Total</th>
            <th class="obs-column">OBS</th>
            </tr>
        </thead>
        <tbody>
            {% if geral %}
            {% for row in geral %}
            <tr>
                <td class="material">{{ row.material }}</td>
                <!-- Recolh não é usado: deixar em branco ou 0 -->
                <td></td>
                <td>{{ row.servico }}</td>
                <td>{{ row.cautela }}</td>
                <td>{{ row.res_armt }}</td>
                <td>{{ row.total }}</td>
                <td></td>
            </tr>
            {% endfor %}
            {% else %}
            <tr>
                <td colspan="7">Nenhum material cadastrado na categoria GERAL.</td>
            </tr>
            {% endif %}
        </tbody>
        </table>

        <!-- OPTRONICO -->
        <div class="section-title">Categoria: OPTRÔNICOS</div>
        <table>
        <thead>
            <tr>
            <th>Material</th>
            <th>Recolh</th>
            <th>Serviço</th>
            <th>Cautela</th>
            <th>Res Armt</th>
            <th>Total</th>
            <th class="obs-column">OBS</th>
            </tr>
        </thead>
        <tbody>
            {% if optronico %}
            {% for row in optronico %}
            <tr>
                <td class="material">{{ row.material }}</td>
                <td></td>
                <td>{{ row.servico }}</td>
                <td>{{ row.cautela }}</td>
                <td>{{ row.res_armt }}</td>
                <td>{{ row.total }}</td>
                <td></td>
            </tr>
            {% endfor %}
            {% else %}
            <tr>
                <td colspan="7">Nenhum material cadastrado na categoria OPTRÔNICO.</td>
            </tr>
            {% endif %}
        </tbody>
        </table>

        <!-- PARTICULAR -->
        <div class="section-title">Categoria: PARTICULAR</div>
        <table>
        <thead>
            <tr>
            <th>Material</th>
            <th>Descrição</th>
            <th>Status</th>
            <th class="obs-column">OBS</th>
            </tr>
        </thead>
        <tbody>
            {% if particular %}
            {% for row in particular %}
            <tr>
                <td class="material">{{ row.material }}</td>
                <td class="material">{{ row.description or "" }}</td>
                <td>{{ row.status }}</td>
                <td></td>
            </tr>
            {% endfor %}
            {% else %}
            <tr>
                <td colspan="4">Nenhum material cadastrado na categoria PARTICULAR.</td>
            </tr>
            {% endif %}
        </tbody>
        </table>

        <!-- FORA DA CARGA -->
        <div class="section-title">Categoria: FORA DE CARGA</div>
        <table>
        <thead>
            <tr>
            <th>Material</th>
            <th>Descrição</th>
            <th>Status</th>
            <th class="obs-column">OBS</th>
            </tr>
        </thead>
        <tbody>
            {% if fora_da_carga %}
            {% for row in fora_da_carga %}
            <tr>
                <td class="material">{{ row.material }}</td>
                <td class="material">{{ row.description or "" }}</td>
                <td>{{ row.status }}</td>
                <td></td>
            </tr>
            {% endfor %}
            {% else %}
            <tr>
                <td colspan="4">Nenhum material cadastrado na categoria FORA DE CARGA.</td>
            </tr>
            {% endif %}
        </tbody>
        </table>

        <!-- Assinaturas -->
        <table class="signatures">
        <tr>
            <td>
            <span class="sig-line"></span>
            Enc Mat
            </td>
            <td>
            <span class="sig-line"></span>
            Armeiro de Dia
            </td>
        </tr>
        <tr>
            <td>
            <span class="sig-line"></span>
            Oficial de Dia
            </td>
            <td>
            <span class="sig-line"></span>
            Cmt Cia Cmt Sv
            </td>
        </tr>
        <tr>
            <td colspan="2">
            <span class="sig-line"></span>
            Sargento de Dia
            </td>
        </tr>
        </table>

    </body>
    </html>
    """


from datetime import date
from jinja2 import Template

from fastapi import Response
from fastapi.responses import HTMLResponse


RELATORIO_1_HTML = r"""
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Relatório Diário de Material</title>
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        margin: 20px;
      }
      h1, h2, h3 {
        margin: 4px 0;
        text-align: center;
      }
      .header-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 8px;
      }
      .header-table td {
        border: 0;
        font-size: 10px;
        vertical-align: top;
      }
      .header-title {
        font-weight: bold;
        text-align: center;
      }
      .header-dates {
        text-align: right;
        font-size: 10px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        margin-bottom: 16px;
      }
      th, td {
        border: 1px solid #000;
        padding: 3px 4px;
        text-align: center;
      }
      th {
        font-weight: bold;
      }
      td.material {
        text-align: left;
      }
      .section-title {
        margin-top: 16px;
        font-weight: bold;
        text-align: left;
        text-transform: uppercase;
      }

      .signatures {
        width: 100%;
        margin-top: 32px;
      }
      .signatures td {
        border: 0;
        text-align: center;
        padding-top: 36px;
        font-size: 10px;
      }
      .sig-line {
        border-top: 1px solid #000;
        width: 100%;
        display: block;
        margin-bottom: 4px;
      }

      .small {
        font-size: 9px;
      }

      .obs-column {
        width: 18%;
      }
    </style>
  </head>
  <body>

    <table class="header-table">
      <tr>
        <td class="header-title" colspan="2">
          MINISTÉRIO DA DEFESA – EXÉRCITO BRASILEIRO<br />
          CENTRO DE INSTRUÇÃO – (preencher OM)
        </td>
      </tr>
      <tr>
        <td class="small">
          Relatório diário de controle de material<br />
          Data de referência: {{ report_date }}
        </td>
        <td class="header-dates">
          Elaboração em: {{ hoje }}
        </td>
      </tr>
    </table>

    <h2>RELATÓRIO 1 – SITUAÇÃO DOS MATERIAIS</h2>

    <div class="section-title">Categoria: GERAL</div>
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th>Recolh</th>
          <th>Serviço</th>
          <th>Cautela</th>
          <th>Res Armt</th>
          <th>Total</th>
          <th class="obs-column">OBS</th>
        </tr>
      </thead>
      <tbody>
        {% if geral %}
          {% for row in geral %}
          <tr>
            <td class="material">{{ row.material }}</td>
            <td></td>
            <td>{{ row.servico }}</td>
            <td>{{ row.cautela }}</td>
            <td>{{ row.res_armt }}</td>
            <td>{{ row.total }}</td>
            <td></td>
          </tr>
          {% endfor %}
        {% else %}
          <tr>
            <td colspan="7">Nenhum material cadastrado na categoria GERAL.</td>
          </tr>
        {% endif %}
      </tbody>
    </table>

    <div class="section-title">Categoria: OPTRÔNICOS</div>
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th>Recolh</th>
          <th>Serviço</th>
          <th>Cautela</th>
          <th>Res Armt</th>
          <th>Total</th>
          <th class="obs-column">OBS</th>
        </tr>
      </thead>
      <tbody>
        {% if optronico %}
          {% for row in optronico %}
          <tr>
            <td class="material">{{ row.material }}</td>
            <td></td>
            <td>{{ row.servico }}</td>
            <td>{{ row.cautela }}</td>
            <td>{{ row.res_armt }}</td>
            <td>{{ row.total }}</td>
            <td></td>
          </tr>
          {% endfor %}
        {% else %}
          <tr>
            <td colspan="7">Nenhum material cadastrado na categoria OPTRÔNICO.</td>
          </tr>
        {% endif %}
      </tbody>
    </table>

    <div class="section-title">Categoria: PARTICULAR</div>
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th>Descrição</th>
          <th>Status</th>
          <th class="obs-column">OBS</th>
        </tr>
      </thead>
      <tbody>
        {% if particular %}
          {% for row in particular %}
          <tr>
            <td class="material">{{ row.material }}</td>
            <td class="material">{{ row.description or "" }}</td>
            <td>{{ row.status }}</td>
            <td></td>
          </tr>
          {% endfor %}
        {% else %}
          <tr>
            <td colspan="4">Nenhum material cadastrado na categoria PARTICULAR.</td>
          </tr>
        {% endif %}
      </tbody>
    </table>

    <div class="section-title">Categoria: FORA DE CARGA</div>
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th>Descrição</th>
          <th>Status</th>
          <th class="obs-column">OBS</th>
        </tr>
      </thead>
      <tbody>
        {% if fora_da_carga %}
          {% for row in fora_da_carga %}
          <tr>
            <td class="material">{{ row.material }}</td>
            <td class="material">{{ row.description or "" }}</td>
            <td>{{ row.status }}</td>
            <td></td>
          </tr>
          {% endfor %}
        {% else %}
          <tr>
            <td colspan="4">Nenhum material cadastrado na categoria FORA DE CARGA.</td>
          </tr>
        {% endif %}
      </tbody>
    </table>

    <table class="signatures">
      <tr>
        <td>
          <span class="sig-line"></span>
          Enc Mat
        </td>
        <td>
          <span class="sig-line"></span>
          Armeiro de Dia
        </td>
      </tr>
      <tr>
        <td>
          <span class="sig-line"></span>
          Oficial de Dia
        </td>
        <td>
          <span class="sig-line"></span>
          Cmt Cia Cmt Sv
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <span class="sig-line"></span>
          Sargento de Dia
        </td>
      </tr>
    </table>

  </body>
</html>
"""

@app.get("/reports/relatorio1/html", response_class=HTMLResponse)
def get_relatorio1_html(
    report_date: str | None = Query(None),
    user=Depends(require_permission("items", "read")),
):
    if report_date is not None:
        try:
            dt = date.fromisoformat(report_date)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="report_date inválida (use YYYY-MM-DD)"
            )
    else:
        dt = date.today()

    report = db.fetch_relatorio_1(report_date=dt)
    hoje_str = date.today().strftime("%d/%m/%Y")

    html_str = Template(RELATORIO_1_HTML).render(
        report_date=report["report_date"],
        geral=report.get("geral", []),
        optronico=report.get("optronico", []),
        particular=report.get("particular", []),
        fora_da_carga=report.get("fora_da_carga", []),
        hoje=hoje_str,
    )

    return HTMLResponse(content=html_str)


RELATORIO_2_HTML = r"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="utf-8" />
        <title>Anexos de Cautela - Serviço</title>
        <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
            margin: 20px;
        }
        h1, h2, h3 {
            margin: 4px 0;
            text-align: center;
        }
        .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
        }
        .header-table td {
            border: 0;
            font-size: 10px;
            vertical-align: top;
        }
        .header-title {
            font-weight: bold;
            text-align: center;
        }
        .header-dates {
            text-align: right;
            font-size: 10px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            margin-bottom: 16px;
        }
        th, td {
            border: 1px solid #000;
            padding: 3px 4px;
            text-align: center;
        }
        th {
            font-weight: bold;
        }
        td.material {
            text-align: left;
        }
        .small {
            font-size: 9px;
        }
        .obs-column {
            width: 20%;
        }
        </style>
    </head>
    <body>

        <table class="header-table">
        <tr>
            <td class="header-title">
            ANEXOS DE CAUTELA<br />
            ARMAMENTOS CAUTELADOS PARA SERVIÇO
            </td>
        </tr>
        <tr>
            <td class="small">
            Data de referência: {{ report_date }}<br />
            Emitido em: {{ hoje }}
            </td>
        </tr>
        </table>

        <table>
        <thead>
            <tr>
            <th>Tipo da Arma</th>
            <th>QTD</th>
            <th>P/G</th>
            <th>Nome</th>
            <th>Nº</th>
            <th>DESTINO</th>
            <th class="obs-column">OBS</th>
            </tr>
        </thead>
        <tbody>
            {% if groups %}
            {% for g in groups %}
                {% for item in g.itens %}
                <tr>
                    {% if loop.first %}
                    <td class="material" rowspan="{{ g.qtd }}">{{ g.tipo_arma }}</td>
                    <td rowspan="{{ g.qtd }}">{{ g.qtd }}</td>
                    {% endif %}
                    <td>{{ item.pg }}</td>
                    <td class="material">{{ item.usuario_nome }}</td>
                    <td>{{ item.numero_serie }}</td>
                    <td>SERVIÇO</td>
                    <td class="material">{{ item.observacao or "" }}</td>
                </tr>
                {% endfor %}
            {% endfor %}
            {% else %}
            <tr>
                <td colspan="7">Nenhum armamento cautelado para serviço.</td>
            </tr>
            {% endif %}
        </tbody>
        </table>

    </body>
    </html>
    """


@app.get("/reports/relatorio2/html", response_class=HTMLResponse)
def get_relatorio2_html(
    report_date: str | None = Query(None),
    user=Depends(require_permission("items", "read")),
):
    if report_date is not None:
        try:
            dt = date.fromisoformat(report_date)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="report_date inválida (use YYYY-MM-DD)",
            )
    else:
        dt = date.today()

    data = db.fetch_relatorio_2_servico(report_date=dt)
    hoje_str = date.today().strftime("%d/%m/%Y")

    html_str = Template(RELATORIO_2_HTML).render(
        report_date=data["report_date"],
        groups=data["groups"],
        hoje=hoje_str,
    )

    return HTMLResponse(content=html_str)


RELATORIO_3_HTML = r"""
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Anexos de Cautela - Missão</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        margin: 20px;
      }
      h1, h2, h3 { margin: 4px 0; text-align: center; }
      .header-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 8px;
      }
      .header-table td {
        border: 0;
        font-size: 10px;
        vertical-align: top;
      }
      .header-title { font-weight: bold; text-align: center; }
      .header-dates { text-align: right; font-size: 10px; }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        margin-bottom: 16px;
      }
      th, td {
        border: 1px solid #000;
        padding: 3px 4px;
        text-align: center;
      }
      th { font-weight: bold; }
      td.material { text-align: left; }
      .small { font-size: 9px; }
      .obs-column { width: 20%; }
    </style>
  </head>
  <body>

    <table class="header-table">
      <tr>
        <td class="header-title">
          ANEXOS DE CAUTELA<br />
          ARMAMENTOS CAUTELADOS PARA MISSÃO
        </td>
      </tr>
      <tr>
        <td class="small">
          Data de referência: {{ report_date }}<br />
          Emitido em: {{ hoje }}
        </td>
      </tr>
    </table>

    <table>
      <thead>
        <tr>
          <th>Tipo da Arma</th>
          <th>QTD</th>
          <th>P/G</th>
          <th>Nome</th>
          <th>Nº</th>
          <th>DESTINO</th>
          <th class="obs-column">OBS</th>
        </tr>
      </thead>
      <tbody>
        {% if groups %}
          {% for g in groups %}
            {% for item in g.itens %}
              <tr>
                {% if loop.first %}
                  <td class="material" rowspan="{{ g.qtd }}">{{ g.tipo_arma }}</td>
                  <td rowspan="{{ g.qtd }}">{{ g.qtd }}</td>
                {% endif %}
                <td>{{ item.pg }}</td>
                <td class="material">{{ item.usuario_nome }}</td>
                <td>{{ item.numero_serie }}</td>
                <td>MISSÃO</td>
                <td class="material">{{ item.observacao or "" }}</td>
              </tr>
            {% endfor %}
          {% endfor %}
        {% else %}
          <tr>
            <td colspan="7">Nenhum armamento cautelado para missão.</td>
          </tr>
        {% endif %}
      </tbody>
    </table>

  </body>
</html>
"""


@app.get("/reports/relatorio3/html", response_class=HTMLResponse)
def get_relatorio3_html(
    report_date: str | None = Query(None),
    user=Depends(require_permission("items", "read")),
):
    if report_date is not None:
        try:
            dt = date.fromisoformat(report_date)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="report_date inválida (use YYYY-MM-DD)",
            )
    else:
        dt = date.today()

    data = db.fetch_relatorio_3_missao(report_date=dt)
    hoje_str = date.today().strftime("%d/%m/%Y")

    html_str = Template(RELATORIO_3_HTML).render(
        report_date=data["report_date"],
        groups=data["groups"],
        hoje=hoje_str,
    )

    return HTMLResponse(content=html_str)

RELATORIO_4_HTML = r"""
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Relação de Itens Perdidos e em Manutenção</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        margin: 20px;
      }
      h1, h2, h3 { margin: 4px 0; text-align: center; }
      .header-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 8px;
      }
      .header-table td {
        border: 0;
        font-size: 10px;
        vertical-align: top;
      }
      .header-title { font-weight: bold; text-align: center; }
      .header-dates { text-align: right; font-size: 10px; }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        margin-bottom: 16px;
      }
      th, td {
        border: 1px solid #000;
        padding: 3px 4px;
        text-align: center;
      }
      th { font-weight: bold; }
      td.material { text-align: left; }
      .small { font-size: 9px; }
      .obs-column { width: 20%; }
    </style>
  </head>
  <body>

    <table class="header-table">
      <tr>
        <td class="header-title">
          RELAÇÃO DE ITENS PERDIDOS E EM MANUTENÇÃO
        </td>
      </tr>
      <tr>
        <td class="small">
          Data de referência: {{ report_date }}<br />
          Emitido em: {{ hoje }}
        </td>
      </tr>
    </table>

    <!-- TABELA DE PERDIDOS -->
    <h3>ARMAMENTOS PERDIDOS</h3>
    <table>
      <thead>
        <tr>
          <th>Tipo da Arma</th>
          <th>QTD</th>
          <th>P/G</th>
          <th>Nome</th>
          <th>Nº</th>
          <th>DESTINO</th>
          <th class="obs-column">OBS</th>
        </tr>
      </thead>
      <tbody>
        {% if perdidos %}
          {% for g in perdidos %}
            {% for item in g.itens %}
              <tr>
                {% if loop.first %}
                  <td class="material" rowspan="{{ g.qtd }}">{{ g.tipo_arma }}</td>
                  <td rowspan="{{ g.qtd }}">{{ g.qtd }}</td>
                {% endif %}
                <td>{{ item.pg or "" }}</td>
                <td class="material">{{ item.usuario_nome or "" }}</td>
                <td>{{ item.numero_serie }}</td>
                <td>{{ item.destino or "" }}</td>
                <td class="material">{{ item.observacao or "" }}</td>
              </tr>
            {% endfor %}
          {% endfor %}
        {% else %}
          <tr>
            <td colspan="7">Nenhum armamento marcado como perdido.</td>
          </tr>
        {% endif %}
      </tbody>
    </table>

    <!-- TABELA DE MANUTENÇÃO -->
    <h3>ARMAMENTOS EM MANUTENÇÃO</h3>
    <table>
      <thead>
        <tr>
          <th>Tipo da Arma</th>
          <th>QTD</th>
          <th>Nº</th>
          <th class="obs-column">DISTURBANCE</th>
        </tr>
      </thead>
      <tbody>
        {% if manutencao %}
          {% for g in manutencao %}
            {% for item in g.itens %}
              <tr>
                {% if loop.first %}
                  <td class="material" rowspan="{{ g.qtd }}">{{ g.tipo_arma }}</td>
                  <td rowspan="{{ g.qtd }}">{{ g.qtd }}</td>
                {% endif %}
                <td>{{ item.numero_serie }}</td>
                <td class="material">{{ item.disturbance or "" }}</td>
              </tr>
            {% endfor %}
          {% endfor %}
        {% else %}
          <tr>
            <td colspan="4">Nenhum armamento em manutenção.</td>
          </tr>
        {% endif %}
      </tbody>
    </table>

  </body>
</html>
"""


@app.get("/reports/relatorio4/html", response_class=HTMLResponse)
def get_relatorio4_html(
    report_date: str | None = Query(None),
    user=Depends(require_permission("items", "read")),
):
    if report_date is not None:
        try:
            dt = date.fromisoformat(report_date)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="report_date inválida (use YYYY-MM-DD)",
            )
    else:
        dt = date.today()

    data = db.fetch_relatorio_4_perdidos_manutencao(report_date=dt)
    hoje_str = date.today().strftime("%d/%m/%Y")

    html_str = Template(RELATORIO_4_HTML).render(
        report_date=data["report_date"],
        perdidos=data["perdidos"],
        manutencao=data["manutencao"],
        hoje=hoje_str,
    )

    return HTMLResponse(content=html_str)

