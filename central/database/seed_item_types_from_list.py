#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script para popular a tabela public.item_types do zero
usando a lista completa de tipos definida no codigo.

Uso:
    python seed_item_types_from_list.py
"""

import os
import uuid
import asyncio
import asyncpg

# ==============================
# CONFIGURACAO
# ==============================

DB_DSN = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:senha123@localhost:5432/cigsdb"
)

# Lista completa de tipos fornecida
BASE_TYPES = [
    "Colete Balístico Sarkar Verde Oliva Modelo: ST-BFV180",
    "Placa Balística Sarkar Modelo: ST-BFV180-HAP",
    "Placa Balística Modelo: INS002",
    "Placa Balística Modelo: HAP-616/4G",
    "Reparo da Mtr .50 BROWNING",
    "Granada Redutor de Calibre Mrt 81mm",
    "Granada Redutor de Calibre Mrt 60mm",
    "Mrt 60mm M63 Light Mortar",
    "Mrt 60mm M949",
    "Balestra Modelo Microshock BVMS",
    "Metralhadora .50 BROWNING",
    "Cano de Troca .50 BROWNING",
    "Reparo da Mtr .50 TERRESTRE",
    "Reparo da Mtr 7,62 MAG",
    "Reparo Para Embarcação Mtr MAG",
    "Reparo Terrestre M971 da Mtr MAG",
    "Epg Cal 12 GA PUMP",
    "Epg Cal 12 GA 590 MOSSBERG",
    "Fz 7,62 M964 A1 P-FAL C/ Crg",
    "Bnt Fz 7,62 M964  A1 P-FAL",
    "Fz 7,62 M964 FAL C/ Crg",
    "Bnt Fz 7,62mm M964 FAL",
    "Lançador LT-38SA",
    "Lç Gr 40mm M79",
    "Mrt 81mm Me Acg",
    "Sub Cal 9mm AT4",
    "Cofre Metalico Mtr MAG",
    "Epg Cal 12 Rossi",
    "Epg Cal 12 GA Cano Duplo",
    "Epg Cal 16 GA",
    "Epg Cal 16 GA Cano Duplo",
    "Epg Cal 16/22",
    "Epg Cal 20 GA",
    "Rifle Carabina Cal .22",
    "Carabina Rossi Gallery Cal .22",
    "Carabina Winchester Cal .22",
    "Epg Cal 24 GA",
    "Epg Cal 32 GA",
    "Epg Cal 36 GA",
    "Epg Cal 38 Puma ROSSI",
    "Fz 7,62mm M968 MQ",
    "Baioneta Fz 7,62mm MQ M968",
    "Carb 4.5mm FAC",
    "Rifle de Ar Comprimido 5,5 Ruger",
    "Fz 7,62mm HK91 C/ Crg",
    "Fz 5,56mm M16 COLT C/ Crg",
    "Carb Aut Leve 5,56mm C/ Crg",
    "Fz Tir Precs AP 7,62mm PSG1",
    "Fz Sniper .308  AGLC",
    "Mtr 7,62mm M971 MAG",
    "Fz Mtr 7, 62 M964 FAP C/ Crg",
    "Cano de Troca Metralhadora MAG",
    "Capacete Balístico Verde Oliva nível IIIA",
    "Capacete Balístico Nível III-A  ST-ALPHA  FAST",
    "Colete camuflado 4 GATE modelo:4g-bv920A",
    "Capa para Colete camuflado 4 GATE modelo:4g-bv920A",
    "Pst 9mm M975 Beretta C/ Crg",
    "Crg Pst 9mm M975 Beretta",
    "Pst 9mm M973 IMBEL C/ Crg",
    "Crg pst 9mm M973 IMBEL",
    "Pst 9mm GC MD1 IMBEL  C/ Crg",
    "Crg pst 9mm GC MD1 IMBEL",
    "Revolver .22 Magnum TAURUS",
    "Revolver .38 Spl Taurus",
    "Mtr 9mm Uzi (IWI) C/Crg",
    "Revolver .45 Smith Welsson",
    "Pistolão de Caça",
    "Fz 7,62 M964 A1 MD1 P-FAL C/ Crg",
    "Bnt Fz 7,62 M964 MD1 P-FAL",
    "Fz Assalto 5,56mm IA2 C/ Crg",
    "Faca-Bnt Fz Assalto 5,56 IA2",
    "Crg Fz 7,62mm M964 Para-FAL",
    "Crg do Fz Assalto 5,56mm IA2",
    "Ref Tir Ft 7,62mm M964 FAP",
    "Ref Tir Ft Mtr 7,62mm MAG",
    "Ref Tir Ft 7,62 M964 MD1 P-FAL",
    "Ref Tir Ft 5,56mm IA2",
    "Bin 6x30 M949 DFV",
    "Binóculo Commander Military",
    "Lun Obs Mono M49 BR",
    "CRG Para Fuzil AR-18",
    "Crg do Fz  Sniper 7,62mm 308 PSG1",
    "Binoculos de Visão Noturna",
    "Mira Holográfica SpecterDR",
    "Lun Pnt TASCO 4 - 16x40",
    "Lun Pnt ZF 6 x 42 PSG1",
    "Lun Pnt 10 x 4.35 LEUPOLD",
    "Lun Pnt 14 x 40 Buckmasters",
    "Lun Pnt 10X40 BUSHNELL",
    "Lun Pnt TASCO 3 - 9x40",
    "Lun Pnt Fz 7,62 M964 OIP",
    "Lun Pnt 4 x 15 ESP 16/22",
    "Lun Pnt REDFILD 2 ½ x - 7",
    "Lun Pnt  THOMPSON",
    "Lun Pnt  AIM POINT",
    "Mira para Armamento TASCO Nº4",
    "Mira para Armamento TASCO Nº3",
    "Lun Pnt  TASCOS ACC DOT",
    "Aparelho de Pontaria do Mrt 81mm/60MM",
    "Monocular Night Vision System",
    "Monóculo de Visão Noturna Munos MK3",
    "Mira Laser MARS",
    "Mira Holográfica HWS Weapon Sight",
    "Óculos de Visão Noturna Lunos",
    "Mira Holográfica HDS",
    "Lun Pnt  Visão Noturna ORTEK",
    "Bipé da AGLC 7,62 380",
    "Binoculo Night Vision Bushinell",
    "Trilho Picatinny Adaptável",
    "Trilho Picatinny",
    "Telêmetro SALE LH - 30",
    "Óculos de Visão Noturna GOGGLES PVS7",
    "Colimador Para Mrt 81mm Me Acg",
    "Monocular Night Vision NETRO NM-3000",
    "Óculos de Visão Noturna Panorâmica NVS-18 NEWCON OPTIK",
    "Binoculo de visão termal JIM COMPACT",
]


async def main():
    print(f"Conectando ao banco: {DB_DSN}")
    conn = await asyncpg.connect(dsn=DB_DSN)
    try:
        # limpar tabela de tipos (comeca do zero)
        # cuidado: se existir algum item referenciando item_types,
        # o truncate simples pode falhar; cascade remove os dependentes.
        print("Limpando tabela public.item_types...")
        await conn.execute("truncate table public.item_types restart identity cascade;")

        # remover duplicados na lista e ordenar
        unique_types = sorted({t.strip() for t in BASE_TYPES if t and t.strip()})

        print(f"Total de tipos unicos a inserir: {len(unique_types)}")

        for tipo_name in unique_types:
            tipo_id = uuid.uuid4()
            await conn.execute(
                """
                insert into public.item_types (id, name, description)
                values ($1, $2, $3)
                """,
                tipo_id,
                tipo_name,
                None,  # sem descricao por enquanto
            )

        print("Concluido: tabela item_types populada.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
