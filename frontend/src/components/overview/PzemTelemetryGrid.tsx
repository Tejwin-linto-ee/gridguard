"use client";

import React from "react";
import { SystemTelemetry } from "@/types/telemetry";
import { Zap, Activity, Gauge, BatteryCharging, Waves, CheckCircle2 } from "lucide-react";
import { useSystemHealth } from "@/context/SystemHealthContext";

interface PzemTelemetryGridProps {
  system: SystemTelemetry;
  hasLiveData: boolean;
  packetAgeSec?: number | null;
}

export function PzemTelemetryGrid({
  system,
  hasLiveData,
  packetAgeSec,
}: PzemTelemetryGridProps) {
  const health = useSystemHealth();
  const ageString =
    hasLiveData && packetAgeSec != null
      ? packetAgeSec < 2
        ? "Updated <2s ago"
        : `Updated ${packetAgeSec.toFixed(1)}s ago`
      : "NO LIVE DATA";

  const metrics = [
    {
      id: "voltage",
      label: "SYSTEM VOLTAGE",
      value: hasLiveData && system.voltage != null ? system.voltage.toFixed(1) : "---",
      unit: "V",
      nominal: "220 – 240 V",
      icon: Zap,
    },
    {
      id: "current",
      label: "SYSTEM CURRENT",
      value: hasLiveData && system.current != null ? system.current.toFixed(2) : "---",
      unit: "A",
      nominal: "< 5.50 A",
      icon: Activity,
    },
    {
      id: "power",
      label: "ACTIVE POWER",
      value: hasLiveData && system.power != null ? system.power.toFixed(1) : "---",
      unit: "W",
      nominal: "< 1200 W",
      icon: Gauge,
    },
    {
      id: "energy",
      label: "ENERGY",
      value: hasLiveData && system.energy != null ? system.energy.toFixed(3) : "---",
      unit: "kWh",
      nominal: "Cumulative",
      icon: BatteryCharging,
    },
    {
      id: "frequency",
      label: "FREQUENCY",
      value: hasLiveData && system.frequency != null ? system.frequency.toFixed(2) : "---",
      unit: "Hz",
      nominal: "49.5 – 50.5 Hz",
      icon: Waves,
    },
    {
      id: "power_factor",
      label: "POWER FACTOR",
      value: hasLiveData && system.power_factor != null ? system.power_factor.toFixed(2) : "---",
      unit: "PF",
      nominal: "> 0.85",
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
        <div>
          <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider flex items-center gap-2 flex-wrap">
            <span>
              {health.physicalEsp32.isOnline
                ? "OVERALL SYSTEM MEASUREMENTS (PHYSICAL PZEM-004T)"
                : health.deviceMode === "SIMULATOR" || health.telemetrySource === "SIMULATOR_MQTT"
                ? "OVERALL SYSTEM MEASUREMENTS (SIMULATED PZEM-004T MODEL)"
                : "OVERALL SYSTEM MEASUREMENTS (PZEM-004T)"}
            </span>
            {(health.deviceMode === "SIMULATOR" || health.telemetrySource === "SIMULATOR_MQTT") && (
              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                SIMULATED SYSTEM TELEMETRY
              </span>
            )}
          </h3>
          <p className="text-[11px] text-[#64748B]">
            Overall system meter • Individual channel protection uses channel-level active power (W)
          </p>
        </div>
        <span className="text-[10px] text-[#64748B] flex items-center gap-1.5 font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              health.dataProvenance === "LIVE_ESP32_MQTT" || health.dataProvenance === "SIMULATOR_MQTT"
                ? "bg-[#16A34A]"
                : health.dataProvenance === "STALE_DEVICE_DATA"
                ? "bg-[#D97706] animate-pulse"
                : "bg-slate-400"
            }`}
          />
          <span>{health.dataProvenanceDisplay}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.id}
              className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-2 hover:border-[#CBD5E1] transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#64748B] font-mono tracking-wider">
                  {m.label}
                </span>
                <Icon className="w-3.5 h-3.5 text-[#94A3B8]" />
              </div>

              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-bold text-[#172033] tabular-nums tracking-tight">
                  {m.value}
                </span>
                <span className="text-xs font-semibold text-[#2563EB]">{m.unit}</span>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[10px] text-[#64748B] font-mono">
                <span>{m.nominal}</span>
                <span
                  className={
                    hasLiveData ? "text-green-700 font-semibold" : "text-slate-400"
                  }
                >
                  {hasLiveData ? "LIVE" : "IDLE"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
