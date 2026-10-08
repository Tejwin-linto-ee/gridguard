# GRIDGUARD Electrical Safety & High-Voltage Commissioning Protocol

> [!CAUTION]
> **HIGH VOLTAGE DANGER (230 V AC / 50 Hz)**
> Working with alternating current mains presents lethal shock and fire hazards. Physical hardware commissioning must only be performed by qualified personnel under supervised laboratory conditions.
>
> **DISCLAIMER:** This prototype has **NOT** received third-party electrical safety certifications (such as UL 61010, CE-LVD, or IEC 60947). Do **NOT** claim regulatory compliance until formal third-party laboratory testing is conducted.

---

## 1. Upstream Protection Requirements

Before connecting the physical GRIDGUARD prototype to mains supply, the supply circuit **MUST** be protected by:

1. **Residual Current Device (RCD / RCCB):**
   - Rated trip threshold: $\le 30\text{ mA}$ (Type AC or Type A).
   - Test button verified operational prior to bench energization.
2. **Miniature Circuit Breaker (MCB) / Fast-Acting Fuse:**
   - Rated current: **6 A** or **10 A** Type B or Type C.
   - Fault breaking capacity: Minimum $6\text{ kA}$.
3. **Emergency Disconnect Switch:**
   - Clearly labeled, accessible, external mushroom emergency-stop button cutting all live ($L$) and neutral ($N$) conductors simultaneously.

---

## 2. Galvanic Isolation & Creepage Boundaries

```
[230 V AC MAINS SECTION]                     [ISOLATION BARRIER]        [3.3 V / 5 V LOW-VOLTAGE SECTION]
  - Prototype Load Channels (Bulbs)                 │                     - ESP32-S3 N16R8 MCU
  - Main & Aux Relay Contacts                       │                     - USB-C Programming Port (GPIO 19/20)
  - ZMPT101B Primary Windings                       │                     - Status LEDs & I/O
  - ACS712 Primary Conductor (Pins 1-4)             │                     - PZEM-004T Optoisolated RX/TX
                                                    │
                                     Creepage: >= 6.3 mm (Reinforced)
                                     Clearance: >= 4.0 mm
                                     Dielectric: >= 2.0 kV AC RMS
```

1. **ZMPT101B Voltage Transformer:**
   - Provides internal high-potential magnetic isolation ($\ge 2000\text{ V AC}$).
   - Low-voltage secondary side is referenced to the ESP32-S3 signal ground ($GND$).
2. **ACS712 Current Sensor:**
   - Uses Hall-effect magnetic field sensing across internal copper trace (Pins 1-4).
   - Provides $2.1\text{ kV RMS}$ galvanic isolation between mains current path and Hall transducer pins (Pins 5-8).
3. **Relay Module Isolation:**
   - Relays must feature onboard optocouplers (e.g. PC817 or EL817) separating relay coil drive signals from ESP32 digital outputs.
   - Separate 5 V coil power supply ground from ESP32 3.3 V logic ground if relay module supports jumper isolation (`JD-VCC` vs `VCC`).
4. **Physical Creepage & Clearance:**
   - Minimum **6.3 mm** creepage distance along PCB surface between mains traces and low-voltage MCU traces.
   - Isolation slot cutouts milled into PCB underneath optocouplers and relay contact pads.

---

## 3. Wiring Standards & Enclosure

| Component / Conductor | Specification / Requirement |
| :--- | :--- |
| **Mains AC Wire Gauge** | Minimum $0.75\text{ mm}^2$ (18 AWG) stranded copper; rated for $300\text{ V} / 600\text{ V}$, $105^\circ\text{C}$. |
| **Color Coding** | Phase/Line ($L$): Brown or Red; Neutral ($N$): Blue or Black; Earth Ground ($PE$): Green/Yellow. |
| **Relay Ratings** | 5 V DC Coil, Contacts rated for minimum $10\text{ A}$ @ $250\text{ V AC}$ resistive. |
| **Enclosure** | Fire-retardant ABS or polycarbonate (UL94 V-0 flame rating); IP20 minimum finger-safe protection. |
| **Terminations** | Screw terminal blocks with wire ferrules (crimps). No bare untinned stranded wires. |
| **Earth Bonding** | All conductive accessible metal parts of prototype enclosure must be solidly bonded to Earth ($PE$). |

---

## 4. Hardware Commissioning Rules

1. **Cold Resistance / DMM Inspection:**
   - Measure resistance between mains $L$ and low-voltage $3.3\text{ V} / GND$ lines: must be $> 100\text{ M}\Omega$ (infinite).
   - Check all 8 relay output contacts for shorts with de-energized coils.
2. **Low-Voltage Power-On First:**
   - Power ESP32-S3 and relay coils via 5 V DC bench power supply with mains $230\text{ V AC}$ completely disconnected.
   - Verify heartbeat, Wi-Fi, and MQTT telemetry streams without mains voltage present.
3. **Relay Actuation Without Load:**
   - Cycle all 8 relays via operator-guided commissioning panel.
   - Verify audible clicking and LED switching on relay module.
4. **Mains Energization Under Supervised Load:**
   - Connect prototype bulbs (channels 1-4) one at a time.
   - Confirm active power readings align with bulb wattage ratings.
   - Never leave prototype energized unattended.
