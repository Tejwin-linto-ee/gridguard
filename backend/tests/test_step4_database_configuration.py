import pytest
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql
from sqlalchemy import select
from backend.app.models.models import (
    Base, User, Device, SystemMeasurement, ChannelMeasurement,
    DeviceHeartbeat, FaultEvent, CalibrationConfig, BiometricUser
)
from backend.app.db.session import AsyncSessionLocal

# --------------------------------------------------------------------------
# 1. PostgreSQL Dialect DDL Compilation for All Models
# --------------------------------------------------------------------------
def test_all_models_ddl_compilation_under_postgresql():
    """Verify all 21 SQLAlchemy models compile to valid PostgreSQL DDL."""
    pg_dialect = postgresql.dialect()
    assert len(Base.metadata.sorted_tables) >= 20, "Expected at least 20 models in Base.metadata"
    
    for table in Base.metadata.sorted_tables:
        sql = str(CreateTable(table).compile(dialect=pg_dialect))
        assert len(sql) > 0
        assert table.name in sql


# --------------------------------------------------------------------------
# 2. Strict Zero-Temperature Audit Across All Database Columns
# --------------------------------------------------------------------------
def test_zero_temperature_database_columns_audit():
    """Verify that zero temperature or thermal fields exist anywhere in DB schema."""
    prohibited_keywords = ["temp", "temperature", "temperature_c", "thermal", "thermal_status", "temperature_threshold"]
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            col_name_lower = column.name.lower()
            # Prohibit exact matches or substring violations for thermal/temperature
            assert col_name_lower not in prohibited_keywords, (
                f"Prohibited temperature column '{column.name}' in table '{table.name}'"
            )
            assert not any(p in col_name_lower for p in ["temperature", "thermal"]), (
                f"Prohibited temperature substring found in column '{column.name}' in table '{table.name}'"
            )


# --------------------------------------------------------------------------
# 3. Dynamic Engine Configuration (PostgreSQL vs SQLite)
# --------------------------------------------------------------------------
def test_engine_configuration_arguments():
    """Verify pool parameters for PostgreSQL vs SQLite."""
    # Test PostgreSQL URL
    pg_url = "postgresql+asyncpg://mock_user:mock_pass@localhost:5432/mock_db"
    pg_engine = create_async_engine(
        pg_url,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=300
    )
    assert pg_engine.dialect.name == "postgresql"
    assert pg_engine.pool.size() == 10

    # Test SQLite URL
    sqlite_url = "sqlite+aiosqlite:///./test_fallback.db"
    sqlite_engine = create_async_engine(
        sqlite_url,
        connect_args={"check_same_thread": False}
    )
    assert sqlite_engine.dialect.name == "sqlite"


# --------------------------------------------------------------------------
# 4. Nullable Telemetry Metrics Integrity (Hardware Not Connected)
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_nullable_telemetry_metrics_integrity():
    """Verify database allows inserting partial/null electrical measurements."""
    async with AsyncSessionLocal() as session:
        # Create a measurement where voltage, current, power are null
        sys_meas = SystemMeasurement(
            voltage=None,
            current=None,
            power=None,
            energy=None,
            frequency=None,
            power_factor=None,
            data_source="NO LIVE DATA"
        )
        session.add(sys_meas)
        await session.commit()
        await session.refresh(sys_meas)

        assert sys_meas.id is not None
        assert sys_meas.voltage is None
        assert sys_meas.current is None
        assert sys_meas.power is None

        # Verify channel measurement with null metrics
        ch_meas = ChannelMeasurement(
            channel=4,
            voltage=None,
            current=None,
            apparent_power=None,
            main_relay=False,
            aux_relay=False,
            status="WAITING FOR LIVE MQTT TELEMETRY"
        )
        session.add(ch_meas)
        await session.commit()
        await session.refresh(ch_meas)

        assert ch_meas.id is not None
        assert ch_meas.voltage is None
        assert ch_meas.current is None
        assert ch_meas.apparent_power is None


# --------------------------------------------------------------------------
# 5. Foreign Key & Unique Constraint Integrity
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_foreign_key_and_constraint_definitions():
    """Verify foreign keys and unique constraints in metadata."""
    # Check User table unique constraints
    users_table = Base.metadata.tables["users"]
    assert users_table.c.username.unique is True
    assert users_table.c.email.unique is True

    # Check BiometricEnrollment foreign key to BiometricUser
    enrollments_table = Base.metadata.tables["biometric_enrollments"]
    fk_targets = [fk.target_fullname for fk in enrollments_table.foreign_keys]
    assert "biometric_users.id" in fk_targets

    # Check CalibrationConfig unique channel
    calib_table = Base.metadata.tables["calibration_configs"]
    assert calib_table.c.channel.unique is True


# --------------------------------------------------------------------------
# 6. Transaction Rollback Behavior
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_transaction_rollback():
    """Verify transaction rollback prevents orphaned records."""
    async with AsyncSessionLocal() as session:
        # Add a device heartbeat inside an aborted transaction
        hb = DeviceHeartbeat(
            device_id="ROLLBACK_TEST_DEV",
            uptime_sec=100
        )
        session.add(hb)
        await session.rollback()

        # Check it does not exist
        res = await session.execute(
            select(DeviceHeartbeat).filter(DeviceHeartbeat.device_id == "ROLLBACK_TEST_DEV")
        )
        assert res.scalars().first() is None
