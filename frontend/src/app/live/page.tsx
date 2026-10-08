"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { StatusBadge } from "@/components/common/StatusBadge";
import { api } from "@/lib/api";
import { Activity, Zap, Power, ShieldAlert, CheckCircle2, AlertCircle } from "lucide-react";

export default function LiveMonitoringPage() {
  const { system, channels, hasLiveData, packetAgeSec, refresh } = useLiveTelemetry();
  const [controlLoading, setControlLoading] = useState<number | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const toggleRelay = async (channel: number, relayType: "MAIN" | "AUXILIARY", currentState: boolean | null) => {
    try {
      setControlLoading(channel);
      const action = currentState ? "OPEN" : "CLOSE";
      const res = await api.commandRelay(channel, relayType, action);
      setActionNotice(res.message);
      refresh();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setActionNotice(err.message || "Failed to switch relay");
    } finally {
      setControlLoading(null);
    }
  };

  return (
    <AppShell title="LIVE TELEMETRY MONITORING" dataSource={hasLiveData ? "LIVE MQTT" : "WAITING FOR MQTT"} onRefresh={refresh}>
      {actionNotice && (
        <div className="p-3 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-xs text-[#1D4ED8] flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 text-[#2563EB]" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Zero Fabricated Telemetry Integrity Banner */}
      {!hasLiveData && (
        <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#D97706] shrink-0" />
            <div>
              <span className="font-bold text-[#B45309] font-mono uppercase tracking-wider block">
                WAITING FOR LIVE MQTT TELEMETRY
              </span>
              <span className="text-[#64748B] text-[11px]">
                Awaiting telemetry from HiveMQ broker (smarttransformer/system). Gauges will activate as soon as ESP32 packets arrive.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* System Ingestion Rate & Header */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${hasLiveData ? "bg-[#16A34A]" : "bg-[#D97706]"}`} />
          <span className="text-xs font-mono font-bold text-[#172033] uppercase">
            HIGH-FREQUENCY TELEMETRY INGESTION STREAM (100ms SAMPLING)
          </span>
        </div>
        <div className="text-xs font-mono text-[#64748B]">
          ESP32-S3 FreeRTOS &rarr; HiveMQ &rarr; WebSocket &rarr; Client {packetAgeSec != null ? `(${packetAgeSec.toFixed(1)}s ago)` : ""}
        </div>
      </div>

      {/* 4 Channels High Frequency Electrical Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {channels.map((ch) => (
          <div key={ch.channel} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-[#E2E8F0] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#172033] font-mono">
                    PROTOTYPE LOAD CHANNEL 0{ch.channel}
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] font-bold">
                    {ch.priority_level}
                  </span>
                </div>
                <StatusBadge status={ch.status} size="sm" />
              </div>

              {/* Real-time Meter Gauges (Voltage, Current, Active Power W, Apparent Power VA) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                  <span className="text-[10px] text-[#64748B] font-mono uppercase font-semibold">Voltage</span>
                  <div className="text-base font-bold text-[#172033] font-mono mt-1 tabular-nums">
                    {hasLiveData && ch.voltage != null ? `${ch.voltage.toFixed(1)} V` : "--- V"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                  <span className="text-[10px] text-[#64748B] font-mono uppercase font-semibold">Current</span>
                  <div className="text-base font-bold text-[#172033] font-mono mt-1 tabular-nums">
                    {hasLiveData && ch.current != null ? `${ch.current.toFixed(3)} A` : "--- A"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                  <span className="text-[10px] text-blue-700 font-mono uppercase font-bold">Active Power</span>
                  <div className="text-base font-bold text-[#172033] font-mono mt-1 tabular-nums">
                    {hasLiveData && ch.active_power != null ? `${ch.active_power.toFixed(1)} W` : "--- W"}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                  <span className="text-[10px] text-[#64748B] font-mono uppercase font-semibold">Apparent Power</span>
                  <div className="text-base font-bold text-[#172033] font-mono mt-1 tabular-nums">
                    {hasLiveData && (ch.apparent_power != null || (ch.voltage != null && ch.current != null))
                      ? `${(ch.apparent_power ?? (ch.voltage! * ch.current!)).toFixed(1)} VA`
                      : "--- VA"}
                  </div>
                </div>
              </div>

              {/* Relay Control Toggles */}
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
                <div className="text-[10px] font-bold text-[#475569] uppercase font-mono tracking-wider flex items-center justify-between">
                  <span>RELAY SWITCHING CONTROL (COMMANDED STATE)</span>
                  <span className="text-[#94A3B8]">FEEDBACK NOT AVAILABLE</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Power className={`w-4 h-4 ${ch.main_relay ? "text-[#15803D]" : "text-[#94A3B8]"}`} />
                    <span className="text-xs text-[#172033] font-mono font-medium">Main Relay {ch.channel}:</span>
                    <span className={`text-xs font-bold font-mono ${ch.main_relay ? "text-[#15803D]" : "text-[#64748B]"}`}>
                      {ch.main_relay == null ? "N/A" : ch.main_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                    </span>
                  </div>
                  <button
                    disabled={controlLoading === ch.channel || ch.status === "FAULT LATCHED"}
                    onClick={() => toggleRelay(ch.channel, "MAIN", ch.main_relay)}
                    className="px-3 py-1 rounded-lg bg-white hover:bg-[#F8FAFC] disabled:opacity-40 text-xs font-mono text-[#475569] hover:text-[#172033] border border-[#CBD5E1] shadow-2xs transition-colors cursor-pointer"
                  >
                    {ch.main_relay == null ? "Toggle" : ch.main_relay ? "Switch OFF" : "Switch ON"}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <Power className={`w-4 h-4 ${ch.aux_relay ? "text-[#15803D]" : "text-[#94A3B8]"}`} />
                    <span className="text-xs text-[#172033] font-mono font-medium">Aux Relay {ch.channel}:</span>
                    <span className={`text-xs font-bold font-mono ${ch.aux_relay ? "text-[#15803D]" : "text-[#64748B]"}`}>
                      {ch.aux_relay == null ? "N/A" : ch.aux_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                    </span>
                  </div>
                  <button
                    disabled={controlLoading === ch.channel || ch.status === "FAULT LATCHED"}
                    onClick={() => toggleRelay(ch.channel, "AUXILIARY", ch.aux_relay)}
                    className="px-3 py-1 rounded-lg bg-white hover:bg-[#F8FAFC] disabled:opacity-40 text-xs font-mono text-[#475569] hover:text-[#172033] border border-[#CBD5E1] shadow-2xs transition-colors cursor-pointer"
                  >
                    {ch.aux_relay == null ? "Toggle" : ch.aux_relay ? "Switch OFF" : "Switch ON"}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Risk & Operating Ticker */}
            <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B] font-mono">
              <span>Risk Index: <strong className="text-[#172033]">{ch.risk_index != null ? `${ch.risk_index.toFixed(0)}/100` : "--/100"}</strong></span>
              <span>Load: <strong className="text-[#172033]">{ch.load_active == null ? "UNKNOWN" : ch.load_active ? "BULB ON" : "BULB OFF"}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
