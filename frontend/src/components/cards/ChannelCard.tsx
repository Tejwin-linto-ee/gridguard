"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, CheckSquare, Square } from "lucide-react";
import { ChannelData } from "@/types/telemetry";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useSystemHealth } from "@/context/SystemHealthContext";

interface ChannelCardProps {
  channel: ChannelData;
  hasLiveData?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (channelId: number) => void;
}

export function ChannelCard({
  channel,
  hasLiveData = true,
  isSelected = false,
  onToggleSelect,
}: ChannelCardProps) {
  const health = useSystemHealth();
  const isTripped = channel.status === "TRIPPED" || channel.status === "FAULT LATCHED";
  const isMaintenance = channel.status === "MAINTENANCE";
  const live = hasLiveData && channel.has_live_data !== false;

  let borderColor = "border-[#E2E8F0] bg-white";
  if (isSelected) borderColor = "border-2 border-[#2563EB] bg-[#EFF6FF]";
  else if (isTripped) borderColor = "border-red-300 bg-red-50/20";
  else if (isMaintenance) borderColor = "border-blue-300 bg-blue-50/20";
  else if (channel.status === "NORMAL") borderColor = "border-[#E2E8F0] hover:border-slate-300 bg-white";

  return (
    <div className={`scada-panel p-4 border ${borderColor} flex flex-col justify-between font-mono text-xs transition-colors rounded-xl shadow-2xs`}>
      {/* Card Header: Channel ID & Status */}
      <div>
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#172033] tracking-wider">
              CHANNEL 0{channel.channel}
            </span>
            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              {channel.priority_level || "LOAD"}
            </span>
            {(health.deviceMode === "SIMULATOR" || health.telemetrySource === "SIMULATOR_MQTT") && (
              <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                SIMULATED
              </span>
            )}
          </div>
          <StatusBadge status={channel.status} size="sm" />
        </div>

        {/* Primary Electrical Telemetry Table */}
        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] mb-3">
          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase block">VOLTAGE</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg font-bold text-[#172033] tabular-nums">
                {live && channel.voltage != null ? channel.voltage.toFixed(1) : "---"}
              </span>
              <span className="text-[10px] text-slate-400">V</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase block">CURRENT</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-lg font-bold tabular-nums ${!live ? "text-slate-400" : isTripped ? "text-red-600" : "text-[#172033]"}`}>
                {live && channel.current != null ? channel.current.toFixed(2) : "---"}
              </span>
              <span className="text-[10px] text-slate-400">A</span>
            </div>
          </div>

          <div className="col-span-2 pt-1.5 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase font-bold">APPARENT POWER</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-[#172033] tabular-nums">
                {live && channel.apparent_power != null ? channel.apparent_power.toFixed(1) : "---"}
              </span>
              <span className="text-[10px] text-slate-400">VA</span>
            </div>
          </div>
        </div>

        {/* Dual Relay Pair Matrix (Main + Aux) */}
        <div className="space-y-1.5 mb-3 text-[11px]">
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-slate-600 font-medium">Main Relay:</span>
            <div className="flex items-center gap-1.5">
              <span className={`font-bold ${channel.main_relay ? "text-green-700" : "text-red-600"}`}>
                {channel.main_relay == null ? "N/A" : channel.main_relay ? "ON" : "OFF"}
              </span>
              <span className="text-[9px] text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded font-mono">
                FEEDBACK N/A
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-slate-600 font-medium">Aux Relay:</span>
            <div className="flex items-center gap-1.5">
              <span className={`font-bold ${channel.aux_relay ? "text-green-700" : "text-red-600"}`}>
                {channel.aux_relay == null ? "N/A" : channel.aux_relay ? "ON" : "OFF"}
              </span>
              <span className="text-[9px] text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded font-mono">
                FEEDBACK N/A
              </span>
            </div>
          </div>
        </div>

        {/* Protection State & Risk */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
          <div>
            <span>Risk: </span>
            <span className={`font-bold ${channel.risk_index != null && channel.risk_index > 50 ? "text-amber-700" : "text-green-700"}`}>
              {channel.risk_index != null ? `${channel.risk_index.toFixed(0)}/100` : "--/100"}
            </span>
          </div>
          <div>
            <span
              className={
                health.dataProvenance === "LIVE_ESP32_MQTT" || health.dataProvenance === "SIMULATOR_MQTT"
                  ? "text-emerald-700 font-bold"
                  : health.dataProvenance === "STALE_DEVICE_DATA"
                  ? "text-amber-700 font-bold"
                  : "text-slate-400"
              }
            >
              {health.dataProvenanceDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* Action Controls: [ SELECT ] & Inspect */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2">
        {onToggleSelect && (
          <button
            type="button"
            onClick={() => onToggleSelect(channel.channel)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-colors border cursor-pointer ${
              isSelected
                ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                : "bg-white hover:bg-slate-50 text-slate-700 border-slate-300"
            }`}
          >
            {isSelected ? (
              <>
                <CheckSquare className="w-3.5 h-3.5 text-white" />
                <span>SELECTED</span>
              </>
            ) : (
              <>
                <Square className="w-3.5 h-3.5 text-slate-400" />
                <span>SELECT</span>
              </>
            )}
          </button>
        )}

        <Link
          href={`/channels/${channel.channel}`}
          className="p-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors shadow-2xs"
          title={`Detail for Channel ${channel.channel}`}
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
