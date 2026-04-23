import uuid
from datetime import datetime, timedelta
from typing import Optional
import os

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext

import db  # seu módulo de conexão

import bcrypt

SECRET_KEY = os.getenv("SECRET_KEY", "ORF_2025_CIGS_CAUTELA_894536826978513216548732165487")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

if SECRET_KEY == "dev-secret-key-change-me":
    # Só aviso em dev. Em produção isso NÃO pode acontecer.
    print("[WARN] SECRET_KEY padrão em uso. Configure SECRET_KEY no .env / servidor.")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), password_hash.encode("utf-8")
    )


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
  to_encode = data.copy()
  expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
  to_encode.update({"exp": expire})
  return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_user_by_identity_or_name(login: str):
  conn = db.get_conn()
  cur = conn.cursor()
  # login pode ser identidade ou external_id ou até name, você decide.
  cur.execute(
    """
    SELECT id::text, name, role, password
    FROM users
    WHERE active = TRUE
      AND (identity_number = %s OR external_id = %s OR name = %s)
    """,
    (login, login, login),
  )
  row = cur.fetchone()
  conn.close()
  if not row:
    return None
  return {
    "id": row[0],
    "name": row[1],
    "role": row[2],
    "password": row[3],
  }


def get_current_user(token: str = Depends(oauth2_scheme)):
  cred_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Não autenticado",
    headers={"WWW-Authenticate": "Bearer"},
  )

  try:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id: str = payload.get("sub")
    if user_id is None:
      raise cred_exc
  except JWTError:
    raise cred_exc

  conn = db.get_conn()
  cur = conn.cursor()
  cur.execute(
    """
    SELECT id::text, name, role, active
    FROM users
    WHERE id = %s::uuid
    """,
    (user_id,),
  )
  row = cur.fetchone()
  conn.close()

  if not row or not row[3]:
    raise cred_exc

  return {
    "id": row[0],
    "name": row[1],
    "role": row[2],
  }


def require_admin(current_user = Depends(get_current_user)):
  if current_user["role"] != "ADMIN":
    raise HTTPException(status_code=403, detail="Apenas ADMIN")
  return current_user
