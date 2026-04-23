#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Popula a tabela public.items a partir de um JSON.

Exemplo de formato esperado de cada item no JSON:
{
  "nr_patrimonio": "101601400057962",
  "nr_serie_mat": "003123",
  "tipo": "Algum tipo" ou "null",
  "nome": "TELEMETRO LASER",
  "descricao": "MARCA: BUSHNELL CORPORATION; MODELO: YARDAGE PRO 400."
}

Mapeamento:
- id            -> uuid gerado
- name          -> campo "nome" (fallback: tipo ou texto fixo)
- serial_number -> nr_serie_mat (None se "null", "", "NP")
- description   -> campo "descricao"
- asset_number  -> nr_patrimonio
- item_type_id  -> id em item_types.name = tipo (se tipo != "null"), senao None
"""

import os
import json
import uuid
from pathlib import Path
import asyncio
import asyncpg

# ==============================
# CONFIGURACAO
# ==============================

DB_DSN = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:senha123@localhost:5432/cigsdb",
)

# nome do seu json
JSON_PATH = "itens_reserva.json"


async def seed_items_from_json(conn: asyncpg.Connection, items):
    inserted = 0
    missing_type = 0
    skipped_dup_serial = 0

    # controla duplicacao dentro do proprio JSON
    seen_serials = set()

    for item in items:
        nr_patrimonio = item.get("nr_patrimonio")
        nr_serie_mat = item.get("nr_serie_mat")
        tipo = item.get("tipo")
        nome = item.get("nome", "")
        descricao = item.get("descricao", "")

        # serial_number: se "null", "", "NP" vira None
        if nr_serie_mat in (None, "", "null", "NP"):
            serial_number = None
        else:
            serial_number = str(nr_serie_mat).strip()

        # se serial_number ja apareceu no JSON, pula esse item
        if serial_number is not None:
            if serial_number in seen_serials:
                skipped_dup_serial += 1
                print(f"[INFO] serial_number duplicado no JSON, pulando: {serial_number}")
                continue
            seen_serials.add(serial_number)

        # name (obrigatorio): prioridade nome -> tipo -> fallback
        if nome and str(nome).strip():
            name = str(nome).strip()
        elif tipo and isinstance(tipo, str) and tipo.strip().lower() != "null":
            name = str(tipo).strip()
        else:
            name = "ITEM SEM NOME"

        # description: usa descricao (pode ser None)
        description = descricao or None

        # item_type_id: se tipo definido, tenta achar em item_types
        item_type_id = None
        if tipo and isinstance(tipo, str) and tipo.strip().lower() != "null":
            row = await conn.fetchrow(
                "select id from public.item_types where name = $1",
                tipo,
            )
            if row:
                item_type_id = row["id"]
            else:
                missing_type += 1
                print(f"[WARN] tipo nao encontrado em item_types: {tipo!r}")

        item_id = uuid.uuid4()

        tag = await conn.execute(
            """
            insert into public.items (
                id,
                name,
                serial_number,
                description,
                asset_number,
                item_type_id
            )
            values ($1, $2, $3, $4, $5, $6)
            on conflict (serial_number) do nothing
            """,
            item_id,
            name,
            serial_number,
            description,
            nr_patrimonio,
            item_type_id,
        )

        # tag vem algo como 'INSERT 0 1' ou 'INSERT 0 0'
        if tag.endswith(" 1"):
            inserted += 1

    print(f"Items processados: {len(items)}")
    print(f"Items efetivamente inseridos: {inserted}")
    print(f"Items com serial_number duplicado no JSON (pulados): {skipped_dup_serial}")
    print(f"Items cujo tipo nao foi encontrado em item_types: {missing_type}")


async def main():
    # carregar JSON
    path = Path(JSON_PATH)
    if not path.exists():
        raise FileNotFoundError(f"JSON file not found: {JSON_PATH}")

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("JSON root must be a list")

    print(f"Itens no JSON: {len(data)}")
    print(f"Conectando ao banco: {DB_DSN}")

    conn = await asyncpg.connect(dsn=DB_DSN)
    try:
        async with conn.transaction():
            # limpa a tabela de itens antes de inserir
            # cuidado: se houver FKs para items, isso pode apagar dependentes
            await conn.execute("truncate table public.items restart identity;")

            await seed_items_from_json(conn, data)
    finally:
        await conn.close()

    print("Concluido: tabela items limpa e populada com novos dados.")


if __name__ == "__main__":
    asyncio.run(main())
