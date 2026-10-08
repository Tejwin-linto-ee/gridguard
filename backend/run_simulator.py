#!/usr/bin/env python
"""
Standalone Runner for GRIDGUARD ESP32 Hardware Simulator
Usage:
    python backend/run_simulator.py [--scenario NORMAL|HIGH_LOAD|OVERLOAD|MIXED]
"""
import sys
import time
import argparse
from backend.app.simulator.hardware_simulator import hardware_simulator

def main():
    parser = argparse.ArgumentParser(description="GRIDGUARD ESP32 Hardware Simulator")
    parser.add_argument(
        "--scenario",
        type=str,
        default="NORMAL",
        choices=["NORMAL", "HIGH_LOAD", "OVERLOAD", "MIXED"],
        help="Deterministic test scenario to run"
    )
    args = parser.parse_args()

    print("================================================================")
    print("GRIDGUARD ESP32 HARDWARE SIMULATOR")
    print(f"Device ID:     {hardware_simulator.device_id}")
    print(f"Hardware Type: {hardware_simulator.hardware_type}")
    print(f"Device Mode:   {hardware_simulator.device_mode}")
    print(f"Initial State: Scenario {args.scenario}")
    print("================================================================")

    hardware_simulator.apply_scenario(args.scenario)
    hardware_simulator.start()

    print("Simulator running. Press Ctrl+C to exit.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping simulator...")
        hardware_simulator.stop()
        print("Simulator stopped.")

if __name__ == "__main__":
    main()
