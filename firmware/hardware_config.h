/**
 * ==============================================================================
 * GRIDGUARD — TOP-LEVEL HARDWARE CONFIGURATION (COMPATIBILITY SHIM)
 * ==============================================================================
 *
 * IMPORTANT: This file is the ROOT-LEVEL hardware_config.h that may be
 * picked up by external tooling, documentation generators, or IDE indexers.
 *
 * The AUTHORITATIVE hardware configuration is located at:
 *   firmware/esp32_gridguard_main/hardware_config.h
 *
 * That file is the one actually compiled into the firmware by PlatformIO
 * (src_dir = esp32_gridguard_main, include_dir = esp32_gridguard_main).
 *
 * This shim exists only to expose identification constants to root-level
 * tooling. It must never define protection thresholds or GPIO assignments.
 *
 * ==============================================================================
 * ABSOLUTE RULES — ENFORCED HERE:
 *
 *   1. ZERO TEMPERATURE  — no temperature sensors, thresholds, or telemetry.
 *   2. ACTIVE POWER AUTHORITY — P = mean(v[n]×i[n]). Never Vrms×Irms.
 *   3. PROTECTION THRESHOLDS: ≤7 W NORMAL | 7–12 W HIGH LOAD | >12 W TRIP.
 *   4. NO 13 W THRESHOLD anywhere in firmware.
 *   5. NO arbitrary current-only protection — no 2.5 A overcurrent trip.
 *   6. GPIO 19 and GPIO 20 are ESP32-S3 USB D-/D+. NEVER assign them.
 *
 * ==============================================================================
 */

#ifndef HARDWARE_CONFIG_H
#define HARDWARE_CONFIG_H

// ==============================================================================
// SYSTEM IDENTIFICATION  (informational — mirrors sketch-level values)
// ==============================================================================
#define SYSTEM_NAME             "GRIDGUARD"
#define HARDWARE_REVISION       "ESP32-S3-N16R8-V1"
#define FIRMWARE_VERSION        "2.0.0-prod"
#define FIRMWARE_BUILD_ID       "GRIDGUARD_2026-10-01_HW_HARDENED"

// ==============================================================================
// CHANNEL COUNT
// ==============================================================================
#define NUM_CHANNELS            4

// ==============================================================================
// AUTHORITATIVE PROTECTION THRESHOLDS  (read-only mirror — DO NOT DUPLICATE)
// ==============================================================================
// These values are here ONLY for external documentation purposes.
// The firmware reads them from esp32_gridguard_main/hardware_config.h.
//
//   POWER_NORMAL_W  = 7.00 W   → NORMAL (Main ON, Aux OFF)
//   POWER_HIGH_W    = 12.00 W  → HIGH LOAD (Main ON, Aux ON)
//   P > 12.00 W                → TRIP (latched fault)
//
// FORBIDDEN defines that must NEVER appear in any firmware file:
//   THRESHOLD_OVERCURRENT_A   — no current-only protection
//   THRESHOLD_OVERLOAD_VA     — no apparent-power trip
//   Any threshold at 13 W     — expressly prohibited
//
// ==============================================================================
// PZEM-004T UART  (informational — authoritative values in sketch-level header)
// ==============================================================================
//   PIN_PZEM_RX = 16   PIN_PZEM_TX = 17   (UART2 / Serial2)
//
// ==============================================================================
// RELAY GPIO ASSIGNMENTS  (see sketch-level hardware_config.h for full map)
// ==============================================================================
//   Main:  12, 13, 14, 15     Aux:  18, 11, 38, 21
//   GPIO 19 (USB D-) and GPIO 20 (USB D+) — PERMANENTLY FORBIDDEN.
//
// ==============================================================================
// NVS SCHEMA VERSION
// ==============================================================================
#define NVS_MAGIC_VALUE         0xA55A4E56UL  // 'NV' sentinel
#define NVS_SCHEMA_VERSION      2             // Increment if NVS layout changes

// ==============================================================================
// DO NOT ADD ANYTHING BELOW THIS LINE.
// All operational constants belong in:
//   firmware/esp32_gridguard_main/hardware_config.h
// ==============================================================================

#endif // HARDWARE_CONFIG_H
