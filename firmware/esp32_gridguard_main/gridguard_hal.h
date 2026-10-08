#ifndef GRIDGUARD_HAL_H
#define GRIDGUARD_HAL_H

/**
 * ==============================================================================
 * GRIDGUARD — HARDWARE ABSTRACTION LAYER (HAL)
 * ESP32-S3 N16R8
 * ==============================================================================
 *
 * This file defines:
 *   1. Per-channel hardware pin structures
 *   2. Sensor calibration data
 *   3. Relay feedback pin structures
 *   4. GPIO conflict/safety audit routine
 *
 * All relay access must go through the relay driver in the main firmware.
 * Never access relay GPIOs directly.
 */

#include <Arduino.h>
#include "hardware_config.h"

// ==============================================================================
// SENSOR CALIBRATION PER CHANNEL
// ==============================================================================
struct SensorCalibration {
    float zmptCal;          // ZMPT101B gain (V_ac / ADC_centered_V)
    float acsZeroCount;     // ACS712 zero-current ADC count
    float acsSensitivity;   // ACS712 A/V sensitivity
};

// ==============================================================================
// PER-CHANNEL HARDWARE DESCRIPTOR
// ==============================================================================
struct ChannelHardware {
    uint8_t          zmptPin;           // ZMPT101B ADC input GPIO
    uint8_t          acsPin;            // ACS712 ADC input GPIO
    uint8_t          mainRelayPin;      // Main relay command GPIO (output)
    uint8_t          auxRelayPin;       // Aux relay command GPIO (output)
    uint8_t          mainFeedbackPin;   // Main relay feedback GPIO (input, 0 = NOT_INSTALLED)
    uint8_t          auxFeedbackPin;    // Aux relay feedback GPIO (input, 0 = NOT_INSTALLED)
    bool             feedbackInstalled; // True only when isolated feedback HW is fitted
    SensorCalibration cal;
};

// ==============================================================================
// CHANNEL HARDWARE MAP  (locked GPIO assignments)
// ==============================================================================
const ChannelHardware GRIDGUARD_CHANNELS[NUM_CHANNELS] = {
    // CH1
    {
        PIN_ADC_ZMPT_CH1, PIN_ADC_ACS_CH1,
        PIN_RELAY_MAIN_CH1, PIN_RELAY_AUX_CH1,
#if RELAY_FEEDBACK_INSTALLED
        PIN_FEEDBACK_MAIN_CH1, PIN_FEEDBACK_AUX_CH1, true,
#else
        0, 0, false,
#endif
        { CAL_ZMPT_CH1, CAL_ACS_ZERO_CH1, ACS_CURRENT_SENSITIVITY }
    },
    // CH2
    {
        PIN_ADC_ZMPT_CH2, PIN_ADC_ACS_CH2,
        PIN_RELAY_MAIN_CH2, PIN_RELAY_AUX_CH2,
#if RELAY_FEEDBACK_INSTALLED
        PIN_FEEDBACK_MAIN_CH2, PIN_FEEDBACK_AUX_CH2, true,
#else
        0, 0, false,
#endif
        { CAL_ZMPT_CH2, CAL_ACS_ZERO_CH2, ACS_CURRENT_SENSITIVITY }
    },
    // CH3
    {
        PIN_ADC_ZMPT_CH3, PIN_ADC_ACS_CH3,
        PIN_RELAY_MAIN_CH3, PIN_RELAY_AUX_CH3,
#if RELAY_FEEDBACK_INSTALLED
        PIN_FEEDBACK_MAIN_CH3, PIN_FEEDBACK_AUX_CH3, true,
#else
        0, 0, false,
#endif
        { CAL_ZMPT_CH3, CAL_ACS_ZERO_CH3, ACS_CURRENT_SENSITIVITY }
    },
    // CH4
    {
        PIN_ADC_ZMPT_CH4, PIN_ADC_ACS_CH4,
        PIN_RELAY_MAIN_CH4, PIN_RELAY_AUX_CH4,
#if RELAY_FEEDBACK_INSTALLED
        PIN_FEEDBACK_MAIN_CH4, PIN_FEEDBACK_AUX_CH4, true,
#else
        0, 0, false,
#endif
        { CAL_ZMPT_CH4, CAL_ACS_ZERO_CH4, ACS_CURRENT_SENSITIVITY }
    }
};

// ==============================================================================
// GPIO CONFLICT & SAFETY AUDIT
// ==============================================================================
// Verifies at runtime that no two peripherals share a GPIO and that
// GPIO 19/20 (USB D-/D+) are never assigned to any peripheral.
inline bool verifyHardwarePins(String& errorMsg) {
    const int MAX_PINS = 64;
    int  declaredPins[MAX_PINS];
    char pinOwners[MAX_PINS][24];
    int  count = 0;

    auto checkAndRegister = [&](int pin, const char* owner) -> bool {
        if (pin == 0) return true; // 0 = not used / not installed
        if (pin == 19 || pin == 20) {
            errorMsg = String("FATAL: GPIO ") + pin + " (" + owner + ") = ESP32-S3 USB D-/D+!";
            return false;
        }
        for (int i = 0; i < count; i++) {
            if (declaredPins[i] == pin) {
                errorMsg = String("GPIO conflict: ") + pin + " shared by " +
                           pinOwners[i] + " and " + owner;
                return false;
            }
        }
        if (count < MAX_PINS) {
            declaredPins[count] = pin;
            strncpy(pinOwners[count], owner, sizeof(pinOwners[count]) - 1);
            pinOwners[count][sizeof(pinOwners[count]) - 1] = '\0';
            count++;
        }
        return true;
    };

    if (!checkAndRegister(PIN_PZEM_RX, "PZEM_RX")) return false;
    if (!checkAndRegister(PIN_PZEM_TX, "PZEM_TX")) return false;

    for (int i = 0; i < NUM_CHANNELS; i++) {
        char buf[24];
        snprintf(buf, sizeof(buf), "CH%d_ZMPT",      i + 1);
        if (!checkAndRegister(GRIDGUARD_CHANNELS[i].zmptPin,      buf)) return false;
        snprintf(buf, sizeof(buf), "CH%d_ACS",       i + 1);
        if (!checkAndRegister(GRIDGUARD_CHANNELS[i].acsPin,       buf)) return false;
        snprintf(buf, sizeof(buf), "CH%d_MAIN_REL",  i + 1);
        if (!checkAndRegister(GRIDGUARD_CHANNELS[i].mainRelayPin, buf)) return false;
        snprintf(buf, sizeof(buf), "CH%d_AUX_REL",   i + 1);
        if (!checkAndRegister(GRIDGUARD_CHANNELS[i].auxRelayPin,  buf)) return false;
        if (GRIDGUARD_CHANNELS[i].feedbackInstalled) {
            snprintf(buf, sizeof(buf), "CH%d_FB_MAIN",  i + 1);
            if (!checkAndRegister(GRIDGUARD_CHANNELS[i].mainFeedbackPin, buf)) return false;
            snprintf(buf, sizeof(buf), "CH%d_FB_AUX",   i + 1);
            if (!checkAndRegister(GRIDGUARD_CHANNELS[i].auxFeedbackPin,  buf)) return false;
        }
    }
    return true;
}

#endif // GRIDGUARD_HAL_H
