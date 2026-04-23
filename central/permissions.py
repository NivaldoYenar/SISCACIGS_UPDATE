from enum import Enum
from fastapi import Depends, HTTPException, status
from typing import Literal

from auth import get_current_user  # ajusta o import conforme teu projeto

Action = Literal["read", "write", "terminal"]

class Role(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"
    SCMT_OM = "SCMT_OM"
    CMT_SU_E_S2 = "CMT_SU_E_S2"
    STI_OM = "STI_OM"
    ARMEIRO = "ARMEIRO"


# none | read | crud
ROLE_PERMISSIONS = {
    Role.ADMIN: {
        "items": "crud",
        "movements": "crud",
        "users": "crud",
        "terminal": "crud",
    },
    Role.USER: {
        "items": "none",
        "movements": "none",
        "users": "none",
        "terminal": "none",
    },
    Role.SCMT_OM: {
        "items": "crud",
        "movements": "crud",
        "users": "crud",
        "terminal": "none",
    },
    Role.CMT_SU_E_S2: {
        "items": "crud",
        "movements": "crud",
        "users": "crud",
        "terminal": "none",
    },
    Role.STI_OM: {
        "items": "read",
        "movements": "read",
        "users": "crud",
        "terminal": "none",
    },
    Role.ARMEIRO: {
        "items": "read",
        "movements": "read",
        "users": "read",
        "terminal": "crud",  # abre/fecha cautela
    },
}

def require_permission(resource: str, action: Action):
    """
    resource: 'items' | 'movements' | 'users' | 'terminal'
    action: 'read' para GETs, 'write' para POST/PUT/DELETE, 'terminal' para ações específicas
    """
    def dependency(current_user=Depends(get_current_user)):
        role_str = current_user["role"]
        # ADMIN sempre full
        if role_str == Role.ADMIN.value:
            return current_user

        try:
            role = Role(role_str)
        except ValueError:
            raise HTTPException(status_code=403, detail="Role inválida")

        level = ROLE_PERMISSIONS.get(role, {}).get(resource, "none")

        allowed = False
        if action == "read":
            allowed = level in ("read", "crud")
        elif action == "write":
            allowed = level == "crud"
        elif action == "terminal":
            allowed = level == "crud"

        if not allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

        return current_user

    return dependency
