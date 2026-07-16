from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from typing import List
from core.security import get_current_active_user
from models.user import User, UserRole, Role, RoleName, RoleCategory
from database import get_db


def _get_user_role_names(user: User, db: Session) -> List[str]:
    """Return list of role names the user holds.
    
    Uses selectinload to prevent N+1 queries by joining roles with user roles.
    """
    user_roles = db.query(UserRole).filter(UserRole.user_id == user.id)\
        .options(selectinload(UserRole.role)).all()
    
    role_names = [ur.role.name for ur in user_roles if ur.role]
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
    """Admin or Report Manager: user management and reports."""
    return require_roles(RoleName.admin, RoleName.report_manager)


def require_any_approver():
    """Allow any user who holds at least one approval role (Hierarchy, Functional, or Executive) or Admin."""
    async def checker(
        current_user: User = Depends(get_current_active_user),
        db: Session = Depends(get_db)
    ) -> User:
        user_roles = (
            db.query(UserRole)
            .filter(UserRole.user_id == current_user.id)
            .options(selectinload(UserRole.role))
            .all()
        )
        for ur in user_roles:
            if ur.role and (
                ur.role.name == RoleName.admin
                or ur.role.role_category in (
                    RoleCategory.hierarchy,
                    RoleCategory.functional,
                    RoleCategory.executive,
                )
            ):
                return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. An approval role is required."
        )
    return checker
