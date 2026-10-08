# GRIDGUARD — RELAY FEEDBACK WIRING GUIDE

## Purpose

This document defines the **safe, isolated feedback interface** for reading the
physical state of each relay.

> **CRITICAL SAFETY REQUIREMENT:**
> ESP32-S3 GPIOs operate at 3.3 V logic.
> Mains voltage (230 V AC) must NEVER be connected directly to any GPIO.
> All relay feedback must use an **isolated, low-voltage sensing path**.

---

## Relay Feedback Architecture

### Concept

Each relay has a **commanded state** (what the firmware told the GPIO) and a
**physical state** (what the relay actually did). These must be measured
separately.

```
Relay coil             Auxiliary contact (dry)
    │                         │
    ▼                         ▼
GPIO OUTPUT              Isolated feedback path
(command)                      │
                               ▼
                    Current-limiting resistor (1 kΩ)
                               │
                               ▼
                    Opto-coupler (e.g., PC817, 4N35)
                    Input LED (LED+ → 3.3 V through R,
                               LED- → contact → GND)
                               │
                               ▼
                    Opto-coupler output (open collector)
                    Pull-up to 3.3 V via 10 kΩ
                               │
                               ▼
                    ESP32 GPIO (INPUT_PULLUP)
```

When the relay contact is **closed** (relay ON):
- Current flows through the opto-coupler LED
- Opto-coupler output transistor saturates → GPIO reads LOW
- `FEEDBACK_ACTIVE_LEVEL = LOW` → relay detected ON ✓

When the relay contact is **open** (relay OFF):
- No current through LED
- Output transistor off → GPIO reads HIGH (pull-up)
- Relay detected OFF ✓

---

## Required Hardware

| Component             | Specification                              | Qty |
|-----------------------|--------------------------------------------|-----|
| Opto-coupler IC       | PC817 or 4N35 (CTR ≥ 100%)                | 8   |
| Current limit resistor | 1 kΩ, 1/4 W (for 3.3 V LED side)        | 8   |
| Pull-up resistor       | 10 kΩ, 1/4 W (to 3.3 V on output side)  | 8   |
| Relay with aux contact | SPDT relay with NO/NC auxiliary contact  | 8   |

> **Note:** Standard Chinese 5V SRD-05VDC relay modules do NOT include
> auxiliary contacts. You must use relay modules or DIN-rail relays that
> provide a separate auxiliary contact (also called a "mirror contact" or
> "dry contact output") isolated from the coil voltage.

---

## Feedback Channel Map

| Feedback Channel   | Relay       | GPIO (Input) | Logic Level ON | Status             |
|--------------------|-------------|--------------|----------------|--------------------|
| CH1 Main feedback  | Main Relay 1 | GPIO 2       | LOW            | NOT_INSTALLED (placeholder) |
| CH1 Aux feedback   | Aux Relay 1  | GPIO 3       | LOW            | NOT_INSTALLED (placeholder) |
| CH2 Main feedback  | Main Relay 2 | GPIO 22      | LOW            | NOT_INSTALLED (placeholder) |
| CH2 Aux feedback   | Aux Relay 2  | GPIO 23      | LOW            | NOT_INSTALLED (placeholder) |
| CH3 Main feedback  | Main Relay 3 | GPIO 24      | LOW            | NOT_INSTALLED (placeholder) |
| CH3 Aux feedback   | Aux Relay 3  | GPIO 25      | LOW            | NOT_INSTALLED (placeholder) |
| CH4 Main feedback  | Main Relay 4 | GPIO 26      | LOW            | NOT_INSTALLED (placeholder) |
| CH4 Aux feedback   | Aux Relay 4  | GPIO 27      | LOW            | NOT_INSTALLED (placeholder) |

> **[REQUIRES BOARD VERIFICATION]:** GPIO assignments above are placeholder
> suggestions only. Verify against the actual PCB schematic before wiring.
> Check for strapping pins (GPIO 0, 3, 45, 46) and boot-mode sensitivity.

---

## Firmware Integration

When feedback hardware is physically installed and wired:

1. Set the build flag `-DRELAY_FEEDBACK_INSTALLED=1` in `platformio.ini`:

```ini
[env:esp32-s3-prod-fb]
build_flags =
    ${env.build_flags}
    -DGRIDGUARD_PROD=1
    -DRELAY_FEEDBACK_INSTALLED=1
```

2. Verify the GPIO assignments in `hardware_config.h` match your board:

```c
#define PIN_FEEDBACK_MAIN_CH1   2    // verify against your schematic
#define PIN_FEEDBACK_MAIN_CH2   22   // verify against your schematic
// ... etc.
```

3. Rebuild and flash. The firmware will:
   - Read debounced feedback after each relay command
   - Report `VERIFIED_ON` / `VERIFIED_OFF` / `RELAY_MISMATCH` / `STUCK_ON`
   - Enter `CH_RELAY_FAULT` or `CH_SAFE_MODE` if mismatch detected at boot

---

## Relay States Reported

| Commanded | Feedback | Reported Status     | Meaning                    |
|-----------|----------|---------------------|----------------------------|
| ON        | ON       | `VERIFIED_ON`       | Normal — relay closed      |
| OFF       | OFF      | `VERIFIED_OFF`      | Normal — relay open        |
| ON        | OFF      | `RELAY_MISMATCH`    | Relay failed to close      |
| OFF       | ON       | `STUCK_ON`          | Relay welded / stuck       |
| —         | —        | `NOT_AVAILABLE`     | Feedback not installed     |

---

## Commissioning Checklist (Feedback Hardware)

Before connecting mains:

1. ☐ Power ESP32 from safe 5 V supply (no mains)
2. ☐ Verify all relay outputs OFF (GPIO HIGH)
3. ☐ Verify all feedback GPIOs read HIGH (relay open)
4. ☐ Command CH1 Main relay ON — verify feedback LOW
5. ☐ Command CH1 Main relay OFF — verify feedback HIGH
6. ☐ Repeat for all 8 relays
7. ☐ Confirm `VERIFIED_ON` and `VERIFIED_OFF` on dashboard
8. ☐ Simulate mismatch: command OFF but manually hold contact — confirm `STUCK_ON`
9. ☐ Flash firmware with `-DRELAY_FEEDBACK_INSTALLED=1`
10. ☐ Only then proceed to low-voltage mains testing under engineering supervision

---

## Safety Notes

- **Never connect mains potential to the opto-coupler input.** The input side
  operates from the ESP32's 3.3 V rail through a current-limiting resistor.
- Use relay modules that provide **isolated auxiliary contacts** only.
  The relay's auxiliary contact must have its own isolated circuit from the
  load-switching contact.
- Maintain **creepage and clearance distances** appropriate for your mains
  voltage on the relay PCB.
- This design is for **prototype/laboratory use**. Mains-connected equipment
  must be reviewed by a qualified electrical engineer before deployment.
