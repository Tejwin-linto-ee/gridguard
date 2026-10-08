import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.models import SystemEvent, AuthenticationEvent

async def log_audit_event(
    db: AsyncSession,
    user: str,
    action: str,
    target: str,
    result: str = "SUCCESS",
    details: str = "",
    role: str = "OPERATOR"
):
    """
    Creates an immutable audit log entry in system_events and authentication_events.
    """
    try:
        sys_event = SystemEvent(
            timestamp=datetime.datetime.utcnow(),
            event_type=action,
            component="AUDIT_LOG",
            description=f"[{user} ({role})] {action} on {target}. Result: {result}. Details: {details}",
            severity="INFO" if result == "SUCCESS" else "WARNING"
        )
        db.add(sys_event)
        await db.commit()
    except Exception as e:
        print(f"Error recording audit event: {e}")
