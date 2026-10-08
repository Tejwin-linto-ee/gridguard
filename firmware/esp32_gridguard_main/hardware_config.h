/**
 * ==============================================================================
 * GRIDGUARD — SMART TRANSFORMER PROTECTION & ASSISTIVE LOAD DEVICE
 * HARDWARE CONFIGURATION LAYER  (ESP32-S3 N16R8)
 * ==============================================================================
 *
 * ABSOLUTE RULES — DO NOT VIOLATE:
 *
 * 1. ZERO TEMPERATURE  — no temperature sensors, thresholds, or telemetry.
 * 2. ACTIVE POWER AUTHORITY — P = mean(v[n]×i[n]). Never Vrms×Irms.
 * 3. PROTECTION THRESHOLDS: ≤7 W NORMAL | 7–12 W HIGH LOAD | >12 W TRIP.
 * 4. NO 13 W THRESHOLD anywhere in firmware.
 * 5. NO arbitrary current-only protection (no 2.5 A overcurrent trip).
 * 6. GPIO 19 and GPIO 20 are ESP32-S3 USB D-/D+. NEVER assign them.
 */

#ifndef HARDWARE_CONFIG_H
#define HARDWARE_CONFIG_H

// ==============================================================================
// MCU IDENTITY
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
// PZEM-004T V3.0  —  SYSTEM METER UART (Serial2)
// [VERIFY: UART2 RX/TX must not conflict with Octal PSRAM / Flash strapping pins]
// ==============================================================================
#define PZEM_SERIAL_PORT        Serial2
#define PIN_PZEM_RX             16   // MCU RX  ←  PZEM TX
#define PIN_PZEM_TX             17   // MCU TX  →  PZEM RX

// ==============================================================================
// ZMPT101B VOLTAGE SENSING  —  ADC1 CHANNELS ONLY
// (ADC2 is blocked by Wi-Fi driver)
// ==============================================================================
#define PIN_ADC_ZMPT_CH1        4    // ADC1_CH3
#define PIN_ADC_ZMPT_CH2        5    // ADC1_CH4
#define PIN_ADC_ZMPT_CH3        6    // ADC1_CH5
#define PIN_ADC_ZMPT_CH4        7    // ADC1_CH6

// ==============================================================================
// ACS712 CURRENT SENSING  —  ADC1 CHANNELS ONLY
// ==============================================================================
#define PIN_ADC_ACS_CH1         8    // ADC1_CH7
#define PIN_ADC_ACS_CH2         9    // ADC1_CH8
#define PIN_ADC_ACS_CH3         10   // ADC1_CH9
#define PIN_ADC_ACS_CH4         1    // ADC1_CH0  (remapped from GPIO11; ADC2 conflict)

// ==============================================================================
// RELAY CONTROL OUTPUTS  —  ACTIVE LOW
// All relay writes MUST go through the centralized relay driver (Section 12).
// ==============================================================================
#define RELAY_ACTIVE_LEVEL      LOW
#define RELAY_STATE_ON          LOW
#define RELAY_STATE_OFF         HIGH

// Main Relays (series isolation)
#define PIN_RELAY_MAIN_CH1      12
#define PIN_RELAY_MAIN_CH2      13
#define PIN_RELAY_MAIN_CH3      14
#define PIN_RELAY_MAIN_CH4      15

// Auxiliary Relays
// CRITICAL: GPIO 19 (USB D-) and GPIO 20 (USB D+) are permanently forbidden.
#define PIN_RELAY_AUX_CH1       18
#define PIN_RELAY_AUX_CH2       11   // remapped from GPIO 19
#define PIN_RELAY_AUX_CH3       38   // remapped from GPIO 20
#define PIN_RELAY_AUX_CH4       21

// ==============================================================================
// RELAY FEEDBACK INPUTS
// ==============================================================================
//
// SAFETY REQUIREMENT:
//   ESP32 GPIOs must NEVER be connected to mains-potential signals.
//   Relay feedback must use an isolated low-voltage sensing path.
//
// RECOMMENDED ARCHITECTURE (see RELAY_FEEDBACK_WIRING.md):
//   • Relay auxiliary/NO contact → current-limiting resistor → opto-coupler input
//   • Opto-coupler output → 3.3 V pull-up → ESP32 GPIO (INPUT_PULLUP)
//   • Logic: GPIO LOW when relay coil ON (contact closed); HIGH when OFF.
//
// HARDWARE STATUS:
//   The physical relay modules for this prototype board do NOT include
//   separate auxiliary contacts on each relay.
//   Therefore relay feedback is architecturally defined below but marked
//   NOT_INSTALLED until appropriate isolated feedback hardware is fitted.
//
//   If your relay board provides auxiliary contacts, wire through an
//   opto-coupler as described in RELAY_FEEDBACK_WIRING.md and set
//   RELAY_FEEDBACK_INSTALLED = 1 in your build flags.
//
// GPIO AVAILABILITY AUDIT  (used GPIOs as of this config):
//   PZEM:    16, 17
//   ZMPT:    4, 5, 6, 7
//   ACS:     1, 8, 9, 10
//   MAIN:    12, 13, 14, 15
//   AUX:     11, 18, 21, 38
//   USB:     19 (D-), 20 (D+) — forbidden
//   UART0:   43 (TX), 44 (RX) — reserved for serial monitor
//   JTAG:    39, 40, 41, 42   — reserved for debug
//
//   Available safe GPIOs for feedback (subject to physical board verification):
//   2, 3, 22, 23, 24, 25, 26, 27  — check schematic for strapping/boot pins
//
// NOTE: Assign feedback GPIOs only after physical hardware schematic is verified.
//       Use -DRELAY_FEEDBACK_INSTALLED=1 build flag when hardware is fitted.
//
#ifndef RELAY_FEEDBACK_INSTALLED
#define RELAY_FEEDBACK_INSTALLED  0   // 0 = NOT_INSTALLED (default)
#endif

// Feedback GPIO assignments (active when RELAY_FEEDBACK_INSTALLED == 1)
// These are PLACEHOLDER assignments — verify against your PCB schematic.
#define PIN_FEEDBACK_MAIN_CH1   2    // [REQUIRES BOARD VERIFICATION]
#define PIN_FEEDBACK_MAIN_CH2   3    // [REQUIRES BOARD VERIFICATION]
#define PIN_FEEDBACK_MAIN_CH3   22   // [REQUIRES BOARD VERIFICATION]
#define PIN_FEEDBACK_MAIN_CH4   23   // [REQUIRES BOARD VERIFICATION]
#define PIN_FEEDBACK_AUX_CH1    24   // [REQUIRES BOARD VERIFICATION]
#define PIN_FEEDBACK_AUX_CH2    25   // [REQUIRES BOARD VERIFICATION]
#define PIN_FEEDBACK_AUX_CH3    26   // [REQUIRES BOARD VERIFICATION]
#define PIN_FEEDBACK_AUX_CH4    27   // [REQUIRES BOARD VERIFICATION]

// Feedback logic: GPIO reads LOW when relay contact is closed (relay ON)
// Change to HIGH if opto-coupler polarity is inverted on your board.
#define FEEDBACK_ACTIVE_LEVEL   LOW

// ==============================================================================
// COMPILE-TIME GPIO SAFETY GUARD
// ==============================================================================
#if (PIN_RELAY_MAIN_CH1 == 19 || PIN_RELAY_MAIN_CH1 == 20 || \
     PIN_RELAY_MAIN_CH2 == 19 || PIN_RELAY_MAIN_CH2 == 20 || \
     PIN_RELAY_MAIN_CH3 == 19 || PIN_RELAY_MAIN_CH3 == 20 || \
     PIN_RELAY_MAIN_CH4 == 19 || PIN_RELAY_MAIN_CH4 == 20 || \
     PIN_RELAY_AUX_CH1  == 19 || PIN_RELAY_AUX_CH1  == 20 || \
     PIN_RELAY_AUX_CH2  == 19 || PIN_RELAY_AUX_CH2  == 20 || \
     PIN_RELAY_AUX_CH3  == 19 || PIN_RELAY_AUX_CH3  == 20 || \
     PIN_RELAY_AUX_CH4  == 19 || PIN_RELAY_AUX_CH4  == 20)
#error "FATAL: GPIO 19 / 20 are reserved for ESP32-S3 USB D-/D+. Reassign relays!"
#endif

// ==============================================================================
// ADC CONFIGURATION
// ==============================================================================
#define ADC_RESOLUTION_BITS     12
#define ADC_MAX_COUNT           4095.0f
#define ADC_REFERENCE_V         3.3f

// ==============================================================================
// VALIDATED CALIBRATION CONSTANTS
// (Treat ACS sensitivity as provisional until physical reference-meter validation)
// ==============================================================================
// ZMPT101B voltage gains (per channel)
// CAL values preserved from commissioning measurements.
#define CAL_ZMPT_CH1            648.28f
#define CAL_ZMPT_CH2            653.19f
#define CAL_ZMPT_CH3            648.43f
#define CAL_ZMPT_CH4            647.64f

// ACS712 zero-current ADC count offsets
#define CAL_ACS_ZERO_CH1        2708.51f
#define CAL_ACS_ZERO_CH2        2703.17f
#define CAL_ACS_ZERO_CH3        2703.17f
#define CAL_ACS_ZERO_CH4        2703.17f

// ACS712 current sensitivity (A/V)
// [PROVISIONAL — validate against external reference clamp meter at commissioning]
#define ACS_CURRENT_SENSITIVITY 2.60f

// ACS712 noise floor (Arms) — current below this is treated as zero-load
// [PROVISIONAL — measure actual noise in your installation and calibrate]
#define ACS_NOISE_FLOOR_A       0.015f

// ==============================================================================
// AUTHORITATIVE PROTECTION THRESHOLDS
// ==============================================================================
// These are the ONLY active-power protection thresholds in this firmware.
// No 13 W. No 2.5 A overcurrent. No temperature. No apparent-power trips.
#define POWER_NORMAL_W          7.00f   // ≤ 7.00 W → NORMAL
#define POWER_HIGH_W            12.00f  // > 7.00 W and ≤ 12.00 W → HIGH LOAD
// P > 12.00 W → TRIP (same constant, semantically: "over HIGH = trip")

// Hysteresis: prevents High↔Normal chattering at the 7 W boundary
// Transition HIGH→NORMAL only when P ≤ (POWER_NORMAL_W - POWER_HYSTERESIS_W)
#define POWER_HYSTERESIS_W      0.20f   // 200 mW band

// Overload persistence: consecutive measurement cycles above 12 W before latching trip
#define OVERLOAD_PERSISTENCE_CYCLES 2

// Voltage plausibility window (grid voltage sanity check)
#define VOLTAGE_MIN_V           190.0f
#define VOLTAGE_MAX_V           250.0f
#define VOLTAGE_MIN_PEAK_TO_PEAK_V  50.0f   // Minimum Vpp to confirm live AC waveform

// DSP sanity tolerance: |P| must be ≤ S + this tolerance (physical power law)
#define DSP_SANITY_TOLERANCE_W  0.50f

// ==============================================================================
// SAMPLING PARAMETERS
// ==============================================================================
// 600 samples × 100 µs = 60 ms ≈ 3 full 50 Hz cycles
#define POWER_SAMPLE_COUNT      600
#define SAMPLE_INTERVAL_US      100
#define POWER_SAMPLE_CYCLES     3    // Nominal 50 Hz cycles per measurement window

// ==============================================================================
// RELAY TIMING
// ==============================================================================
#define RELAY_STABILIZATION_MS  250  // Main→Aux staged activation delay
#define RELAY_FEEDBACK_SETTLE_MS   80   // Time after relay command before sampling feedback
#define RELAY_FEEDBACK_DEBOUNCE_MS 30   // Stable feedback window required

// ==============================================================================
// TELEMETRY TIMING
// ==============================================================================
#define TELEMETRY_INTERVAL_MS   1000
#define HEARTBEAT_INTERVAL_MS   2000

// ==============================================================================
// NVS SCHEMA VERSION
// ==============================================================================
#define NVS_MAGIC_VALUE         0xA55A4E56UL  // 'NV' sentinel
#define NVS_SCHEMA_VERSION      2             // Increment if NVS layout changes

#endif // HARDWARE_CONFIG_H
