import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from backend.app.db.session import engine, Base, AsyncSessionLocal, is_sqlite
import backend.app.models.models as models
from backend.app.models.models import (
    User, Device, SystemMeasurement, ChannelMeasurement, MaintenanceRecord,
    RiskScore, Notification, CalibrationConfig
)
from backend.app.core.security import get_password_hash

async def init_db():
    async with engine.begin() as conn:
        # Create all tables in database (works across both SQLite and PostgreSQL)
        await conn.run_sync(Base.metadata.create_all)

        # Apply dialect-safe schema upgrades
        def upgrade_schema(connection):
            try:
                connection.execute(text("ALTER TABLE biometric_enrollments ADD COLUMN sample_metadata_json TEXT"))
            except Exception:
                pass
            try:
                if is_sqlite:
                    connection.execute(text("ALTER TABLE channel_measurements ADD COLUMN active_power FLOAT"))
                else:
                    connection.execute(text("ALTER TABLE channel_measurements ADD COLUMN IF NOT EXISTS active_power DOUBLE PRECISION"))
            except Exception:
                pass
        await conn.run_sync(upgrade_schema)

    async with AsyncSessionLocal() as session:
        # Check if users already seeded
        result = await session.execute(select(User).filter(User.username == "admin"))
        existing_admin = result.scalars().first()

        if not existing_admin:
            # Seed Default Users
            users = [
                User(
                    username="admin",
                    email="admin@gridguard.iot",
                    hashed_password=get_password_hash("admin123"),
                    role="ADMIN",
                    is_active=True
                ),
                User(
                    username="operator",
                    email="operator@gridguard.iot",
                    hashed_password=get_password_hash("operator123"),
                    role="OPERATOR",
                    is_active=True
                ),
                User(
                    username="viewer",
                    email="viewer@gridguard.iot",
                    hashed_password=get_password_hash("viewer123"),
                    role="VIEWER",
                    is_active=True
                ),
            ]
            session.add_all(users)

            # Seed Default Device
            device = Device(
                device_id="ESP32-S3-N16R8-01",
                name="Smart Transformer Protection Node #1",
                hardware_type="ESP32-S3 N16R8",
                firmware_version="v1.2.0-prod",
                status="ONLINE"
            )
            session.add(device)

            # Seed Initial Maintenance Records
            for ch in range(1, 5):
                maint = MaintenanceRecord(
                    channel=ch,
                    date=datetime.datetime.utcnow() - datetime.timedelta(days=15),
                    maintenance_type="COMMISSIONING",
                    description=f"Initial commissioning and calibration of Prototype Load Channel {ch} (ZMPT101B, ACS712, Relays)",
                    technician="Lead Protection Engineer",
                    action_taken="Calibrated ADC offsets, verified relay switching sequence, tested load under nominal voltage.",
                    operating_hours=124.5 + ch * 12.0,
                    fault_count=0,
                    trip_count=0,
                    status="NORMAL",
                    next_due_date=datetime.datetime.utcnow() + datetime.timedelta(days=75)
                )
                session.add(maint)

                risk = RiskScore(
                    channel=ch,
                    score=12.0 + ch * 3.5,
                    trend="STABLE",
                    contributing_factors="Normal loading, zero trips in last 48h, stable grid frequency",
                    model_version="v1.0-heuristic"
                )
                session.add(risk)

            # Seed welcome notification
            notif = Notification(
                title="System Initialized",
                description="GRIDGUARD Industrial IoT protection service active. 4 prototype load channels monitored.",
                severity="INFO",
                category="SYSTEM",
                is_read=False,
                email_dispatched=True
            )
            session.add(notif)

            await session.commit()
            print("Database initialized successfully with default administrative configuration.")
        else:
            print("Database already initialized.")

if __name__ == "__main__":
    import asyncio
    asyncio.run(init_db())
