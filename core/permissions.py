from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from core.security import get_current_active_user
from models.user import User, UserRole, Role, RoleName
from database import get_db


def _get_user_role_names(user: User, db: Session) -> List[str]:
    """Return list of role names the user holds."""
    user_roles = db.query(UserRole).filter(UserRole.user_id == user.id).all()
    role_names = []
    for ur in user_roles:
        role = db.query(Role).filter(Role.id == ur.role_id).first()
        if role:
            role_names.append(role.name)
    return role_names


def require_roles(*allowed_roles: str):
    """Dependency factory: raises 403 if user does not have one of the allowed roles."""
    async def checker(
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db)
    ) -> User:
        role_names = _get_user_role_names(current_user, db)
        for role in allowed_roles:
            if role in role_names:
                return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Required role(s): {', '.join(allowed_roles)}"
        )
    return checker


def require_admin():
    return require_roles(RoleName.admin)


def require_admin_or_manager():
    """Admin or Report Manager — user management and reports."""
    return require_roles(RoleName.admin, RoleName.report_manager)


def require_any_approver():
    return require_roles(
        RoleName.admin,
        RoleName.manager,
        RoleName.sn_manager,
        RoleName.hod,
        RoleName.hr,
        RoleName.hr_admin,
        RoleName.finance,
        RoleName.supply_chain,
        RoleName.it,
        RoleName.cfo,
        RoleName.ceo,
        RoleName.chief_corporate,
    )
