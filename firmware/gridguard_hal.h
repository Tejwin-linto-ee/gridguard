#ifndef GRIDGUARD_HAL_H
#define GRIDGUARD_HAL_H

#include <Arduino.h>

/**
 * ==============================================================================
 * GRIDGUARD - HARDWARE ABSTRACTION LAYER (HAL) - Section 3
 * ==============================================================================
 * Centralized, structured configuration objects preventing raw GPIO scattering.
 * Includes automated startup GPIO conflict detection and verification.
 */

struct SensorConfig {
    int adcPin;
    float scale;
    float offset;
    float zeroRawAdc;
    float vRefMv;
    int resolutionBits;
};

struct RelayConfig {
    int mainRelayPin;
    int auxRelayPin;
    uint8_t activeLevel; // LOW or HIGH
    bool hasPhysicalFeedback; // false for standard 5V modules without aux dry contacts
};

struct ProtectionConfig {
    float warningCurrentA;
    float highLoadCurrentA;
    float criticalCurrentA;
    float warningVoltageV;
    float criticalVoltageV;
    float undervoltageV;
    uint32_t overloadDelayMs;
    uint32_t tripPersistenceMs;
    uint32_t debounceMs;
    float hysteresisPct;
};

struct ChannelConfig {
    int channelId;
    SensorConfig voltageSensor;
    SensorConfig currentSensor;
    RelayConfig relay;
    ProtectionConfig protection;
};

struct HardwareConfig {
    const char* systemName;
    const char* hardwareRev;
    const char* firmwareVersion;
    int pzemRxPin;
    int pzemTxPin;
    ChannelConfig channels[4];
};

/**
 * Startup GPIO Conflict Checker (Section 3)
 * Every declared pin must have exactly one unique owner.
 * If duplicate pin assignments exist, reports conflict and enters HARDWARE_CONFIG_ERROR.
 */
inline bool verifyGpioAssignments(const HardwareConfig& config, String& errorReason) {
    const int MAX_PINS = 32;
    int declaredPins[MAX_PINS];
    const char* pinOwners[MAX_PINS];
    int count = 0;

    auto registerPin = [&](int pin, const char* owner) -> bool {
        if (pin < 0) return true; // Unassigned / disabled pin
        // Safety: Reject ESP32-S3 dedicated Native USB pins (GPIO 19, 20)
        if (pin == 19 || pin == 20) {
            errorReason = String("FATAL HARDWARE CONFLICT: GPIO ") + String(pin) + 
                          " assigned to '" + owner + "' is reserved for ESP32-S3 Native USB (D-/D+)!";
            return false;
        }
        // Safety: Reject internal Flash, Octal PSRAM, and Strapping pins
        if ((pin >= 26 && pin <= 37) || pin == 0 || pin == 3 || pin == 45 || pin == 46 || pin == 47 || pin == 48) {
            errorReason = String("FATAL HARDWARE CONFLICT: GPIO ") + String(pin) + 
                          " assigned to '" + owner + "' is reserved for Flash/PSRAM/Strapping/VDD_SPI!";
            return false;
        }
        for (int i = 0; i < count; i++) {
            if (declaredPins[i] == pin) {
                errorReason = String("GPIO Conflict Detected: GPIO ") + String(pin) + 
                              " is assigned to both '" + pinOwners[i] + "' and '" + owner + "'!";
                return false;
            }
        }
        if (count < MAX_PINS) {
            declaredPins[count] = pin;
            pinOwners[count] = owner;
            count++;
        }
        return true;
    };

    // 1. Register PZEM UART pins
    if (!registerPin(config.pzemRxPin, "PZEM_UART_RX")) return false;
    if (!registerPin(config.pzemTxPin, "PZEM_UART_TX")) return false;

    // 2. Register per-channel pins
    for (int i = 0; i < 4; i++) {
        char nameBuf[32];
        snprintf(nameBuf, sizeof(nameBuf), "CH%d_ZMPT_ADC", i + 1);
        if (!registerPin(config.channels[i].voltageSensor.adcPin, strdup(nameBuf))) return false;

        snprintf(nameBuf, sizeof(nameBuf), "CH%d_ACS_ADC", i + 1);
        if (!registerPin(config.channels[i].currentSensor.adcPin, strdup(nameBuf))) return false;

        snprintf(nameBuf, sizeof(nameBuf), "CH%d_MAIN_RELAY", i + 1);
        if (!registerPin(config.channels[i].relay.mainRelayPin, strdup(nameBuf))) return false;

        snprintf(nameBuf, sizeof(nameBuf), "CH%d_AUX_RELAY", i + 1);
        if (!registerPin(config.channels[i].relay.auxRelayPin, strdup(nameBuf))) return false;
    }

    return true;
}

#endif // GRIDGUARD_HAL_H
