/**
 * ==============================================================================
 * GRIDGUARD — SMART TRANSFORMER PROTECTION & ASSISTIVE LOAD DEVICE
 * PRODUCTION FIRMWARE v2.0.0  (ESP32-S3 N16R8)
 * ==============================================================================
 *
 * SECTIONS:
 *   1.  Includes
 *   2.  Project Metadata
 *   3.  Hardware & Sampling Constants (from hardware_config.h)
 *   4.  GPIO Safety Guard
 *   5.  Calibration Constants
 *   6.  Protection Configuration
 *   7.  MQTT Topics
 *   8.  TLS Certificate
 *   9.  Enumerations (Protection, Channel, Relay, MQTT, Sensor, Boot)
 *  10.  Data Structures
 *  11.  Global State
 *  12.  Event Circular Buffer
 *  13.  Relay Driver Layer   ← centralized; ALL relay I/O goes through here
 *  14.  NVS Layer v2         (magic, version, CRC, fault persistence)
 *  15.  ADC Layer
 *  16.  Active-Power DSP     (P = mean(v[n]×i[n]), signed, no abs())
 *  17.  Sensor Validation
 *  18.  Protection State Machine (per-channel, independent)
 *  19.  Trip Handling
 *  20.  Reset Handling
 *  21.  MQTT Command Handling
 *  22.  MQTT Telemetry
 *  23.  Wi-Fi Management
 *  24.  MQTT Management
 *  25.  NTP
 *  26.  Heartbeat
 *  27.  Watchdog
 *  28.  FreeRTOS Tasks        (Core 1: protection | Core 0: networking)
 *  29.  setup()               (deterministic boot sequence)
 *  30.  loop()
 *
 * ==============================================================================
 * ABSOLUTE PROJECT RULES (enforced in code):
 *   • ZERO TEMPERATURE        — no temp sensors, telemetry, or thresholds
 *   • ZERO FABRICATION        — no hardcoded fake values in production
 *   • SIGNED ACTIVE POWER     — P = mean(v[n]×i[n]),  never abs()
 *   • 7 W / 12 W PROTECTION   — no 13 W, no 2.5 A overcurrent trip
 *   • SENSOR-FIRST ACTIVATION — relays never energised before valid measurement
 *   • PHYSICAL RELAY FEEDBACK — command ≠ physical state
 *   • NVS FAULT LATCHING      — survives power cycle
 *   • MQTT TLS 8883           — certificate validated, backoff reconnect
 *   • SIMULATOR / PHYSICAL    — never conflated
 * ==============================================================================
 */

// ==============================================================================
// SECTION 1: INCLUDES
// ==============================================================================
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <Preferences.h>
#include <time.h>
#include <math.h>
#include <esp_task_wdt.h>
#include <esp_system.h>     // esp_reset_reason(), esp_get_free_heap_size()
#include <rom/crc.h>        // crc32_le() for NVS integrity

#include "hardware_config.h"
#include "gridguard_hal.h"
#include "secrets.h"

// tests include moved to bottom

// ==============================================================================
// SECTION 2: PROJECT METADATA
// ==============================================================================
#define FW_RELEASE_NAME        "GRIDGUARD_PRODUCTION_HW_READY"
#define FW_BUILD_DATE          "2026-10-01"
#define FW_VERSION_STR         FIRMWARE_VERSION     // "2.0.0-prod"
#define CONTROLLER_TARGET      "ESP32-S3-N16R8"
#define DEVICE_MODE_STR        "PHYSICAL"
#define TELEMETRY_SOURCE_STR   "PHYSICAL_ESP32"

#ifdef DEV_TEST_MODE
#pragma message("BUILD: DEVELOPMENT TEST MODE (-DDEV_TEST_MODE=1)")
#else
#pragma message("BUILD: PRODUCTION HARDWARE READY (-DGRIDGUARD_PROD=1)")
#endif

// ==============================================================================
// SECTION 3: HARDWARE & SAMPLING (from hardware_config.h)
// ==============================================================================
// All constants imported from hardware_config.h — see that file for values.
// Validated:
//   POWER_SAMPLE_COUNT   = 600
//   SAMPLE_INTERVAL_US   = 100
//   RELAY_STABILIZATION_MS = 250
//   POWER_NORMAL_W       = 7.00
//   POWER_HIGH_W         = 12.00
//   POWER_HYSTERESIS_W   = 0.20

// ==============================================================================
// SECTION 4: GPIO SAFETY GUARD (compile-time)
// ==============================================================================
// Enforced in hardware_config.h via #if/#error — no additional code here.

// ==============================================================================
// SECTION 5: CALIBRATION CONSTANTS
// ==============================================================================
// Channel calibration arrays (index 0..3 = CH1..CH4)
static const float CAL_ZMPT[NUM_CHANNELS]     = { CAL_ZMPT_CH1, CAL_ZMPT_CH2, CAL_ZMPT_CH3, CAL_ZMPT_CH4 };
static const float CAL_ACS_ZERO[NUM_CHANNELS] = { CAL_ACS_ZERO_CH1, CAL_ACS_ZERO_CH2, CAL_ACS_ZERO_CH3, CAL_ACS_ZERO_CH4 };

// ==============================================================================
// SECTION 6: PROTECTION THRESHOLDS (documented)
// ==============================================================================
// ≤ POWER_NORMAL_W  (7.00 W) → NORMAL    : Main ON, Aux OFF
// >  POWER_NORMAL_W and ≤ POWER_HIGH_W (12.00 W) → HIGH LOAD : Main ON, Aux ON
// >  POWER_HIGH_W   (12.00 W) → TRIP      : Main OFF, Aux OFF, fault latched

// ==============================================================================
// SECTION 7: MQTT TOPICS
// ==============================================================================
const char* TOPIC_SYSTEM         = "smarttransformer/system";
const char* TOPIC_EVENTS         = "smarttransformer/events";
const char* TOPIC_FAULTS         = "smarttransformer/faults";
const char* TOPIC_HEARTBEAT      = "smarttransformer/heartbeat";
const char* TOPIC_STATUS         = "smarttransformer/status";
const char* TOPIC_COMMANDS       = "smarttransformer/commands";
const char* TOPIC_CMD_ACK        = "smarttransformer/commands/status";
const char* TOPIC_RELAY_EVENTS   = "smarttransformer/relay_events";
const char* TOPIC_BOOT_STATUS    = "smarttransformer/boot";

const char* TOPIC_CHANNELS[NUM_CHANNELS] = {
    "smarttransformer/channel/1",
    "smarttransformer/channel/2",
    "smarttransformer/channel/3",
    "smarttransformer/channel/4"
};

// MQTT Last Will payload — published by broker on unexpected disconnect
const char* MQTT_LAST_WILL_TOPIC   = "smarttransformer/status";
const char* MQTT_LAST_WILL_PAYLOAD = "{\"device_id\":\"" DEVICE_ID "\","
                                      "\"device_mode\":\"PHYSICAL\","
                                      "\"status\":\"OFFLINE_UNEXPECTED\"}";

// ==============================================================================
// SECTION 8: TLS CERTIFICATE  (ISRG Root X1 — Let's Encrypt / HiveMQ Cloud)
// ==============================================================================
const char* HIVEMQ_ROOT_CA =
"-----BEGIN CERTIFICATE-----\n"
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n"
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n"
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n"
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n"
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n"
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n"
"h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n"
"0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U\n"
"A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW\n"
"T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH\n"
"B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC\n"
"B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv\n"
"KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn\n"
"OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn\n"
"jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw\n"
"qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI\n"
"rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV\n"
"HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq\n"
"hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL\n"
"ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ\n"
"3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK\n"
"NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5\n"
"ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur\n"
"TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC\n"
"jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc\n"
"oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq\n"
"4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA\n"
"mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d\n"
"emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=\n"
"-----END CERTIFICATE-----\n";

// ==============================================================================
// SECTION 9: ENUMERATIONS
// ==============================================================================

// ── Channel Protection State ──────────────────────────────────────────────────
enum ChannelProtectionState : uint8_t {
    CH_BOOT               = 0,   // Power-up, relays forced off
    CH_SAFE_OUTPUTS       = 1,   // Relay outputs confirmed off, sensors not yet valid
    CH_SENSOR_VALIDATING  = 2,   // Acquiring and validating sensor measurements
    CH_SENSOR_INVALID     = 3,   // Sensor measurement outside plausibility window
    CH_MEASURING          = 4,   // Active DSP measurement in progress
    CH_NORMAL             = 5,   // P ≤ 7.00 W | Main ON, Aux OFF
    CH_HIGH_LOAD          = 6,   // 7.00 < P ≤ 12.00 W | Main ON, Aux ON
    CH_TRIPPED            = 7,   // P > 12.00 W | fault latched, Main OFF, Aux OFF
    CH_RESETTING          = 8,   // Authorised reset sequence in progress
    CH_RELAY_FAULT        = 9,   // Relay command vs feedback mismatch detected
    CH_SAFE_MODE          = 10,  // Critical failure, relays permanently off
};

// ── Relay Verification State ──────────────────────────────────────────────────
enum RelayVerificationState : uint8_t {
    RELAY_UNKNOWN             = 0,
    RELAY_CMD_ON              = 1,   // Commanded ON, awaiting feedback settle
    RELAY_CMD_OFF             = 2,   // Commanded OFF, awaiting feedback settle
    RELAY_VERIFIED_ON         = 3,   // Command ON confirmed by physical feedback
    RELAY_VERIFIED_OFF        = 4,   // Command OFF confirmed by physical feedback
    RELAY_MISMATCH            = 5,   // Command ON but feedback OFF (stuck-off)
    RELAY_STUCK_ON            = 6,   // Command OFF but feedback ON (stuck-on / welded)
    RELAY_FEEDBACK_INVALID    = 7,   // Feedback read returned indeterminate value
    RELAY_FEEDBACK_NOT_AVAIL  = 8,   // Feedback hardware not installed
};

// ── Relay Feedback Source ─────────────────────────────────────────────────────
enum RelayFeedbackSource : uint8_t {
    FB_NOT_INSTALLED  = 0,   // No isolated feedback hardware fitted
    FB_PHYSICAL       = 1,   // Isolated contact feedback from relay auxiliary contact
    FB_SIMULATOR      = 2,   // Simulated feedback (DEV_TEST_MODE only)
};

// ── MQTT Connection State ─────────────────────────────────────────────────────
enum MqttConnState : uint8_t {
    GRIDGUARD_MQTT_DISCONNECTED = 0,
    GRIDGUARD_MQTT_CONNECTING   = 1,
    GRIDGUARD_MQTT_CONNECTED    = 2,
    GRIDGUARD_MQTT_BACKOFF      = 3,
    GRIDGUARD_MQTT_ERROR        = 4,
};

// ── Sensor Health ─────────────────────────────────────────────────────────────
enum SensorHealth : uint8_t {
    SENSOR_GOOD     = 0,
    SENSOR_DEGRADED = 1,
    SENSOR_INVALID  = 2,
};

// ── System Boot State ─────────────────────────────────────────────────────────
enum BootState : uint8_t {
    BOOT_BOOTING         = 0,
    BOOT_SAFE_OUTPUTS    = 1,
    BOOT_SENSOR_VALIDATE = 2,
    BOOT_READY           = 3,
    BOOT_PROTECTION_ACTIVE = 4,
    BOOT_SAFE_MODE       = 5,
    BOOT_FAULT           = 6,
};

// ── Local Event Types ─────────────────────────────────────────────────────────
enum EventType : uint8_t {
    EV_BOOT            = 0,
    EV_SENSOR_INVALID  = 1,
    EV_NORMAL          = 2,
    EV_HIGH_LOAD       = 3,
    EV_TRIP            = 4,
    EV_RESET           = 5,
    EV_RELAY_FAULT     = 6,
    EV_MQTT_DISCONNECT = 7,
    EV_MQTT_RECONNECT  = 8,
    EV_WATCHDOG        = 9,
    EV_BROWNOUT        = 10,
    EV_SAFE_MODE       = 11,
    EV_RELAY_MISMATCH  = 12,
    EV_RELAY_STUCK_ON  = 13,
};

// ==============================================================================
// SECTION 10: DATA STRUCTURES
// ==============================================================================

// ── Per-relay state (command, physical, verification) ─────────────────────────
struct RelayState {
    bool                  commanded;      // What firmware commanded
    bool                  feedback;       // What physical contact returned
    RelayVerificationState verification;  // Resulting verification state
    RelayFeedbackSource   source;         // Origin of the feedback value
    uint32_t              mismatchCount;  // Cumulative mismatch events
    uint32_t              stuckOnCount;
    uint32_t              stuckOffCount;
    uint32_t              successCount;
};

// ── Per-channel state ─────────────────────────────────────────────────────────
struct ChannelState {
    // Sensor measurements
    float  voltage;           // Vrms (V)
    float  current;           // Irms (A)
    float  activePower;       // P = mean(v·i) (W) — signed, never abs()
    float  apparentPowerVA;   // S = Vrms × Irms (VA) — informational only
    float  powerFactor;       // PF = P/S — clamped [−1, +1]
    bool   voltageValid;
    bool   currentValid;
    bool   measurementValid;
    bool   dspSanityOk;       // |P| ≤ S + DSP_SANITY_TOLERANCE_W
    SensorHealth sensorHealth;

    // Relay states (command + physical feedback + verification)
    RelayState main;
    RelayState aux;

    // Protection state
    ChannelProtectionState currentState;
    bool   faultLatched;
    char   fault[64];
    uint32_t faultCount;
    bool   loadPresent;

    // Counters
    uint32_t tripCount;
    uint32_t resetCount;
    uint32_t highLoadCount;
    uint32_t sensorInvalidCount;
};

// ── Local event buffer entry ──────────────────────────────────────────────────
struct EventEntry {
    EventType type;
    uint8_t   channel;  // 0xFF = system-level event
    uint32_t  uptimeMs;
    char      detail[32];
};

// ── Boot diagnostics ──────────────────────────────────────────────────────────
struct BootDiagnostics {
    uint32_t          bootCount;
    esp_reset_reason_t resetReason;
    uint32_t          watchdogCount;
    uint32_t          brownoutCount;
    uint32_t          softwareResetCount;
    BootState         systemBootState;
};

// ── NVS v2 channel fault record ───────────────────────────────────────────────
struct NvsFaultRecord {
    uint32_t magic;        // NVS_MAGIC_VALUE
    uint8_t  schemaVer;    // NVS_SCHEMA_VERSION
    bool     latched;
    char     fault[64];
    uint32_t faultCount;
    uint32_t tripCount;
    uint32_t seqNum;       // Write counter (monotonic)
    uint32_t crc;          // CRC32 of all fields above
};

// ── Global diagnostics counters ───────────────────────────────────────────────
struct SystemCounters {
    uint32_t mqttReconnectCount;
    uint32_t mqttPublishFailCount;
    uint32_t commandRejectCount;
};

// ==============================================================================
// SECTION 11: GLOBAL STATE
// ==============================================================================
ChannelState    channels[NUM_CHANNELS];
BootDiagnostics bootDiag;
SystemCounters  sysCounters;

// Overload debounce counters (per channel)
uint8_t  overloadConsecutive[NUM_CHANNELS] = {0};
uint8_t  normalReturnConsec[NUM_CHANNELS]  = {0};
uint32_t seqNumber = 0;            // Telemetry packet sequence number

SemaphoreHandle_t channelMutex = nullptr;
SemaphoreHandle_t relayMutex   = nullptr;

Preferences     preferences;
HardwareSerial  PZEMSerial(2);
PZEM004Tv30     pzem(PZEMSerial, PIN_PZEM_RX, PIN_PZEM_TX);
WiFiClientSecure espClient;
PubSubClient    mqttClient(espClient);

MqttConnState   mqttState    = GRIDGUARD_MQTT_DISCONNECTED;
bool            ntpSynced    = false;
uint32_t        lastWiFiAttempt = 0;
uint32_t        lastMQTTAttempt = 0;
uint32_t        wifiBackoffMs   = 2000;
uint32_t        mqttBackoffMs   = 2000;

// ==============================================================================
// SECTION 12: EVENT CIRCULAR BUFFER
// ==============================================================================
#define EVENT_BUF_SIZE 32
static EventEntry eventBuf[EVENT_BUF_SIZE];
static uint8_t    eventHead = 0;   // next write index
static uint8_t    eventCount = 0;  // total valid entries (max EVENT_BUF_SIZE)
static SemaphoreHandle_t eventMutex = nullptr;

void pushEvent(EventType type, uint8_t ch, const char* detail) {
    if (eventMutex && xSemaphoreTake(eventMutex, pdMS_TO_TICKS(5)) == pdTRUE) {
        EventEntry& e = eventBuf[eventHead];
        e.type      = type;
        e.channel   = ch;
        e.uptimeMs  = millis();
        strncpy(e.detail, detail ? detail : "", sizeof(e.detail) - 1);
        e.detail[sizeof(e.detail) - 1] = '\0';
        eventHead = (eventHead + 1) % EVENT_BUF_SIZE;
        if (eventCount < EVENT_BUF_SIZE) eventCount++;
        xSemaphoreGive(eventMutex);
    }
}

// ==============================================================================
// FORWARD DECLARATIONS
// ==============================================================================
// Relay driver
void     relayDriverInit();
void     setRelayCommand(uint8_t ch, bool isMain, bool state);
bool     readRelayFeedback(uint8_t ch, bool isMain, bool &feedbackValid);
RelayVerificationState verifyRelay(uint8_t ch, bool isMain,
                                    bool commanded, uint32_t settleMs);
void     allRelaysOff();

// Measurement / protection
bool     measureChannel(uint8_t ch);
void     evaluateChannelProtection(uint8_t ch);
void     tripChannel(uint8_t ch, const char* reason);
void     executeResetSequence(uint8_t ch, const char* authorizedBy,
                               const char* authId, const char* corrId);

// Telemetry / MQTT
void     publishChannelTelemetry(uint8_t ch);
void     publishSystemTelemetry();
void     publishHeartbeat();
void     publishRelayEvent(uint8_t ch, bool isMain,
                            bool commanded, RelayVerificationState vstate);
void     publishCommandAck(const char* cmd, bool accepted, const char* reason,
                            int ch, const char* corrId,
                            const char* statusStr = nullptr);
void     publishBootStatus();

// Helpers
bool     getChannelSnapshot(uint8_t ch, ChannelState& out);
bool     getIsoTimestamp(char* buf, size_t maxLen);
const char* protectionStateStr(ChannelProtectionState st);
const char* relayVerifStr(RelayVerificationState vs);
const char* feedbackSourceStr(RelayFeedbackSource src);
const char* sensorHealthStr(SensorHealth h);
const char* mqttStateStr(MqttConnState s);

// ==============================================================================
// SECTION 13: RELAY DRIVER LAYER
// ==============================================================================
/**
 * ALL relay GPIO manipulation goes through this layer.
 * Direct digitalWrite() to relay pins elsewhere in firmware is forbidden.
 *
 * Architecture:
 *   setRelayCommand()  → writes GPIO + records commanded state
 *   readRelayFeedback() → reads feedback GPIO with debounce
 *   verifyRelay()      → waits settle time, debounces, returns verification state
 *   allRelaysOff()     → emergency / boot: forces all relays off immediately
 */

void relayDriverInit() {
    // Initialise relay command pins as outputs, safe (OFF) by default.
    // Initialise feedback pins as inputs with pull-up (if installed).
    for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
        const ChannelHardware& hw = GRIDGUARD_CHANNELS[ch];

        // Command pins — output, immediately OFF
        pinMode(hw.mainRelayPin, OUTPUT);
        pinMode(hw.auxRelayPin,  OUTPUT);
        digitalWrite(hw.mainRelayPin, RELAY_STATE_OFF);
        digitalWrite(hw.auxRelayPin,  RELAY_STATE_OFF);

        // Feedback pins — input with pull-up (if hardware installed)
        if (hw.feedbackInstalled) {
            if (hw.mainFeedbackPin != 0) pinMode(hw.mainFeedbackPin, INPUT_PULLUP);
            if (hw.auxFeedbackPin  != 0) pinMode(hw.auxFeedbackPin,  INPUT_PULLUP);
        }

        // Initialise relay state structures
        if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);

        RelayFeedbackSource fbSrc = hw.feedbackInstalled ? FB_PHYSICAL : FB_NOT_INSTALLED;
#ifdef DEV_TEST_MODE
        fbSrc = FB_SIMULATOR;
#endif
        // STRICT ZERO-FABRICATION:
        // When feedback hardware is NOT installed, verification must be NOT_AVAILABLE.
        // Never initialise to RELAY_VERIFIED_OFF — that would falsely claim physical confirmation.
        // When feedback IS installed (or simulator), we read actual state; report UNKNOWN until verified.
        RelayVerificationState initVerif;
#ifdef DEV_TEST_MODE
        initVerif = RELAY_VERIFIED_OFF;   // Simulator can claim verified — it mirrors commanded
#else
        initVerif = hw.feedbackInstalled ? RELAY_UNKNOWN : RELAY_FEEDBACK_NOT_AVAIL;
#endif
        channels[ch].main = { false, false, initVerif, fbSrc, 0, 0, 0, 0 };
        channels[ch].aux  = { false, false, initVerif, fbSrc, 0, 0, 0, 0 };

        if (channelMutex) xSemaphoreGive(channelMutex);
    }
    Serial.println("[RELAY] Driver initialised. All relay outputs = OFF.");
}

/**
 * setRelayCommand — the single authoritative entry point for relay writes.
 * Records commanded state; does NOT yet confirm physical state.
 */
void setRelayCommand(uint8_t ch, bool isMain, bool state) {
    if (ch >= NUM_CHANNELS) return;
    const ChannelHardware& hw = GRIDGUARD_CHANNELS[ch];

    if (relayMutex) xSemaphoreTake(relayMutex, portMAX_DELAY);
    uint8_t pin   = isMain ? hw.mainRelayPin : hw.auxRelayPin;
    uint8_t level = state ? RELAY_STATE_ON : RELAY_STATE_OFF;
    digitalWrite(pin, level);
    if (relayMutex) xSemaphoreGive(relayMutex);

    if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
    RelayState& rs = isMain ? channels[ch].main : channels[ch].aux;
    rs.commanded    = state;
    rs.verification = state ? RELAY_CMD_ON : RELAY_CMD_OFF;
    if (channelMutex) xSemaphoreGive(channelMutex);

    Serial.printf("[RELAY] CH%d %s → %s (CMD)\n",
                  ch + 1, isMain ? "MAIN" : "AUX", state ? "ON" : "OFF");
}

/**
 * readRelayFeedback — debounced feedback GPIO read.
 * Returns the stable physical reading after RELAY_FEEDBACK_DEBOUNCE_MS of stability.
 * feedbackValid is set to false if feedback hardware is not installed — caller MUST check this.
 * NEVER returns commanded state as a substitute for physical feedback.
 */
bool readRelayFeedback(uint8_t ch, bool isMain, bool &feedbackValid) {
    if (ch >= NUM_CHANNELS) {
        feedbackValid = false;
        return false;
    }
    const ChannelHardware& hw = GRIDGUARD_CHANNELS[ch];

    if (!hw.feedbackInstalled) {
        feedbackValid = false;
        return false;
    }

    uint8_t fbPin = isMain ? hw.mainFeedbackPin : hw.auxFeedbackPin;
    if (fbPin == 0) {
        feedbackValid = false;
        return false;
    }

    // Debounce: sample until stable for RELAY_FEEDBACK_DEBOUNCE_MS
    uint32_t debounceStart  = millis();
    int      lastRead       = digitalRead(fbPin);

    while ((millis() - debounceStart) < RELAY_FEEDBACK_DEBOUNCE_MS) {
        delay(5);
        int current = digitalRead(fbPin);
        if (current != lastRead) {
            debounceStart = millis();  // restart debounce
            lastRead = current;
        }
    }

    // Active level: FEEDBACK_ACTIVE_LEVEL = LOW means GPIO LOW → relay ON
    bool physicallyOn = (lastRead == FEEDBACK_ACTIVE_LEVEL);
    feedbackValid = true;

#ifdef DEV_TEST_MODE
    // Simulator: perfect feedback mirrors commanded state
    ChannelState snap;
    getChannelSnapshot(ch, snap);
    physicallyOn = isMain ? snap.main.commanded : snap.aux.commanded;
#endif

    return physicallyOn;
}

/**
 * verifyRelay — waits settle time, reads debounced feedback,
 *               updates relay state structure, publishes relay event.
 * Returns the resulting RelayVerificationState.
 */
RelayVerificationState verifyRelay(uint8_t ch, bool isMain,
                                    bool commanded, uint32_t settleMs) {
    if (ch >= NUM_CHANNELS) return RELAY_FEEDBACK_INVALID;
    const ChannelHardware& hw = GRIDGUARD_CHANNELS[ch];

    // Wait for relay mechanics to settle
    if (settleMs > 0) vTaskDelay(pdMS_TO_TICKS(settleMs));

    RelayVerificationState vstate;
    bool feedbackValid = false;
    bool feedback = false;
    RelayFeedbackSource src;
    
    if (!hw.feedbackInstalled) {
        vstate   = RELAY_FEEDBACK_NOT_AVAIL;
        feedback = false;
        src      = FB_NOT_INSTALLED;
    } else {
        feedback = readRelayFeedback(ch, isMain, feedbackValid);
        src      = FB_PHYSICAL;
#ifdef DEV_TEST_MODE
        src      = FB_SIMULATOR;
#endif
        // feedbackValid is authoritative: UNKNOWN != OFF, UNKNOWN != ON
        if (!feedbackValid) {
            vstate = RELAY_FEEDBACK_INVALID;
        } else if (commanded && feedback) {
            vstate = RELAY_VERIFIED_ON;
        } else if (!commanded && !feedback) {
            vstate = RELAY_VERIFIED_OFF;
        } else if (commanded && !feedback) {
            vstate = RELAY_MISMATCH;
        } else {
            vstate = RELAY_STUCK_ON;
        }
    }

    // Update relay state under mutex
    if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
    RelayState& rs = isMain ? channels[ch].main : channels[ch].aux;
    rs.feedback     = feedback;
    rs.verification = vstate;
    rs.source       = src;
    switch (vstate) {
        case RELAY_MISMATCH:   rs.mismatchCount++;  rs.stuckOffCount++; break;
        case RELAY_STUCK_ON:   rs.mismatchCount++;  rs.stuckOnCount++;  break;
        case RELAY_VERIFIED_ON:
        case RELAY_VERIFIED_OFF: rs.successCount++; break;
        default: break;
    }
    if (channelMutex) xSemaphoreGive(channelMutex);

    // Log — only show FB value when feedback hardware is actually installed
    if (hw.feedbackInstalled) {
        Serial.printf("[RELAY VERIFY] CH%d %s CMD=%s FB=%s → %s\n",
                      ch + 1, isMain ? "MAIN" : "AUX",
                      commanded ? "ON" : "OFF",
                      feedback  ? "ON" : "OFF",
                      relayVerifStr(vstate));
    } else {
        Serial.printf("[RELAY VERIFY] CH%d %s CMD=%s FB=NOT_INSTALLED → %s\n",
                      ch + 1, isMain ? "MAIN" : "AUX",
                      commanded ? "ON" : "OFF",
                      relayVerifStr(vstate));
    }

    // Publish relay verification event via MQTT
    publishRelayEvent(ch, isMain, commanded, vstate);

    return vstate;
}

/**
 * allRelaysOff — emergency / boot safety: forces all relay GPIOs to OFF state.
 * Called before mutexes are available during boot (direct GPIO write).
 */
void allRelaysOff() {
    for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
        const ChannelHardware& hw = GRIDGUARD_CHANNELS[ch];
        digitalWrite(hw.mainRelayPin, RELAY_STATE_OFF);
        digitalWrite(hw.auxRelayPin,  RELAY_STATE_OFF);
    }
    // Update software state if mutexes available
    if (channelMutex) {
        xSemaphoreTake(channelMutex, portMAX_DELAY);
        for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
            channels[ch].main.commanded = false;
            channels[ch].aux.commanded  = false;
        }
        xSemaphoreGive(channelMutex);
    }
    Serial.println("[SAFETY] ALL RELAYS FORCED OFF.");
}

// Convenience wrappers
void setChannelRelays(uint8_t ch, bool mainOn, bool auxOn) {
    setRelayCommand(ch, true,  mainOn);
    setRelayCommand(ch, false, auxOn);
}

// ==============================================================================
// SECTION 14: NVS LAYER v2  (magic / version / CRC fault persistence)
// ==============================================================================
static uint32_t computeNvsCRC(const NvsFaultRecord& r) {
    // CRC over all fields except the crc field itself
    return crc32_le(0, (const uint8_t*)&r,
                    sizeof(NvsFaultRecord) - sizeof(uint32_t));
}

void saveFaultToNVS(uint8_t ch, const char* fault, uint32_t tripCount) {
    if (ch >= NUM_CHANNELS) return;

    char key[20];
    snprintf(key, sizeof(key), "nvs2_ch%d", ch + 1);

    NvsFaultRecord rec;
    rec.magic      = NVS_MAGIC_VALUE;
    rec.schemaVer  = NVS_SCHEMA_VERSION;
    rec.latched    = true;
    strncpy(rec.fault, fault, sizeof(rec.fault) - 1);
    rec.fault[sizeof(rec.fault) - 1] = '\0';
    rec.faultCount = channels[ch].faultCount;
    rec.tripCount  = tripCount;
    rec.seqNum     = preferences.getUInt("nvs_seq", 0) + 1;
    preferences.putUInt("nvs_seq", rec.seqNum);
    rec.crc        = computeNvsCRC(rec);

    preferences.putBytes(key, &rec, sizeof(rec));
    Serial.printf("[NVS v2] CH%d fault saved: %s (seq=%u)\n", ch + 1, fault, rec.seqNum);
}

void clearFaultFromNVS(uint8_t ch) {
    if (ch >= NUM_CHANNELS) return;

    char key[20];
    snprintf(key, sizeof(key), "nvs2_ch%d", ch + 1);

    NvsFaultRecord rec;
    rec.magic      = NVS_MAGIC_VALUE;
    rec.schemaVer  = NVS_SCHEMA_VERSION;
    rec.latched    = false;
    rec.fault[0]   = '\0';
    rec.faultCount = channels[ch].faultCount;
    rec.tripCount  = channels[ch].tripCount;
    rec.seqNum     = preferences.getUInt("nvs_seq", 0) + 1;
    preferences.putUInt("nvs_seq", rec.seqNum);
    rec.crc        = computeNvsCRC(rec);

    preferences.putBytes(key, &rec, sizeof(rec));
    Serial.printf("[NVS v2] CH%d fault cleared (seq=%u)\n", ch + 1, rec.seqNum);
}

void loadPersistentFaultsFromNVS() {
    Serial.println("[NVS v2] Loading persistent fault latches...");

    for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
        char key[20];
        snprintf(key, sizeof(key), "nvs2_ch%d", ch + 1);

        NvsFaultRecord rec;
        size_t recSize = sizeof(rec);
        size_t readSize = preferences.getBytes(key, &rec, recSize);

        bool valid = (readSize == recSize)
                  && (rec.magic     == NVS_MAGIC_VALUE)
                  && (rec.schemaVer == NVS_SCHEMA_VERSION)
                  && (computeNvsCRC(rec) == rec.crc);

        if (!valid) {
            // Corrupted or uninitialized NVS entry
            Serial.printf("[NVS v2] CH%d: NVS %s — entering SAFE state\n",
                          ch + 1,
                          readSize == 0 ? "uninitialized" : "CORRUPTED");
            channels[ch].faultLatched = false;
            channels[ch].fault[0]     = '\0';
            channels[ch].currentState = CH_BOOT;
            if (readSize > 0 && readSize == recSize) {
                // Was written but CRC failed → possible corruption → SAFE_MODE
                channels[ch].currentState = CH_SAFE_MODE;
                Serial.printf("[NVS v2] CH%d NVS CRC FAILURE → CH_SAFE_MODE\n", ch + 1);
                pushEvent(EV_SAFE_MODE, ch, "NVS_CRC_FAIL");
            }
        } else {
            channels[ch].faultLatched = rec.latched;
            channels[ch].faultCount   = rec.faultCount;
            channels[ch].tripCount    = rec.tripCount;
            if (rec.latched) {
                strncpy(channels[ch].fault, rec.fault, sizeof(channels[ch].fault) - 1);
                channels[ch].fault[sizeof(channels[ch].fault) - 1] = '\0';
                channels[ch].currentState = CH_TRIPPED;
                Serial.printf("[NVS v2] CH%d RESTORED LATCH: %s\n", ch + 1, channels[ch].fault);
            } else {
                channels[ch].fault[0]     = '\0';
                channels[ch].currentState = CH_BOOT;
            }
        }
    }
}

// ==============================================================================
// SECTION 15: ADC LAYER
// ==============================================================================
inline float adcCountToVoltage(float counts) {
    return (counts * ADC_REFERENCE_V) / ADC_MAX_COUNT;
}

// ==============================================================================
// SECTION 16: ACTIVE-POWER DSP
// ==============================================================================
/**
 * measureChannel — acquires POWER_SAMPLE_COUNT samples and computes:
 *
 *   Vrms  = sqrt( (1/N) Σ v[n]² )
 *   Irms  = sqrt( (1/N) Σ i[n]² )
 *   P     = (1/N) Σ v[n]·i[n]     ← signed, never abs()
 *   S     = Vrms × Irms
 *   PF    = P / S                  ← clamped [−1, +1]
 *
 * DSP sanity: |P| must be ≤ S + DSP_SANITY_TOLERANCE_W (physical law check)
 *
 * Returns true if measurement is valid (sensor plausibility passed).
 */
bool measureChannel(uint8_t ch) {
    if (ch >= NUM_CHANNELS) return false;

#ifdef DEV_TEST_MODE
    // Controlled simulator injection (DEV_TEST_MODE only)
    float vRms = 230.2f;
    float pActive;
    switch (ch) {
        case 0: pActive =  6.0f; break;  // CH1 → NORMAL
        case 1: pActive =  9.0f; break;  // CH2 → HIGH LOAD
        case 2: pActive =  5.0f; break;  // CH3 → NORMAL
        case 3: pActive = 13.5f; break;  // CH4 → TRIP
        default: pActive = 0.0f; break;
    }
    float iRms   = pActive / vRms;
    float appVA  = vRms * iRms;
    float pf     = (appVA > 0.01f) ? pActive / appVA : 1.0f;
    if (pf >  1.0f) pf =  1.0f;
    if (pf < -1.0f) pf = -1.0f;

    // Noise floor: treat very small currents as zero for quality purposes
    if (iRms < ACS_NOISE_FLOOR_A) iRms = 0.0f;

    bool dspOk = (fabsf(pActive) <= appVA + DSP_SANITY_TOLERANCE_W);

    if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
    channels[ch].voltage        = vRms;
    channels[ch].current        = iRms;
    channels[ch].activePower    = pActive;
    channels[ch].apparentPowerVA = appVA;
    channels[ch].powerFactor    = pf;
    channels[ch].voltageValid   = true;
    channels[ch].currentValid   = true;
    channels[ch].measurementValid = true;
    channels[ch].dspSanityOk    = dspOk;
    channels[ch].sensorHealth   = dspOk ? SENSOR_GOOD : SENSOR_DEGRADED;
    channels[ch].loadPresent    = pActive > 0.1f;
    if (channelMutex) xSemaphoreGive(channelMutex);
    return true;

#else
    // ── Production hardware path ──────────────────────────────────────────────
    double sumV2 = 0.0, sumI2 = 0.0, sumVI = 0.0;
    float  minV  =  1e9f, maxV = -1e9f;

    const ChannelHardware& hw = GRIDGUARD_CHANNELS[ch];
    uint32_t start = micros();

    for (uint16_t n = 0; n < POWER_SAMPLE_COUNT; n++) {
        uint16_t rawV = analogRead(hw.zmptPin);
        uint16_t rawI = analogRead(hw.acsPin);

        // ZMPT101B: ADC → centered voltage → scaled instantaneous voltage
        float sensorV    = adcCountToVoltage((float)rawV);
        float centeredV  = sensorV - (ADC_REFERENCE_V / 2.0f);
        float instV      = centeredV * hw.cal.zmptCal;

        // ACS712: ADC → centered current counts → voltage delta → instantaneous current
        float centeredICounts  = (float)rawI - hw.cal.acsZeroCount;
        float centeredIVoltage = adcCountToVoltage(centeredICounts);
        float instI            = centeredIVoltage * hw.cal.acsSensitivity;

        // Noise floor: suppress sub-noise-floor current ADC jitter
        if (fabsf(instI) < ACS_NOISE_FLOOR_A) instI = 0.0f;

        sumV2 += (double)instV * (double)instV;
        sumI2 += (double)instI * (double)instI;
        // Signed instantaneous power accumulator — NO abs() here or ever
        sumVI += (double)instV * (double)instI;

        if (instV < minV) minV = instV;
        if (instV > maxV) maxV = instV;

        // Timing: maintain 100 µs sample interval
        uint32_t target = start + ((uint32_t)(n + 1) * SAMPLE_INTERVAL_US);
        while ((int32_t)(micros() - target) < 0) {
            delayMicroseconds(1);
        }
    }

    float N      = (float)POWER_SAMPLE_COUNT;
    float vRms   = sqrtf((float)(sumV2 / N));
    float iRms   = sqrtf((float)(sumI2 / N));
    // Authoritative signed active power — mean of signed instantaneous products
    float pActive = (float)(sumVI / N);
    float appVA   = vRms * iRms;
    float pf      = 0.0f;
    if (appVA > 0.01f) {
        pf = pActive / appVA;
        if (pf >  1.0f) pf =  1.0f;
        if (pf < -1.0f) pf = -1.0f;
    }

    float peakToPeak = maxV - minV;

    // ── Sensor plausibility checks ────────────────────────────────────────────
    bool voltageValid = isfinite(vRms)
                     && (vRms   >= VOLTAGE_MIN_V)
                     && (vRms   <= VOLTAGE_MAX_V)
                     && (peakToPeak >= VOLTAGE_MIN_PEAK_TO_PEAK_V);

    bool currentValid = isfinite(iRms)
                     && (iRms >= 0.0f)
                     && (iRms <= 20.0f);  // Sanity upper bound for ACS712 5A variant

    bool measureOk    = voltageValid && currentValid && isfinite(pActive);

    // ── DSP sanity: |P| ≤ S + tolerance (power factor law) ───────────────────
    bool dspSanityOk  = measureOk
                     && (fabsf(pActive) <= appVA + DSP_SANITY_TOLERANCE_W);

    SensorHealth health;
    if (!measureOk)         health = SENSOR_INVALID;
    else if (!dspSanityOk)  health = SENSOR_DEGRADED;
    else                    health = SENSOR_GOOD;

    if (!dspSanityOk && measureOk) {
        Serial.printf("[DSP SANITY] CH%d: |P|=%.2f W > S=%.2f VA + tol=%.2f — DEGRADED\n",
                      ch + 1, fabsf(pActive), appVA, DSP_SANITY_TOLERANCE_W);
    }

    if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
    channels[ch].voltage         = vRms;
    channels[ch].current         = iRms;
    channels[ch].activePower     = pActive;
    channels[ch].apparentPowerVA = appVA;
    channels[ch].powerFactor     = pf;
    channels[ch].voltageValid    = voltageValid;
    channels[ch].currentValid    = currentValid;
    channels[ch].measurementValid = measureOk;
    channels[ch].dspSanityOk     = dspSanityOk;
    channels[ch].sensorHealth    = health;
    channels[ch].loadPresent     = pActive > 0.10f;
    if (channelMutex) xSemaphoreGive(channelMutex);

    return measureOk;
#endif
}

// ==============================================================================
// SECTION 17: SENSOR VALIDATION HELPERS
// ==============================================================================
bool getChannelSnapshot(uint8_t ch, ChannelState& out) {
    if (ch >= NUM_CHANNELS) return false;
    if (channelMutex) {
        if (xSemaphoreTake(channelMutex, pdMS_TO_TICKS(100)) != pdTRUE) return false;
    }
    out = channels[ch];
    if (channelMutex) xSemaphoreGive(channelMutex);
    return true;
}

const char* protectionStateStr(ChannelProtectionState st) {
    switch (st) {
        case CH_BOOT:              return "BOOTING";
        case CH_SAFE_OUTPUTS:      return "SAFE_OUTPUTS";
        case CH_SENSOR_VALIDATING: return "SENSOR_VALIDATING";
        case CH_SENSOR_INVALID:    return "SENSOR_INVALID";
        case CH_MEASURING:         return "MEASURING";
        case CH_NORMAL:            return "NORMAL";
        case CH_HIGH_LOAD:         return "HIGH_LOAD";
        case CH_TRIPPED:           return "TRIPPED";
        case CH_RESETTING:         return "RESETTING";
        case CH_RELAY_FAULT:       return "RELAY_FAULT";
        case CH_SAFE_MODE:         return "SAFE_MODE";
        default:                   return "UNKNOWN";
    }
}

const char* relayVerifStr(RelayVerificationState vs) {
    switch (vs) {
        case RELAY_UNKNOWN:            return "UNKNOWN";
        case RELAY_CMD_ON:             return "CMD_ON";
        case RELAY_CMD_OFF:            return "CMD_OFF";
        case RELAY_VERIFIED_ON:        return "VERIFIED_ON";
        case RELAY_VERIFIED_OFF:       return "VERIFIED_OFF";
        case RELAY_MISMATCH:           return "RELAY_MISMATCH";
        case RELAY_STUCK_ON:           return "STUCK_ON";
        case RELAY_FEEDBACK_INVALID:   return "FEEDBACK_INVALID";
        case RELAY_FEEDBACK_NOT_AVAIL: return "NOT_AVAILABLE";
        default:                       return "UNKNOWN";
    }
}

const char* feedbackSourceStr(RelayFeedbackSource src) {
    switch (src) {
        case FB_NOT_INSTALLED: return "NOT_INSTALLED";
        case FB_PHYSICAL:      return "PHYSICAL_CONTACT";
        case FB_SIMULATOR:     return "SIMULATOR";
        default:               return "UNKNOWN";
    }
}

const char* sensorHealthStr(SensorHealth h) {
    switch (h) {
        case SENSOR_GOOD:     return "GOOD";
        case SENSOR_DEGRADED: return "DEGRADED";
        case SENSOR_INVALID:  return "INVALID";
        default:              return "UNKNOWN";
    }
}

const char* mqttStateStr(MqttConnState s) {
    switch (s) {
        case GRIDGUARD_MQTT_DISCONNECTED: return "DISCONNECTED";
        case GRIDGUARD_MQTT_CONNECTING:   return "CONNECTING";
        case GRIDGUARD_MQTT_CONNECTED:    return "CONNECTED";
        case GRIDGUARD_MQTT_BACKOFF:      return "BACKOFF";
        case GRIDGUARD_MQTT_ERROR:        return "ERROR";
        default:                return "UNKNOWN";
    }
}

// ==============================================================================
// SECTION 18: PROTECTION STATE MACHINE
// ==============================================================================
/**
 * evaluateChannelProtection — per-channel independent protection authority.
 *
 * Decision table:
 *   faultLatched          → relays OFF, CH_TRIPPED
 *   !measurementValid     → relays OFF, CH_SENSOR_INVALID
 *   !dspSanityOk          → relays OFF, CH_SENSOR_INVALID (impossible physics)
 *   P > 12 W (×2 consec.) → trip → CH_TRIPPED + NVS latch
 *   7 < P ≤ 12 W          → staged Main ON → Aux ON → CH_HIGH_LOAD
 *   P ≤ 7 W               → Main ON, Aux OFF → CH_NORMAL
 *   Each relay transition is verified via verifyRelay()
 */
void evaluateChannelProtection(uint8_t ch) {
    if (ch >= NUM_CHANNELS) return;

    ChannelState state;
    if (!getChannelSnapshot(ch, state)) return;

    // ── SAFE MODE: no recovery ────────────────────────────────────────────────
    if (state.currentState == CH_SAFE_MODE) {
        setChannelRelays(ch, false, false);
        return;
    }

    // ── FAULT LATCHED: relays must remain OFF ────────────────────────────────
    if (state.faultLatched) {
        setChannelRelays(ch, false, false);
        if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
        channels[ch].currentState = CH_TRIPPED;
        if (channelMutex) xSemaphoreGive(channelMutex);
        return;
    }

    // ── SENSOR INVALID: both relays off (not an overload) ────────────────────
    if (!state.measurementValid || !state.dspSanityOk) {
        setChannelRelays(ch, false, false);
        if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
        channels[ch].currentState = CH_SENSOR_INVALID;
        channels[ch].sensorInvalidCount++;
        if (channelMutex) xSemaphoreGive(channelMutex);
        overloadConsecutive[ch] = 0;
        pushEvent(EV_SENSOR_INVALID, ch, "MEASUREMENT_INVALID");
        Serial.printf("[SENSOR] CH%d SENSOR_INVALID → relays OFF\n", ch + 1);
        return;
    }

    // ── OVERLOAD: P > 12 W ───────────────────────────────────────────────────
    if (state.activePower > POWER_HIGH_W) {
        overloadConsecutive[ch]++;
        Serial.printf("[PROTECT] CH%d P=%.2f W > 12 W (%d/%d consec.)\n",
                      ch + 1, state.activePower,
                      overloadConsecutive[ch], OVERLOAD_PERSISTENCE_CYCLES);
        if (overloadConsecutive[ch] >= OVERLOAD_PERSISTENCE_CYCLES) {
            overloadConsecutive[ch] = 0;
            tripChannel(ch, "ACTIVE_POWER_OVER_12W");
        }
        return;
    }
    overloadConsecutive[ch] = 0;

    // ── HIGH LOAD: 7 W < P ≤ 12 W ───────────────────────────────────────────
    if (state.activePower > POWER_NORMAL_W) {
        normalReturnConsec[ch] = 0;

        if (!state.main.commanded) {
            // Stage 1: Main ON first
            setRelayCommand(ch, true, true);
            RelayVerificationState vMain = verifyRelay(ch, true, true, RELAY_STABILIZATION_MS);

            if (vMain == RELAY_MISMATCH || vMain == RELAY_FEEDBACK_INVALID) {
                Serial.printf("[RELAY FAULT] CH%d MAIN stuck-off on HIGH_LOAD entry\n", ch + 1);
                setChannelRelays(ch, false, false);
                if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
                channels[ch].currentState = CH_RELAY_FAULT;
                if (channelMutex) xSemaphoreGive(channelMutex);
                pushEvent(EV_RELAY_FAULT, ch, "MAIN_STUCK_OFF");
                return;
            }
            if (vMain == RELAY_STUCK_ON) {
                Serial.printf("[RELAY FAULT] CH%d MAIN stuck-on\n", ch + 1);
                if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
                channels[ch].currentState = CH_RELAY_FAULT;
                if (channelMutex) xSemaphoreGive(channelMutex);
                pushEvent(EV_RELAY_MISMATCH, ch, "MAIN_STUCK_ON");
                return;
            }

            // Remeasure after Main energised
            measureChannel(ch);
            ChannelState rem;
            if (!getChannelSnapshot(ch, rem)) return;

            if (rem.activePower > POWER_HIGH_W) {
                tripChannel(ch, "POST_MAIN_OVER_12W_HIGH_LOAD");
                return;
            }
            if (!rem.measurementValid) {
                setChannelRelays(ch, false, false);
                if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
                channels[ch].currentState = CH_SENSOR_INVALID;
                if (channelMutex) xSemaphoreGive(channelMutex);
                return;
            }

            if (rem.activePower > POWER_NORMAL_W) {
                // Still high load — energise Aux
                setRelayCommand(ch, false, true);
                RelayVerificationState vAux = verifyRelay(ch, false, true,
                                                          RELAY_FEEDBACK_SETTLE_MS);
                if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
                if (vAux == RELAY_MISMATCH || vAux == RELAY_STUCK_ON) {
                    channels[ch].currentState = CH_RELAY_FAULT;
                    pushEvent(EV_RELAY_FAULT, ch, "AUX_FAULT_HIGH_LOAD");
                } else {
                    channels[ch].currentState = CH_HIGH_LOAD;
                    channels[ch].highLoadCount++;
                    pushEvent(EV_HIGH_LOAD, ch, nullptr);
                }
                if (channelMutex) xSemaphoreGive(channelMutex);
            } else {
                // Returned to normal after energising Main
                setRelayCommand(ch, false, false);
                verifyRelay(ch, false, false, RELAY_FEEDBACK_SETTLE_MS);
                if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
                channels[ch].currentState = CH_NORMAL;
                pushEvent(EV_NORMAL, ch, nullptr);
                if (channelMutex) xSemaphoreGive(channelMutex);
            }

        } else {
            // Main already ON — ensure Aux is ON, verify both
            setRelayCommand(ch, false, true);
            RelayVerificationState vAux = verifyRelay(ch, false, true, RELAY_FEEDBACK_SETTLE_MS);
            if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
            channels[ch].currentState = (vAux == RELAY_FEEDBACK_NOT_AVAIL
                                     || vAux == RELAY_VERIFIED_ON)
                                        ? CH_HIGH_LOAD : CH_RELAY_FAULT;
            if (channels[ch].currentState == CH_HIGH_LOAD) {
                channels[ch].highLoadCount++;
                pushEvent(EV_HIGH_LOAD, ch, "MAINTAINED");
            }
            if (channelMutex) xSemaphoreGive(channelMutex);
        }
        return;
    }

    // ── NORMAL: P ≤ 7 W ──────────────────────────────────────────────────────
    // Hysteresis: if in HIGH_LOAD, require P ≤ (7.0 - 0.2 = 6.8 W) to drop
    if (state.currentState == CH_HIGH_LOAD) {
        if (state.activePower > (POWER_NORMAL_W - POWER_HYSTERESIS_W)) {
            normalReturnConsec[ch]++;
            if (normalReturnConsec[ch] < 2) return; // chatter prevention
        }
    }
    normalReturnConsec[ch] = 0;

    if (!state.main.commanded) {
        // First activation: staged Main ON → verify → remeasure
        setRelayCommand(ch, true, true);
        RelayVerificationState vMain = verifyRelay(ch, true, true, RELAY_STABILIZATION_MS);

        if (vMain == RELAY_MISMATCH || vMain == RELAY_FEEDBACK_INVALID) {
            setChannelRelays(ch, false, false);
            if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
            channels[ch].currentState = CH_RELAY_FAULT;
            if (channelMutex) xSemaphoreGive(channelMutex);
            pushEvent(EV_RELAY_FAULT, ch, "MAIN_STUCK_OFF_NORMAL");
            return;
        }

        measureChannel(ch);
        ChannelState rem;
        if (!getChannelSnapshot(ch, rem)) return;

        if (rem.activePower > POWER_HIGH_W) {
            tripChannel(ch, "POST_MAIN_OVER_12W_NORMAL");
            return;
        }
        if (!rem.measurementValid) {
            setChannelRelays(ch, false, false);
            if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
            channels[ch].currentState = CH_SENSOR_INVALID;
            if (channelMutex) xSemaphoreGive(channelMutex);
            return;
        }
        if (rem.activePower > POWER_NORMAL_W) {
            // Escalated to high load after Main energised
            setRelayCommand(ch, false, true);
            verifyRelay(ch, false, true, RELAY_FEEDBACK_SETTLE_MS);
            if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
            channels[ch].currentState = CH_HIGH_LOAD;
            channels[ch].highLoadCount++;
            pushEvent(EV_HIGH_LOAD, ch, "ESCALATED_FROM_NORMAL");
            if (channelMutex) xSemaphoreGive(channelMutex);
            return;
        }
    }

    // Normal state — ensure Aux is off, verify
    if (state.aux.commanded) {
        setRelayCommand(ch, false, false);
        verifyRelay(ch, false, false, RELAY_FEEDBACK_SETTLE_MS);
    }

    if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
    if (channels[ch].currentState != CH_NORMAL) {
        channels[ch].currentState = CH_NORMAL;
        channels[ch].fault[0] = '\0';
        pushEvent(EV_NORMAL, ch, nullptr);
    }
    if (channelMutex) xSemaphoreGive(channelMutex);
}

// ==============================================================================
// SECTION 19: TRIP HANDLING
// ==============================================================================
void tripChannel(uint8_t ch, const char* reason) {
    if (ch >= NUM_CHANNELS) return;

    Serial.printf("\n[TRIP] ════ CH%d PROTECTION TRIP ════\n[TRIP] Reason: %s\n", ch + 1, reason);

    // 1. Immediate relay de-energisation
    setRelayCommand(ch, true,  false);
    setRelayCommand(ch, false, false);

    // 2. Verify both relays physically OFF
    RelayVerificationState vMain = verifyRelay(ch, true,  false, RELAY_FEEDBACK_SETTLE_MS);
    RelayVerificationState vAux  = verifyRelay(ch, false, false, RELAY_FEEDBACK_SETTLE_MS);

    bool safetyFault = (vMain == RELAY_STUCK_ON || vAux == RELAY_STUCK_ON);
    if (safetyFault) {
        Serial.printf("[RELAY SAFETY] CH%d RELAY STUCK-ON AFTER TRIP! CRITICAL FAULT!\n", ch + 1);
        pushEvent(EV_RELAY_FAULT, ch, "STUCK_ON_AFTER_TRIP");
    }

    // 3. Latch fault
    if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
    channels[ch].faultLatched = true;
    channels[ch].currentState = safetyFault ? CH_SAFE_MODE : CH_TRIPPED;
    channels[ch].loadPresent  = false;
    strncpy(channels[ch].fault, reason, sizeof(channels[ch].fault) - 1);
    channels[ch].fault[sizeof(channels[ch].fault) - 1] = '\0';
    channels[ch].faultCount++;
    channels[ch].tripCount++;
    if (channelMutex) xSemaphoreGive(channelMutex);

    // 4. Persist to NVS
    saveFaultToNVS(ch, reason, channels[ch].tripCount);

    pushEvent(EV_TRIP, ch, reason);

    // 5. Publish fault event
    if (mqttClient.connected()) {
        StaticJsonDocument<512> doc;
        char timeBuf[32];
        doc["timestamp"]            = getIsoTimestamp(timeBuf, sizeof(timeBuf)) ? timeBuf : nullptr;
        doc["uptime_ms"]            = millis();
        doc["sequence"]             = ++seqNumber;
        doc["device_id"]            = DEVICE_ID;
        doc["device_mode"]          = DEVICE_MODE_STR;
        doc["telemetry_source"]     = TELEMETRY_SOURCE_STR;
        doc["channel"]              = ch + 1;
        doc["event"]                = "PROTECTION_TRIP";
        doc["fault_type"]           = reason;
        doc["severity"]             = "CRITICAL";
        doc["main_relay_cmd"]       = false;
        if (vMain != RELAY_FEEDBACK_NOT_AVAIL && vMain != RELAY_FEEDBACK_INVALID && vMain != RELAY_UNKNOWN) {
            doc["main_relay_feedback"] = channels[ch].main.feedback;
        } else {
            doc["main_relay_feedback"] = nullptr;
        }
        doc["main_relay_status"]    = relayVerifStr(vMain);
        doc["aux_relay_cmd"]        = false;
        if (vAux != RELAY_FEEDBACK_NOT_AVAIL && vAux != RELAY_FEEDBACK_INVALID && vAux != RELAY_UNKNOWN) {
            doc["aux_relay_feedback"] = channels[ch].aux.feedback;
        } else {
            doc["aux_relay_feedback"] = nullptr;
        }
        doc["aux_relay_status"]     = relayVerifStr(vAux);
        doc["relay_safety_fault"]   = safetyFault;
        char buf[512];
        serializeJson(doc, buf);
        mqttClient.publish(TOPIC_FAULTS, buf, false);
    }
}

// ==============================================================================
// SECTION 20: RESET HANDLING
// ==============================================================================
/**
 * executeResetSequence — authorised deterministic reset.
 *
 * Safety sequence:
 *   Authorisation check
 *   → Both relays OFF + verify feedback
 *   → Clear fault (only if below trip threshold)
 *   → Main ON → verify → remeasure
 *   → Protection decision
 *   → Aux ON only if HIGH_LOAD
 *   → Verify Aux feedback
 */
void executeResetSequence(uint8_t ch, const char* authorizedBy,
                           const char* authId, const char* corrId) {
    if (ch >= NUM_CHANNELS) return;

    ChannelState state;
    if (!getChannelSnapshot(ch, state)) return;

    if (!state.faultLatched) {
        publishCommandAck("RESET", false, "CHANNEL_NOT_LATCHED", ch + 1, corrId, "RESET_REJECTED");
        return;
    }

    if (state.currentState == CH_SAFE_MODE) {
        publishCommandAck("RESET", false, "CHANNEL_IN_SAFE_MODE", ch + 1, corrId, "RESET_REJECTED");
        return;
    }

    Serial.printf("[RESET] CH%d → Auth: %s | AuthID: %s | Corr: %s\n",
                  ch + 1, authorizedBy, authId, corrId);

    if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
    channels[ch].currentState = CH_RESETTING;
    if (channelMutex) xSemaphoreGive(channelMutex);

    // Step 1: Both relays OFF
    setChannelRelays(ch, false, false);
    RelayVerificationState vMain0 = verifyRelay(ch, true,  false, RELAY_FEEDBACK_SETTLE_MS);
    RelayVerificationState vAux0  = verifyRelay(ch, false, false, RELAY_FEEDBACK_SETTLE_MS);

    if (vMain0 == RELAY_STUCK_ON || vAux0 == RELAY_STUCK_ON) {
        publishCommandAck("RESET", false, "RELAY_STUCK_ON_PRE_RESET", ch + 1, corrId, "RESET_FAILED");
        if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
        channels[ch].currentState = CH_RELAY_FAULT;
        if (channelMutex) xSemaphoreGive(channelMutex);
        pushEvent(EV_RELAY_FAULT, ch, "STUCK_ON_PRE_RESET");
        return;
    }

    // Step 2: Sensor measurement with Main ON
    setRelayCommand(ch, true, true);
    RelayVerificationState vMain1 = verifyRelay(ch, true, true, RELAY_STABILIZATION_MS);

    if (vMain1 == RELAY_MISMATCH) {
        setChannelRelays(ch, false, false);
        publishCommandAck("RESET", false, "MAIN_RELAY_STUCK_OFF", ch + 1, corrId, "RESET_FAILED");
        if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
        channels[ch].currentState = CH_RELAY_FAULT;
        if (channelMutex) xSemaphoreGive(channelMutex);
        return;
    }

    bool measValid = measureChannel(ch);
    if (!measValid) {
        setChannelRelays(ch, false, false);
        publishCommandAck("RESET", false, "SENSOR_INVALID_AFTER_RESET", ch + 1, corrId, "RESET_REJECTED");
        if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
        channels[ch].currentState = CH_SENSOR_INVALID;
        if (channelMutex) xSemaphoreGive(channelMutex);
        return;
    }

    ChannelState measured;
    if (!getChannelSnapshot(ch, measured)) return;

    // Step 3: Protection decision
    if (measured.activePower > POWER_HIGH_W) {
        // Still overloaded — re-trip
        tripChannel(ch, "POWER_STILL_OVER_12W_AFTER_RESET");
        publishCommandAck("RESET", false, "LOAD_STILL_OVER_12W", ch + 1, corrId, "RESET_REJECTED");
        publishChannelTelemetry(ch);
        return;
    }

    // Clear fault latch
    clearFaultFromNVS(ch);
    if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
    channels[ch].faultLatched = false;
    channels[ch].fault[0] = '\0';
    channels[ch].resetCount++;
    if (channelMutex) xSemaphoreGive(channelMutex);

    pushEvent(EV_RESET, ch, authorizedBy);

    if (measured.activePower <= POWER_NORMAL_W) {
        // Normal — Aux OFF, verify
        setRelayCommand(ch, false, false);
        RelayVerificationState vAux1 = verifyRelay(ch, false, false, RELAY_FEEDBACK_SETTLE_MS);
        if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
        channels[ch].currentState = CH_NORMAL;
        if (channelMutex) xSemaphoreGive(channelMutex);
        publishCommandAck("RESET", true, "CHANNEL_RESTORED_NORMAL", ch + 1, corrId, "RESET_CONFIRMED");

    } else {
        // High load — Aux ON, verify
        setRelayCommand(ch, false, true);
        RelayVerificationState vAux1 = verifyRelay(ch, false, true, RELAY_FEEDBACK_SETTLE_MS);
        if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
        channels[ch].currentState = CH_HIGH_LOAD;
        channels[ch].highLoadCount++;
        if (channelMutex) xSemaphoreGive(channelMutex);
        publishCommandAck("RESET", true, "CHANNEL_RESTORED_HIGH_LOAD", ch + 1, corrId, "RESET_CONFIRMED");
    }

    publishChannelTelemetry(ch);
}

// ==============================================================================
// SECTION 21: MQTT COMMAND HANDLING
// ==============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    if (strcmp(topic, TOPIC_COMMANDS) != 0) return;

    StaticJsonDocument<1024> doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) {
        Serial.printf("[MQTT CMD] JSON parse error: %s\n", err.c_str());
        return;
    }

    const char* command         = doc["command"]         | doc["action"]         | "";
    int         channel         = doc["channel"]         | 0;
    const char* authorizedBy    = doc["authorized_by"]   | "";
    const char* authorizationId = doc["authorization_id"]| "";
    const char* correlationId   = doc["correlation_id"]  | "CORR-UNSPECIFIED";
    const char* targetDeviceId  = doc["device_id"]       | "";

    // Reject commands for wrong device
    if (strlen(targetDeviceId) > 0 && strcmp(targetDeviceId, DEVICE_ID) != 0) {
        Serial.printf("[MQTT CMD] Ignored: command for device '%s' (not us)\n", targetDeviceId);
        sysCounters.commandRejectCount++;
        return;
    }

    Serial.printf("[MQTT CMD] %s | CH%d | Auth: %s | Corr: %s\n",
                  command, channel, authorizedBy, correlationId);

    // ── TRIP ──────────────────────────────────────────────────────────────────
    if (strcmp(command, "TRIP_CHANNEL") == 0 || strcmp(command, "TRIP") == 0) {
        if (channel < 1 || channel > NUM_CHANNELS) {
            publishCommandAck("TRIP_CHANNEL", false, "INVALID_CHANNEL", channel, correlationId, "REJECTED");
            sysCounters.commandRejectCount++;
            return;
        }
        tripChannel((uint8_t)(channel - 1), "REMOTE_OPERATOR_TRIP");
        publishCommandAck("TRIP_CHANNEL", true, "TRIP_CONFIRMED", channel, correlationId, "CONFIRMED");
        publishChannelTelemetry((uint8_t)(channel - 1));
        return;
    }

    // ── RESET ─────────────────────────────────────────────────────────────────
    if (strcmp(command, "RESET") == 0 || strcmp(command, "RESET_REQUEST") == 0
                                      || strcmp(command, "RESET_LATCH") == 0) {
        if (channel < 1 || channel > NUM_CHANNELS) {
            publishCommandAck("RESET", false, "INVALID_CHANNEL", channel, correlationId, "REJECTED");
            sysCounters.commandRejectCount++;
            return;
        }
        if (strlen(authorizationId) == 0 || strlen(authorizedBy) == 0) {
            publishCommandAck("RESET", false, "AUTH_METADATA_REQUIRED", channel, correlationId, "AUTH_FAILED");
            sysCounters.commandRejectCount++;
            return;
        }
        executeResetSequence((uint8_t)(channel - 1), authorizedBy, authorizationId, correlationId);
        return;
    }

    // ── START_CHANNEL  (must not bypass protection) ───────────────────────────
    if (strcmp(command, "START_CHANNEL") == 0) {
        if (channel < 1 || channel > NUM_CHANNELS) {
            publishCommandAck("START_CHANNEL", false, "INVALID_CHANNEL", channel, correlationId, "REJECTED");
            sysCounters.commandRejectCount++;
            return;
        }
        uint8_t ch = (uint8_t)(channel - 1);
        ChannelState st;
        if (getChannelSnapshot(ch, st) && st.faultLatched) {
            publishCommandAck("START_CHANNEL", false, "FAULT_LATCHED_RESET_REQUIRED",
                              channel, correlationId, "REJECTED");
            sysCounters.commandRejectCount++;
            return;
        }
        // Re-evaluate through protection engine (sensor-first, no bypass)
        measureChannel(ch);
        evaluateChannelProtection(ch);
        publishCommandAck("START_CHANNEL", true, "CHANNEL_EVALUATED", channel, correlationId, "CONFIRMED");
        publishChannelTelemetry(ch);
        return;
    }

    // ── Unknown ───────────────────────────────────────────────────────────────
    publishCommandAck(command, false, "UNRECOGNIZED_COMMAND", channel, correlationId, "REJECTED");
    sysCounters.commandRejectCount++;
}

// ==============================================================================
// SECTION 22: MQTT TELEMETRY
// ==============================================================================

bool getIsoTimestamp(char* buf, size_t maxLen) {
    if (!ntpSynced) {
        time_t testNow = time(nullptr);
        if (testNow > 1700000000L) ntpSynced = true;
    }
    if (!ntpSynced) return false;
    time_t now = time(nullptr);
    struct tm ti;
    gmtime_r(&now, &ti);
    strftime(buf, maxLen, "%Y-%m-%dT%H:%M:%SZ", &ti);
    return true;
}

void publishChannelTelemetry(uint8_t ch) {
    if (ch >= NUM_CHANNELS || !mqttClient.connected()) return;

    ChannelState state;
    if (!getChannelSnapshot(ch, state)) return;

    StaticJsonDocument<768> doc;
    char timeBuf[32];
    doc["timestamp"]         = getIsoTimestamp(timeBuf, sizeof(timeBuf)) ? timeBuf : nullptr;
    doc["uptime_ms"]         = millis();
    doc["sequence"]          = ++seqNumber;
    doc["device_id"]         = DEVICE_ID;
    doc["device_mode"]       = DEVICE_MODE_STR;
    doc["telemetry_source"]  = TELEMETRY_SOURCE_STR;
    doc["firmware_version"]  = FW_VERSION_STR;
    doc["channel"]           = ch + 1;

    // Sensor data — null if invalid
    if (state.voltageValid && isfinite(state.voltage))
        doc["voltage"]  = roundf(state.voltage * 100.0f) / 100.0f;
    else
        doc["voltage"]  = nullptr;

    if (state.currentValid && isfinite(state.current))
        doc["current"]  = roundf(state.current * 1000.0f) / 1000.0f;
    else
        doc["current"]  = nullptr;

    if (state.measurementValid && isfinite(state.activePower))
        doc["active_power"] = roundf(state.activePower * 100.0f) / 100.0f;
    else
        doc["active_power"] = nullptr;

    if (state.measurementValid && isfinite(state.apparentPowerVA))
        doc["apparent_power_va"] = roundf(state.apparentPowerVA * 100.0f) / 100.0f;
    else
        doc["apparent_power_va"] = nullptr;

    if (state.measurementValid && isfinite(state.powerFactor))
        doc["power_factor"] = roundf(state.powerFactor * 100.0f) / 100.0f;
    else
        doc["power_factor"] = nullptr;

    doc["sensor_health"]  = sensorHealthStr(state.sensorHealth);
    doc["dsp_sanity_ok"]  = state.dspSanityOk;

    // Relay states — command + physical feedback + verification
    JsonObject mainRelay = doc.createNestedObject("main_relay");
    mainRelay["command"]      = state.main.commanded;
    if (state.main.verification != RELAY_FEEDBACK_NOT_AVAIL && 
        state.main.verification != RELAY_FEEDBACK_INVALID &&
        state.main.verification != RELAY_UNKNOWN) {
        mainRelay["feedback"] = state.main.feedback;
    } else {
        mainRelay["feedback"] = nullptr;
    }
    mainRelay["status"]       = relayVerifStr(state.main.verification);
    mainRelay["feedback_source"] = feedbackSourceStr(state.main.source);

    JsonObject auxRelay = doc.createNestedObject("aux_relay");
    auxRelay["command"]       = state.aux.commanded;
    if (state.aux.verification != RELAY_FEEDBACK_NOT_AVAIL && 
        state.aux.verification != RELAY_FEEDBACK_INVALID &&
        state.aux.verification != RELAY_UNKNOWN) {
        auxRelay["feedback"] = state.aux.feedback;
    } else {
        auxRelay["feedback"] = nullptr;
    }
    auxRelay["status"]        = relayVerifStr(state.aux.verification);
    auxRelay["feedback_source"] = feedbackSourceStr(state.aux.source);

    doc["relay_feedback_source"] = feedbackSourceStr(state.main.source);

    doc["status"]         = protectionStateStr(state.currentState);
    doc["fault"]          = (strlen(state.fault) > 0) ? state.fault : nullptr;
    doc["fault_latched"]  = state.faultLatched;

    char buffer[768];
    serializeJson(doc, buffer);
    bool ok = mqttClient.publish(TOPIC_CHANNELS[ch], buffer, false);
    if (!ok) sysCounters.mqttPublishFailCount++;
}

void publishSystemTelemetry() {
    if (!mqttClient.connected()) return;

    float voltage   = pzem.voltage();
    float current   = pzem.current();
    float power     = pzem.power();
    float energy    = pzem.energy();
    float frequency = pzem.frequency();
    float pf        = pzem.pf();

#ifdef DEV_TEST_MODE
    // Simulator PZEM injection — labelled SIMULATOR
    if (!isfinite(voltage))   voltage   = 230.2f;
    if (!isfinite(current))   current   = 0.104f;
    if (!isfinite(power))     power     = 24.0f;
    if (!isfinite(energy))    energy    = 0.05f;
    if (!isfinite(frequency)) frequency = 50.0f;
    if (!isfinite(pf))        pf        = 1.0f;
#endif

    StaticJsonDocument<512> doc;
    char timeBuf[32];
    doc["timestamp"]        = getIsoTimestamp(timeBuf, sizeof(timeBuf)) ? timeBuf : nullptr;
    doc["uptime_ms"]        = millis();
    doc["sequence"]         = ++seqNumber;
    doc["device_id"]        = DEVICE_ID;
    doc["device_mode"]      = DEVICE_MODE_STR;
    doc["telemetry_source"] = TELEMETRY_SOURCE_STR;
    doc["firmware_version"] = FW_VERSION_STR;

    // PZEM data — null if hardware not present / not responding
    if (isfinite(voltage)) doc["voltage"] = roundf(voltage * 10.0f) / 10.0f;
    else doc["voltage"] = nullptr;

    if (isfinite(current)) doc["current"] = roundf(current * 1000.0f) / 1000.0f;
    else doc["current"] = nullptr;

    if (isfinite(power)) doc["power"] = roundf(power * 10.0f) / 10.0f;
    else doc["power"] = nullptr;

    if (isfinite(energy)) doc["energy"] = roundf(energy * 100.0f) / 100.0f;
    else doc["energy"] = nullptr;

    if (isfinite(frequency)) doc["frequency"] = roundf(frequency * 10.0f) / 10.0f;
    else doc["frequency"] = nullptr;

    if (isfinite(pf)) doc["power_factor"] = roundf(pf * 100.0f) / 100.0f;
    else doc["power_factor"] = nullptr;

    char buffer[512];
    serializeJson(doc, buffer);
    bool ok = mqttClient.publish(TOPIC_SYSTEM, buffer, false);
    if (!ok) sysCounters.mqttPublishFailCount++;
}

void publishHeartbeat() {
    if (!mqttClient.connected()) return;

    StaticJsonDocument<1024> doc;
    char timeBuf[32];
    doc["timestamp"]         = getIsoTimestamp(timeBuf, sizeof(timeBuf)) ? timeBuf : nullptr;
    doc["uptime_ms"]         = millis();
    doc["sequence"]          = ++seqNumber;
    doc["device_id"]         = DEVICE_ID;
    doc["device_mode"]       = DEVICE_MODE_STR;
    doc["telemetry_source"]  = TELEMETRY_SOURCE_STR;
    doc["firmware_version"]  = FW_VERSION_STR;
    doc["build_id"]          = FIRMWARE_BUILD_ID;
    doc["controller"]        = CONTROLLER_TARGET;
    doc["controller_status"] = "ONLINE";
    doc["wifi_status"]       = WiFi.isConnected() ? "CONNECTED" : "DISCONNECTED";
    doc["wifi_rssi_dbm"]     = WiFi.RSSI();
    doc["mqtt_status"]       = mqttStateStr(mqttState);
    doc["free_heap_bytes"]   = esp_get_free_heap_size();
    doc["boot_count"]        = bootDiag.bootCount;
    doc["last_reset_reason"] = bootDiag.resetReason;
    doc["watchdog_count"]    = bootDiag.watchdogCount;
    doc["brownout_count"]    = bootDiag.brownoutCount;
    doc["protection_policy"] = "7W_12W_ACTIVE_POWER";
    doc["relay_feedback"]    = RELAY_FEEDBACK_INSTALLED ? "PHYSICAL_CONTACT" : "NOT_INSTALLED";

    JsonArray chArr = doc.createNestedArray("channels");
    for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
        ChannelState st;
        if (getChannelSnapshot(ch, st)) {
            JsonObject o = chArr.createNestedObject();
            o["channel"]       = ch + 1;
            o["status"]        = protectionStateStr(st.currentState);
            o["main_cmd"]      = st.main.commanded;
            o["aux_cmd"]       = st.aux.commanded;
            o["main_verified"] = relayVerifStr(st.main.verification);
            o["aux_verified"]  = relayVerifStr(st.aux.verification);
            o["fault_latched"] = st.faultLatched;
            if (st.measurementValid && isfinite(st.activePower))
                o["active_power"] = roundf(st.activePower * 100.0f) / 100.0f;
            else
                o["active_power"] = nullptr;
        }
    }

    char buffer[1024];
    serializeJson(doc, buffer);
    bool ok = mqttClient.publish(TOPIC_HEARTBEAT, buffer, false);
    if (!ok) sysCounters.mqttPublishFailCount++;
}

void publishRelayEvent(uint8_t ch, bool isMain, bool commanded,
                       RelayVerificationState vstate) {
    if (!mqttClient.connected()) return;

    ChannelState state;
    getChannelSnapshot(ch, state);
    const RelayState& rs = isMain ? state.main : state.aux;

    StaticJsonDocument<384> doc;
    char timeBuf[32];
    doc["timestamp"]      = getIsoTimestamp(timeBuf, sizeof(timeBuf)) ? timeBuf : nullptr;
    doc["uptime_ms"]      = millis();
    doc["device_id"]      = DEVICE_ID;
    doc["device_mode"]    = DEVICE_MODE_STR;
    doc["channel"]        = ch + 1;
    doc["relay"]          = isMain ? "MAIN" : "AUX";
    doc["commanded"]      = commanded;
    if (vstate != RELAY_FEEDBACK_NOT_AVAIL && 
        vstate != RELAY_FEEDBACK_INVALID &&
        vstate != RELAY_UNKNOWN) {
        doc["feedback"] = rs.feedback;
    } else {
        doc["feedback"] = nullptr;
    }
    doc["status"]         = relayVerifStr(vstate);
    doc["feedback_source"]= feedbackSourceStr(rs.source);

    char buf[384];
    serializeJson(doc, buf);
    mqttClient.publish(TOPIC_RELAY_EVENTS, buf, false);
}

void publishCommandAck(const char* cmd, bool accepted, const char* reason,
                        int ch, const char* corrId, const char* statusStr) {
    if (!mqttClient.connected()) return;

    StaticJsonDocument<768> doc;
    char timeBuf[32];
    doc["timestamp"]      = getIsoTimestamp(timeBuf, sizeof(timeBuf)) ? timeBuf : nullptr;
    doc["uptime_ms"]      = millis();
    doc["device_id"]      = DEVICE_ID;
    doc["command"]        = cmd;
    doc["accepted"]       = accepted;
    doc["status"]         = statusStr ? statusStr : (accepted ? "CONFIRMED" : "REJECTED");
    doc["channel"]        = ch;
    doc["reason"]         = reason;
    doc["correlation_id"] = corrId;

    if (ch >= 1 && ch <= NUM_CHANNELS) {
        ChannelState state;
        if (getChannelSnapshot((uint8_t)(ch - 1), state)) {
            JsonObject mainR = doc.createNestedObject("main_relay");
            mainR["command"]  = state.main.commanded;
            if (state.main.verification != RELAY_FEEDBACK_NOT_AVAIL && 
                state.main.verification != RELAY_FEEDBACK_INVALID &&
                state.main.verification != RELAY_UNKNOWN) {
                mainR["feedback"] = state.main.feedback;
            } else {
                mainR["feedback"] = nullptr;
            }
            mainR["verification"] = relayVerifStr(state.main.verification);

            JsonObject auxR = doc.createNestedObject("aux_relay");
            auxR["command"]   = state.aux.commanded;
            if (state.aux.verification != RELAY_FEEDBACK_NOT_AVAIL && 
                state.aux.verification != RELAY_FEEDBACK_INVALID &&
                state.aux.verification != RELAY_UNKNOWN) {
                auxR["feedback"] = state.aux.feedback;
            } else {
                auxR["feedback"] = nullptr;
            }
            auxR["verification"] = relayVerifStr(state.aux.verification);

            if (state.measurementValid && isfinite(state.activePower))
                doc["active_power"] = roundf(state.activePower * 100.0f) / 100.0f;
            else
                doc["active_power"] = nullptr;
            doc["fault_latched"] = state.faultLatched;
        }
    }

    char buffer[768];
    serializeJson(doc, buffer);
    mqttClient.publish(TOPIC_CMD_ACK, buffer, false);
}

void publishBootStatus() {
    if (!mqttClient.connected()) return;

    StaticJsonDocument<512> doc;
    char timeBuf[32];
    doc["timestamp"]         = getIsoTimestamp(timeBuf, sizeof(timeBuf)) ? timeBuf : nullptr;
    doc["uptime_ms"]         = millis();
    doc["device_id"]         = DEVICE_ID;
    doc["device_mode"]       = DEVICE_MODE_STR;
    doc["firmware_version"]  = FW_VERSION_STR;
    doc["build_id"]          = FIRMWARE_BUILD_ID;
    doc["boot_count"]        = bootDiag.bootCount;
    doc["last_reset_reason"] = (int)bootDiag.resetReason;
    doc["watchdog_count"]    = bootDiag.watchdogCount;
    doc["brownout_count"]    = bootDiag.brownoutCount;
    doc["relay_feedback"]    = RELAY_FEEDBACK_INSTALLED ? "PHYSICAL_CONTACT" : "NOT_INSTALLED";

    char buffer[512];
    serializeJson(doc, buffer);
    mqttClient.publish(TOPIC_BOOT_STATUS, buffer, false);
}

// ==============================================================================
// SECTION 22b: WI-FI DIAGNOSTIC EVENT CALLBACK
// Registered once in setup(). Read-only — no connection behaviour changed.
// ==============================================================================
static const char* wifiDisconnectReasonStr(uint8_t reason) {
    switch (reason) {
        case 1:   return "UNSPECIFIED";
        case 2:   return "AUTH_EXPIRE";
        case 3:   return "AUTH_LEAVE";
        case 4:   return "ASSOC_EXPIRE";
        case 5:   return "ASSOC_TOOMANY";
        case 6:   return "NOT_AUTHED";
        case 7:   return "NOT_ASSOCED";
        case 8:   return "ASSOC_LEAVE";
        case 9:   return "ASSOC_NOT_AUTHED";
        case 23:  return "IE_INVALID";
        case 24:  return "MIC_FAILURE";
        case 15:  return "4WAY_HANDSHAKE_TIMEOUT";
        case 16:  return "GROUP_KEY_UPDATE_TIMEOUT";
        case 17:  return "IE_IN_4WAY_DIFFERS";
        case 18:  return "GROUP_CIPHER_INVALID";
        case 19:  return "PAIRWISE_CIPHER_INVALID";
        case 20:  return "AKMP_INVALID";
        case 21:  return "UNSUPP_RSN_IE_VERSION";
        case 22:  return "INVALID_RSN_IE_CAP";
        case 39:  return "TIMEOUT";
        case 200: return "BEACON_TIMEOUT";
        case 201: return "NO_AP_FOUND";
        case 202: return "AUTH_FAIL";
        case 203: return "ASSOC_FAIL";
        case 204: return "HANDSHAKE_TIMEOUT";
        case 205: return "CONNECTION_FAIL";
        default:  return "UNKNOWN";
    }
}

void gridguardWiFiEventCallback(arduino_event_id_t event, arduino_event_info_t info) {
    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_START:
            Serial.println("[WiFi-EVT] STA_START");
            break;

        case ARDUINO_EVENT_WIFI_STA_CONNECTED:
            Serial.printf("[WiFi-EVT] STA_CONNECTED  channel=%d authmode=%d\n",
                          info.wifi_sta_connected.channel,
                          info.wifi_sta_connected.authmode);
            break;

        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            Serial.print  ("[WiFi-EVT] STA_GOT_IP    IP:      ");
            Serial.println(WiFi.localIP());
            Serial.print  ("[WiFi-EVT] STA_GOT_IP    Gateway: ");
            Serial.println(WiFi.gatewayIP());
            Serial.print  ("[WiFi-EVT] STA_GOT_IP    Subnet:  ");
            Serial.println(WiFi.subnetMask());
            Serial.printf ("[WiFi-EVT] STA_GOT_IP    RSSI:    %d dBm\n", WiFi.RSSI());
            break;

        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
            uint8_t reason = info.wifi_sta_disconnected.reason;
            Serial.printf("[WiFi-EVT] STA_DISCONNECTED  reason=%d (%s)\n",
                          (int)reason, wifiDisconnectReasonStr(reason));
            break;
        }

        default:
            break;
    }
}

// ==============================================================================
// SECTION 23: WI-FI MANAGEMENT (NON-BLOCKING)
// ==============================================================================
void updateWiFi() {
    static bool wasConnected = false;
    static bool isConnecting = false;
    static uint32_t attemptStart = 0;

    if (WiFi.status() == WL_CONNECTED) {
        if (!wasConnected) {
            wasConnected = true;
            isConnecting = false;
            wifiBackoffMs = 2000;
            Serial.println("[WiFi] Connected");
            Serial.print("[WiFi] IP: ");
            Serial.println(WiFi.localIP());
            Serial.printf("[WiFi] RSSI: %d\n", WiFi.RSSI());
        }
        return;
    }

    if (wasConnected) {
        wasConnected = false;
        wifiBackoffMs = 2000;
        lastWiFiAttempt = millis();
    }

    uint32_t now = millis();

    if (isConnecting) {
        // Periodic status poll while attempt is in progress (every 2 s)
        static uint32_t lastStatusLog = 0;
        if (now - lastStatusLog >= 2000) {
            lastStatusLog = now;
            Serial.printf("[WiFi] status=%d  elapsed=%lums\n",
                          (int)WiFi.status(),
                          (unsigned long)(now - attemptStart));
        }
        if (now - attemptStart >= 15000) {
            isConnecting = false;
            lastWiFiAttempt = now;
            lastStatusLog = 0;
            Serial.println("[WiFi] Connect failed (timeout).");
        }
        return;
    }

    if (now - lastWiFiAttempt >= wifiBackoffMs || lastWiFiAttempt == 0) {
        lastWiFiAttempt = now;
        attemptStart = now;
        isConnecting = true;
        Serial.printf("[WiFi] Connecting to '%s' (backoff=%lums)...\n", WIFI_SSID, (unsigned long)wifiBackoffMs);
        WiFi.disconnect();
        WiFi.mode(WIFI_STA);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        wifiBackoffMs = min(wifiBackoffMs * 2, (uint32_t)30000);
    }
}

// ==============================================================================
// SECTION 24: MQTT MANAGEMENT  (state machine, backoff, Last Will)
// ==============================================================================
void updateMQTT() {
    if (!WiFi.isConnected()) {
        if (mqttState != GRIDGUARD_MQTT_DISCONNECTED) {
            mqttState = GRIDGUARD_MQTT_DISCONNECTED;
            pushEvent(EV_MQTT_DISCONNECT, 0xFF, "WIFI_LOST");
        }
        return;
    }

    if (mqttClient.connected()) {
        mqttClient.loop();
        mqttState    = GRIDGUARD_MQTT_CONNECTED;
        mqttBackoffMs = 2000;
        return;
    }

    // Was connected, now dropped
    if (mqttState == GRIDGUARD_MQTT_CONNECTED) {
        mqttState = GRIDGUARD_MQTT_DISCONNECTED;
        sysCounters.mqttReconnectCount++;
        pushEvent(EV_MQTT_DISCONNECT, 0xFF, "BROKER_DROPPED");
    }

    uint32_t now = millis();
    if (now - lastMQTTAttempt < mqttBackoffMs) {
        mqttState = GRIDGUARD_MQTT_BACKOFF;
        return;
    }

    lastMQTTAttempt = now;
    mqttState = GRIDGUARD_MQTT_CONNECTING;
    Serial.printf("[MQTT] Connecting to %s:%d (backoff=%lums)...\n",
                  MQTT_BROKER, MQTT_PORT, (unsigned long)mqttBackoffMs);

    // Set Last Will: published by broker on unexpected disconnect
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);

    bool connected = mqttClient.connect(
        MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD,
        MQTT_LAST_WILL_TOPIC, 1, false, MQTT_LAST_WILL_PAYLOAD
    );

    if (connected) {
        mqttState = GRIDGUARD_MQTT_CONNECTED;
        mqttBackoffMs = 2000;
        sysCounters.mqttReconnectCount++;
        Serial.println("[MQTT] Connected (TLS 8883).");

        mqttClient.subscribe(TOPIC_COMMANDS, 1);
        Serial.printf("[MQTT] Subscribed: %s\n", TOPIC_COMMANDS);

        pushEvent(EV_MQTT_RECONNECT, 0xFF, nullptr);
        publishBootStatus();
        publishHeartbeat();
        publishSystemTelemetry();
        for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
            publishChannelTelemetry(ch);
        }
    } else {
        mqttState = GRIDGUARD_MQTT_ERROR;
        Serial.printf("[MQTT] Connect failed (rc=%d). Backoff %lums\n",
                      mqttClient.state(), (unsigned long)mqttBackoffMs);
        mqttBackoffMs = min(mqttBackoffMs * 2, (uint32_t)30000);
    }
}

// ==============================================================================
// SECTION 25: NTP
// ==============================================================================
// getIsoTimestamp() defined in Section 22 (used throughout)

// ==============================================================================
// SECTION 26: WATCHDOG
// ==============================================================================
void initWatchdog() {
    esp_task_wdt_init(10, true);  // 10 s timeout, panic on expiry
}

// ==============================================================================
// SECTION 27: BOOT DIAGNOSTICS
// ==============================================================================
void initBootDiagnostics() {
    esp_reset_reason_t reason = esp_reset_reason();
    bootDiag.resetReason = reason;

    // Load persistent boot counters from NVS
    bootDiag.bootCount         = preferences.getUInt("boot_count",    0) + 1;
    bootDiag.watchdogCount     = preferences.getUInt("wdt_count",     0);
    bootDiag.brownoutCount     = preferences.getUInt("brnout_count",  0);
    bootDiag.softwareResetCount= preferences.getUInt("sw_rst_count",  0);

    // Classify reset reason and increment appropriate counter
    switch (reason) {
        case ESP_RST_WDT:
        case ESP_RST_TASK_WDT:
        case ESP_RST_INT_WDT:
            bootDiag.watchdogCount++;
            preferences.putUInt("wdt_count", bootDiag.watchdogCount);
            pushEvent(EV_WATCHDOG, 0xFF, "WDT_RESET");
            Serial.printf("[BOOT DIAG] WATCHDOG RESET detected (total: %u)\n", bootDiag.watchdogCount);
            break;
        case ESP_RST_BROWNOUT:
            bootDiag.brownoutCount++;
            preferences.putUInt("brnout_count", bootDiag.brownoutCount);
            pushEvent(EV_BROWNOUT, 0xFF, "BROWNOUT");
            Serial.printf("[BOOT DIAG] BROWNOUT RESET detected (total: %u)\n", bootDiag.brownoutCount);
            break;
        case ESP_RST_SW:
            bootDiag.softwareResetCount++;
            preferences.putUInt("sw_rst_count", bootDiag.softwareResetCount);
            break;
        default:
            break;
    }

    preferences.putUInt("boot_count", bootDiag.bootCount);
    bootDiag.systemBootState = BOOT_BOOTING;

    Serial.printf("[BOOT DIAG] Boot #%u | Reason: %d | WDT: %u | Brownout: %u\n",
                  bootDiag.bootCount, (int)reason,
                  bootDiag.watchdogCount, bootDiag.brownoutCount);
}

// ==============================================================================
// SECTION 28: FREERTOS TASKS  (dual-core architecture)
// ==============================================================================
/**
 * TaskProtectionLoop — Core 1, Priority 5
 *
 * Local protection is INDEPENDENT of networking.
 * Network failures NEVER stop this task.
 * This task owns: DSP measurement, protection decision, relay control.
 */
void TaskProtectionLoop(void* param) {
    Serial.println("[TASK] ProtectionLoop on Core 1 (Priority 5) — ACTIVE");
    esp_task_wdt_add(NULL);
    const TickType_t loopTick = pdMS_TO_TICKS(200);

    // Boot-time sensor validation phase
    bootDiag.systemBootState = BOOT_SENSOR_VALIDATE;
    bool allChannelsReady = false;
    uint8_t validationPasses[NUM_CHANNELS] = {0};

    while (!allChannelsReady) {
        esp_task_wdt_reset();
        allChannelsReady = true;

        for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
            ChannelState st;
            getChannelSnapshot(ch, st);
            if (st.currentState == CH_SAFE_MODE || st.faultLatched) continue;

            if (validationPasses[ch] < 3) {
                if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
                channels[ch].currentState = CH_SENSOR_VALIDATING;
                if (channelMutex) xSemaphoreGive(channelMutex);

                if (measureChannel(ch)) {
                    validationPasses[ch]++;
                } else {
                    validationPasses[ch] = 0;
                }
                allChannelsReady = false;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    bootDiag.systemBootState = BOOT_PROTECTION_ACTIVE;
    pushEvent(EV_BOOT, 0xFF, "PROTECTION_ACTIVE");
    Serial.println("[TASK] All channels validated. Protection ACTIVE.");

    for (;;) {
        esp_task_wdt_reset();

        for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
            ChannelState st;
            if (!getChannelSnapshot(ch, st)) continue;

            if (st.currentState == CH_SAFE_MODE) {
                // SAFE_MODE: enforce relays OFF, no recovery
                setChannelRelays(ch, false, false);
                continue;
            }

            if (st.faultLatched) {
                setChannelRelays(ch, false, false);
                continue;
            }

            measureChannel(ch);
            evaluateChannelProtection(ch);
        }

        vTaskDelay(loopTick);
    }
}

/**
 * TaskTelemetryMQTT — Core 0, Priority 1
 *
 * Handles all networking: Wi-Fi, TLS MQTT, telemetry dispatch, NTP.
 * Failure here does NOT affect Core 1 protection.
 */
void TaskTelemetryMQTT(void* param) {
    Serial.println("[TASK] TelemetryMQTT on Core 0 (Priority 1) — ACTIVE");
    esp_task_wdt_add(NULL);
    uint32_t lastTelemetry  = 0;
    uint32_t lastHeartbeat  = 0;

    for (;;) {
        esp_task_wdt_reset();

        updateWiFi();
        updateMQTT();

        uint32_t now = millis();

        if (now - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
            lastTelemetry = now;
            publishSystemTelemetry();
            for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
                publishChannelTelemetry(ch);
            }
        }

        if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
            lastHeartbeat = now;
            publishHeartbeat();
        }

        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

// ==============================================================================
// SECTION 29: SETUP  —  deterministic boot sequence
// ==============================================================================
#ifdef GRIDGUARD_TESTS
#include "tests/test_gridguard.h"
#endif

void setup() {
    Serial.begin(115200);
    delay(300);

    Serial.println();
    Serial.println("================================================================");
    Serial.println(" GRIDGUARD — SMART TRANSFORMER PROTECTION & ASSISTIVE LOAD");
    Serial.printf (" Firmware: %s | Build: %s\n", FW_VERSION_STR, FW_BUILD_DATE);
    Serial.printf (" Target: %s\n", CONTROLLER_TARGET);
    Serial.println("================================================================");

    // ── Step 0: Validate GPIO map (compile-time + runtime) ───────────────────
    String gpioErr;
    if (!verifyHardwarePins(gpioErr)) {
        Serial.printf("[FATAL] GPIO CONFLICT: %s\n", gpioErr.c_str());
        for (;;) delay(1000);
    }
    Serial.println("[BOOT] 0. GPIO audit PASSED.");

    // ── Step 1: Create FreeRTOS synchronisation primitives ───────────────────
    channelMutex = xSemaphoreCreateMutex();
    relayMutex   = xSemaphoreCreateMutex();
    eventMutex   = xSemaphoreCreateMutex();
    Serial.println("[BOOT] 1. FreeRTOS mutexes created.");

    // ── Step 2: Initialise channel state to safe defaults ────────────────────
    for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
        channels[ch].voltage         = NAN;
        channels[ch].current         = NAN;
        channels[ch].activePower     = NAN;
        channels[ch].apparentPowerVA = NAN;
        channels[ch].powerFactor     = NAN;
        channels[ch].voltageValid    = false;
        channels[ch].currentValid    = false;
        channels[ch].measurementValid= false;
        channels[ch].dspSanityOk     = false;
        channels[ch].sensorHealth    = SENSOR_INVALID;
        channels[ch].loadPresent     = false;
        channels[ch].faultLatched    = false;
        channels[ch].fault[0]        = '\0';
        channels[ch].faultCount      = 0;
        channels[ch].tripCount       = 0;
        channels[ch].resetCount      = 0;
        channels[ch].highLoadCount   = 0;
        channels[ch].sensorInvalidCount = 0;
        channels[ch].currentState    = CH_BOOT;
    }
    memset(&sysCounters, 0, sizeof(sysCounters));
    Serial.println("[BOOT] 2. Channel state initialised.");

    // ── Step 3: MANDATORY BOOT SAFETY — ALL RELAYS OFF ───────────────────────
    // At this point mutexes exist but relay driver not yet initialised.
    // Direct GPIO writes here are the ONE permitted exception (boot safety).
    for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
        const ChannelHardware& hw = GRIDGUARD_CHANNELS[ch];
        pinMode(hw.mainRelayPin, OUTPUT);
        pinMode(hw.auxRelayPin,  OUTPUT);
        digitalWrite(hw.mainRelayPin, RELAY_STATE_OFF);
        digitalWrite(hw.auxRelayPin,  RELAY_STATE_OFF);
    }
    Serial.println("[BOOT] 3. BOOT SAFETY: ALL RELAY OUTPUTS = OFF.");

    // ── Step 4: Relay driver initialisation (pins + feedback) ────────────────
    relayDriverInit();
    Serial.println("[BOOT] 4. Relay driver initialised.");

    // ── Step 5: Verify all relays are physically OFF (if feedback installed) ──
    bool relayBootOk = true;
    if (RELAY_FEEDBACK_INSTALLED) {
        for (uint8_t ch = 0; ch < NUM_CHANNELS; ch++) {
            RelayVerificationState vm = verifyRelay(ch, true,  false, RELAY_FEEDBACK_SETTLE_MS);
            RelayVerificationState va = verifyRelay(ch, false, false, RELAY_FEEDBACK_SETTLE_MS);
            if (vm == RELAY_STUCK_ON || va == RELAY_STUCK_ON) {
                Serial.printf("[BOOT] RELAY STUCK-ON AT BOOT: CH%d %s — SAFE MODE\n",
                              ch + 1, vm == RELAY_STUCK_ON ? "MAIN" : "AUX");
                if (channelMutex) xSemaphoreTake(channelMutex, portMAX_DELAY);
                channels[ch].currentState = CH_SAFE_MODE;
                if (channelMutex) xSemaphoreGive(channelMutex);
                pushEvent(EV_SAFE_MODE, ch, "STUCK_ON_AT_BOOT");
                relayBootOk = false;
            }
        }
    }
    bootDiag.systemBootState = BOOT_SAFE_OUTPUTS;
    Serial.printf("[BOOT] 5. Boot relay verification %s.\n", relayBootOk ? "PASSED" : "FAILED (SAFE MODE)");

    // ── Step 6: ADC configuration ─────────────────────────────────────────────
    analogReadResolution(ADC_RESOLUTION_BITS);
    analogSetAttenuation(ADC_11db);
    Serial.println("[BOOT] 6. ADC: 12-bit, 11 dB attenuation.");

    // ── Step 7: NVS — open, read boot diagnostics, restore fault latches ──────
    preferences.begin("gridguard", false);
    initBootDiagnostics();
    loadPersistentFaultsFromNVS();
    Serial.println("[BOOT] 7. NVS v2: boot diagnostics + fault latches loaded.");

    // ── Step 8: PZEM-004T UART ────────────────────────────────────────────────
    PZEMSerial.begin(9600, SERIAL_8N1, PIN_PZEM_RX, PIN_PZEM_TX);
    Serial.printf("[BOOT] 8. PZEM-004T Serial2 (RX:%d TX:%d).\n", PIN_PZEM_RX, PIN_PZEM_TX);

    // ── Step 9: TLS MQTT client ───────────────────────────────────────────────
    espClient.setCACert(HIVEMQ_ROOT_CA);
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(2048);
    Serial.printf("[BOOT] 9. TLS MQTT client: %s:%d.\n", MQTT_BROKER, MQTT_PORT);

    // ── Step 10: NTP ──────────────────────────────────────────────────────────
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    Serial.println("[BOOT] 10. NTP configured.");

    // ── Step 10b: Wi-Fi diagnostic event callback (read-only, no behaviour change)
    WiFi.onEvent(gridguardWiFiEventCallback);
    Serial.println("[BOOT] 10b. Wi-Fi diagnostic event callback registered.");

    // ── Step 11: Task Watchdog ────────────────────────────────────────────────
    initWatchdog();
    Serial.println("[BOOT] 11. Task Watchdog: 10 s timeout.");

    // ── Step 12: Launch FreeRTOS tasks ────────────────────────────────────────
    xTaskCreatePinnedToCore(TaskProtectionLoop, "ProtectionLoop", 10240, nullptr, 5, nullptr, 1);
    xTaskCreatePinnedToCore(TaskTelemetryMQTT,  "TelemetryMQTT",  8192,  nullptr, 1, nullptr, 0);

    Serial.println("[BOOT] 12. FreeRTOS tasks dispatched.");
    Serial.println("[BOOT] ══ Boot sequence complete. Local protection ACTIVE. ══");

#ifdef GRIDGUARD_TESTS
    // Run DSP, NVS, relay state-machine, and invariant tests immediately
    // at the end of setup() before the FreeRTOS scheduler has assigned work.
    // Protection-state tests require at least one protection-loop cycle and
    // are deferred to loop() via runProtectionStateTests().
    runAllTests();
#endif
}

// ==============================================================================
// SECTION 30: LOOP  —  idle (all work in FreeRTOS tasks)
// ==============================================================================
#ifdef GRIDGUARD_TESTS
// One-shot flag: run protection-state tests once after the protection task
// has had time to complete ≥1 full evaluation cycle (≥ 2 s after boot).
static bool _protectionTestsDone = false;
#endif

void loop() {
#ifdef GRIDGUARD_TESTS
    if (!_protectionTestsDone) {
        // Wait for the protection FreeRTOS task (200 ms loop × ≥3 cycles
        // + boot sensor validation) to have evaluated all channels at least once.
        // 2 000 ms is conservative and safe.
        vTaskDelay(pdMS_TO_TICKS(2000));
        runProtectionStateTests();
        _protectionTestsDone = true;
    }
#endif
    vTaskDelay(pdMS_TO_TICKS(1000));
}