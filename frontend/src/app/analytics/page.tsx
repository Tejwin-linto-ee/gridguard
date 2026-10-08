"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { Gauge, AlertCircle, Database } from "lucide-react";

export default function AnalyticsPage() {
  const { system, channels, hasLiveData, refresh } = useLiveTelemetry();
  const [timeRange, setTimeRange] = useState("1h");

  return (
    <AppShell title="ELECTRICAL ANALYTICS & WAVEFORMS" dataSource={hasLiveData ? "LIVE MQTT" : "WAITING FOR MQTT"} onRefresh={refresh}>
      <div className="space-y-6 font-sans">
        {/* Controls Header */}
        <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider">
              HISTORICAL TELEMETRY TRENDS
            </h2>
            <p className="text-[11px] text-[#64748B] mt-0.5">PZEM-004T system metrics and 4-channel load analytics</p>
          </div>

          <div className="flex items-center gap-2">
            {["1h", "6h", "12h", "24h", "7d", "30d"].map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold uppercase transition-colors cursor-pointer ${
                  timeRange === r
                    ? "bg-[#2563EB] text-white shadow-xs"
                    : "bg-white text-[#475569] hover:text-[#172033] hover:bg-[#F8FAFC] border border-[#CBD5E1]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Trend Wave: Active Power & Total Current */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                <Gauge className="w-4 h-4 text-[#2563EB]" />
              </div>
              <span className="text-xs font-bold text-[#172033] uppercase font-mono">
                SYSTEM ACTIVE POWER (W) &amp; CURRENT DEMAND (A)
              </span>
            </div>
            <span className="text-[10px] text-[#64748B] font-mono">Telemetry Source: PZEM-004T</span>
          </div>

          {/* High-DPI Chart Area with Zero-Fabrication Empty State */}
          <div className="h-64 w-full bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] p-4 relative flex flex-col justify-between">
            {!hasLiveData ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                <Database className="w-8 h-8 text-[#94A3B8]" />
                <div className="text-xs font-bold text-[#B45309] font-mono uppercase tracking-wider">
                  WAITING FOR LIVE MQTT TELEMETRY — NO HISTORICAL ELECTRICAL DATA
                </div>
                <p className="text-[11px] text-[#64748B] max-w-md font-mono">
                  Analytics strictly adheres to the Zero Fabricated Telemetry Policy. Synthetic sine waves, fake historical curves, and dummy power profiles are strictly prohibited.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-1.5 text-[#15803D] font-bold">
                    <span className="w-2.5 h-1 bg-[#16A34A] rounded-full" /> Power: {system.power != null ? `${system.power.toFixed(1)} W` : "---"}
                  </span>
                  <span className="flex items-center gap-1.5 text-[#2563EB] font-bold">
                    <span className="w-2.5 h-1 bg-[#2563EB] rounded-full" /> Current: {system.current != null ? `${system.current.toFixed(2)} A` : "---"}
                  </span>
                </div>

                <div className="flex-1 flex items-center justify-center font-mono text-xs text-[#64748B]">
                  Live stream active. Sampling time window: {timeRange}
                </div>

                {/* X-Axis Ticks */}
                <div className="flex justify-between text-[10px] text-[#64748B] font-mono pt-2 border-t border-[#E2E8F0]">
                  <span>-{timeRange}</span>
                  <span className="text-[#15803D] font-bold">● Live Stream (Now)</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 4 Prototype Channels Comparison Grid */}
        <div>
          <h3 className="text-xs font-bold text-[#64748B] uppercase font-mono tracking-wider mb-3">
            CHANNELS 01–04 APPARENT POWER (VA) COMPARISON
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {channels.map((ch) => (
              <div key={ch.channel} className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
                <div className="flex items-center justify-between text-xs font-mono border-b border-[#E2E8F0] pb-2">
                  <span className="font-bold text-[#172033]">Channel 0{ch.channel}</span>
                  <span className="text-[#2563EB] font-bold">
                    {ch.apparent_power != null ? `${ch.apparent_power.toFixed(1)} VA` : "---"}
                  </span>
                </div>
                <div className="mt-3 text-[11px] text-[#64748B] space-y-1.5 font-mono">
                  <div className="flex justify-between">
                    <span>Voltage (ZMPT):</span>
                    <span className="text-[#172033] font-bold">{ch.voltage != null ? `${ch.voltage.toFixed(1)} V` : "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current (ACS712):</span>
                    <span className="text-[#172033] font-bold">{ch.current != null ? `${ch.current.toFixed(2)} A` : "---"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duty Hours:</span>
                    <span className="text-[#475569]">{ch.operating_hours != null ? `${ch.operating_hours.toFixed(1)}h` : "0.0h"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
