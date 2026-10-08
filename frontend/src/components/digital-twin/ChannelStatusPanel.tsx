"use client";

import React from "react";
import { Zap, AlertTriangle, ShieldCheck, Crosshair } from "lucide-react";
import { ChannelData } from "@/types/telemetry";

interface ChannelStatusPanelProps {
  channels: ChannelData[];
  selectedChannels?: Set<number>;
  onSelectChannel?: (channelId: number) => void;
  onFocusChannel: (channelId: number) => void;
  focusedChannel?: number | null;
}

export function ChannelStatusPanel({
  channels,
  selectedChannels,
  onSelectChannel,
  onFocusChannel,
  focusedChannel,
}: ChannelStatusPanelProps) {
  return (
    <div className="bg-white p-4 border border-[#E2E8F0] rounded-xl shadow-xs font-mono text-xs text-[#172033]">
      <div className="flex items-center justify-between mb-3 border-b border-[#E2E8F0] pb-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-[#172033] uppercase text-[11px] tracking-wider">
            CHANNEL STATUS & PROTECTION TELEMETRY
          </span>
        </div>
        <span className="text-[10px] text-[#64748B]">
          CLICK &quot;FOCUS&quot; TO ZOOM CANVAS ON CHANNEL
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {channels.map((ch) => {
          const isFocused = focusedChannel === ch.channel;
          const isSelected = selectedChannels?.has(ch.channel);
          const isTripped = ch.status === "TRIPPED" || ch.status === "FAULT LATCHED";
          const isMaint = ch.status === "MAINTENANCE";
          const apparentPower =
            ch.voltage != null && ch.current != null ? (ch.voltage * ch.current).toFixed(1) : null;

          return (
            <div
              key={ch.channel}
              className={`p-3 rounded-lg border transition-all ${
                isFocused
                  ? "bg-[#EFF6FF] border-2 border-[#2563EB] shadow-xs"
                  : isSelected
                  ? "bg-[#EFF6FF] border-2 border-[#2563EB]"
                  : isTripped
                  ? "bg-red-50/60 border-red-200"
                  : isMaint
                  ? "bg-blue-50/40 border-blue-200"
                  : "bg-[#F8FAFC] border-[#E2E8F0] shadow-2xs hover:border-slate-300"
              }`}
            >
              {/* Channel Title & Status */}
              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#E2E8F0]">
                <span className="font-bold text-[#172033] text-xs">CH 0{ch.channel}</span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    isTripped
                      ? "bg-red-100 text-red-700 border border-red-200"
                      : isMaint
                      ? "bg-blue-100 text-blue-700 border border-blue-200"
                      : "bg-green-100 text-green-700 border border-green-200"
                  }`}
                >
                  {ch.status}
                </span>
              </div>

              {/* Electrical Telemetry */}
              <div className="space-y-1 text-[11px] mb-2.5">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Voltage:</span>
                  <span className="font-bold text-[#172033] tabular-nums">
                    {ch.voltage != null ? `${ch.voltage.toFixed(1)} V` : "--- V"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Current:</span>
                  <span className="font-bold text-[#172033] tabular-nums">
                    {ch.current != null ? `${ch.current.toFixed(2)} A` : "--- A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Apparent Power:</span>
                  <span className="font-bold text-[#172033] tabular-nums">
                    {apparentPower != null ? `${apparentPower} VA` : "--- VA"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Main Relay:</span>
                  <span
                    className={`font-bold ${
                      ch.main_relay ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {ch.main_relay == null ? "UNKNOWN" : ch.main_relay ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Aux Relay:</span>
                  <span
                    className={`font-bold ${
                      ch.aux_relay ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {ch.aux_relay == null ? "UNKNOWN" : ch.aux_relay ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] pt-1 border-t border-[#E2E8F0]">
                  <span className="text-[#64748B]">Fault:</span>
                  <span className="text-[#172033] font-semibold">{ch.fault || "NONE"}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#64748B]">Risk Index:</span>
                  <span className="text-[#172033] tabular-nums font-semibold">
                    {ch.risk_index != null ? `${ch.risk_index.toFixed(2)}` : "LOW"}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  onClick={() => onFocusChannel(ch.channel)}
                  className={`flex-1 py-1 px-2 rounded flex items-center justify-center gap-1 text-[10px] font-bold transition-colors ${
                    isFocused
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-[#CBD5E1] text-[#172033] hover:bg-slate-50"
                  }`}
                  title="Center and zoom on this channel in SCADA"
                >
                  <Crosshair className="w-3 h-3" />
                  <span>FOCUS</span>
                </button>
                {onSelectChannel && (
                  <button
                    onClick={() => onSelectChannel(ch.channel)}
                    className={`py-1 px-2 rounded text-[10px] font-bold transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-[#CBD5E1] text-[#172033] hover:bg-slate-50"
                    }`}
                  >
                    {isSelected ? "UNSELECT" : "SELECT"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
