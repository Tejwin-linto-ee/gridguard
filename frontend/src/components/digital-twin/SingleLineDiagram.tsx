"use client";

import React from "react";
import { Zap, ShieldCheck, Lightbulb } from "lucide-react";
import { ChannelData, SystemTelemetry } from "@/types/telemetry";

interface SingleLineDiagramProps {
  system: SystemTelemetry;
  channels: ChannelData[];
  selectedChannels?: Set<number>;
  onChannelSelect?: (channelId: number) => void;
}

export function SingleLineDiagram({
  system,
  channels,
  selectedChannels,
  onChannelSelect,
}: SingleLineDiagramProps) {
  return (
    <div className="bg-white p-5 border border-[#E2E8F0] rounded-xl shadow-xs font-mono">
      {/* Schematic Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-[#E2E8F0] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-[#172033] uppercase tracking-wider">
              ELECTRICAL SINGLE-LINE DIAGRAM (SLD) DIGITAL TWIN
            </h2>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
              SYNCHRONIZED TELEMETRY
            </span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-0.5">
            AC Mains Conductor &rarr; PZEM-004T Meter &rarr; Channel Live Bus &rarr; ZMPT101B &rarr; Main Relay &rarr; Aux Relay &rarr; ACS712 &rarr; Prototype Load &rarr; Neutral Bus
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3.5 text-[10px] text-[#64748B]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span>Distribution Bus</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-600" />
            <span>Relays Closed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-600" />
            <span>Relays Open</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Bulb Active</span>
          </div>
        </div>
      </div>

      {/* Industrial SLD Schematic Canvas */}
      <div className="w-full overflow-x-auto">
        <div className="min-w-[720px] p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
          {/* 1. AC Mains Source Node */}
          <div className="flex justify-center mb-4">
            <div className="px-4 py-2 rounded-lg bg-white border border-[#E2E8F0] shadow-xs flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-blue-600" />
              <div>
                <div className="text-xs font-bold text-[#172033]">AC MAINS 230V 50Hz</div>
                <div className="text-[10px] text-[#64748B]">
                  Grid Feed: {system.voltage != null ? system.voltage.toFixed(1) : "---"} V • {system.frequency != null ? system.frequency.toFixed(2) : "---"} Hz
                </div>
              </div>
            </div>
          </div>

          {/* Central Conductor Line */}
          <div className="w-0.5 h-3 bg-blue-600 mx-auto" />

          {/* 2. System-Level Meter: PZEM-004T */}
          <div className="flex justify-center mb-4">
            <div className="w-80 p-2.5 rounded-lg bg-white border border-[#E2E8F0] shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <div>
                  <span className="text-xs font-bold text-[#172033] block">PZEM-004T V3.0</span>
                  <span className="text-[9px] text-[#64748B]">Total System Sensing</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-[#172033] tabular-nums">
                  {system.power != null ? system.power.toFixed(1) : "---"} W
                </div>
                <div className="text-[10px] text-[#64748B] tabular-nums">
                  {system.current != null ? system.current.toFixed(2) : "---"} A • PF: {system.power_factor != null ? system.power_factor.toFixed(2) : "---"}
                </div>
              </div>
            </div>
          </div>

          {/* Central Conductor Line */}
          <div className="w-0.5 h-3 bg-blue-600 mx-auto" />

          {/* 3. Common Parallel Distribution Bus */}
          <div className="relative mb-6 px-4">
            <div className="h-1 w-full bg-blue-600 rounded-full" />
            <div className="text-center text-[9px] text-blue-700 font-bold mt-1 uppercase tracking-widest">
              PARALLEL DISTRIBUTION BUS (CH1 – CH4)
            </div>
          </div>

          {/* 4. Four Parallel Load Channels */}
          <div className="grid grid-cols-4 gap-3">
            {channels.map((ch) => {
              const isSelected = selectedChannels?.has(ch.channel);
              const isTripped = ch.status === "TRIPPED" || ch.status === "FAULT LATCHED";
              const isMaintenance = ch.status === "MAINTENANCE";
              const isLoadGlow = ch.load_active && ch.main_relay && ch.aux_relay;

              return (
                <div
                  key={ch.channel}
                  onClick={() => onChannelSelect && onChannelSelect(ch.channel)}
                  className={`p-3 rounded-lg border flex flex-col items-center gap-2.5 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-[#EFF6FF] border-2 border-[#2563EB]"
                      : isTripped
                      ? "bg-red-50/60 border-red-200"
                      : isMaintenance
                      ? "bg-blue-50/50 border-blue-200"
                      : "bg-white border-[#E2E8F0] shadow-2xs hover:border-slate-300"
                  }`}
                >
                  {/* Channel Header */}
                  <div className="w-full flex items-center justify-between border-b border-[#E2E8F0] pb-1.5">
                    <span className="text-xs font-bold text-[#172033]">CH 0{ch.channel}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        isTripped
                          ? "bg-red-100 text-red-700 border border-red-200"
                          : isMaintenance
                          ? "bg-blue-100 text-blue-700 border border-blue-200"
                          : "bg-green-100 text-green-700 border border-green-200"
                      }`}
                    >
                      {ch.status}
                    </span>
                  </div>

                  {/* Step A: ZMPT101B Voltage Sensing */}
                  <div className="w-full p-1.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                    <div className="text-[9px] text-[#64748B] uppercase">ZMPT101B</div>
                    <div className="text-[11px] font-bold text-[#172033] tabular-nums">
                      {ch.voltage != null ? ch.voltage.toFixed(1) : "---"} V
                    </div>
                  </div>

                  {/* Drop Conductor */}
                  <div className={`w-0.5 h-2.5 ${isTripped ? "bg-red-600" : "bg-blue-600"}`} />

                  {/* Step B: Main Relay */}
                  <div
                    className={`w-full p-1.5 rounded border text-center ${
                      ch.main_relay
                        ? "bg-green-50 border-green-200 text-green-800"
                        : "bg-red-50 border-red-200 text-red-800"
                    }`}
                  >
                    <div className="text-[9px] text-[#64748B]">MAIN RELAY</div>
                    <div className="text-[10px] font-bold">
                      {ch.main_relay == null ? "UNKNOWN" : ch.main_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                    </div>
                  </div>

                  {/* Stagger Conductor */}
                  <div className={`w-0.5 h-2 ${isTripped ? "bg-red-600" : "bg-blue-600"}`} />

                  {/* Step C: Auxiliary Relay */}
                  <div
                    className={`w-full p-1.5 rounded border text-center ${
                      ch.aux_relay
                        ? "bg-green-50 border-green-200 text-green-800"
                        : "bg-red-50 border-red-200 text-red-800"
                    }`}
                  >
                    <div className="text-[9px] text-[#64748B]">AUX RELAY</div>
                    <div className="text-[10px] font-bold">
                      {ch.aux_relay == null ? "UNKNOWN" : ch.aux_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div className="text-[8px] text-[#94A3B8] uppercase tracking-tight">
                    FEEDBACK: NOT AVAILABLE
                  </div>

                  {/* Drop Conductor */}
                  <div className={`w-0.5 h-2.5 ${isTripped ? "bg-red-600" : "bg-blue-600"}`} />

                  {/* Step D: ACS712 Current Sensing */}
                  <div className="w-full p-1.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                    <div className="text-[9px] text-[#64748B] uppercase">ACS712</div>
                    <div className="text-[11px] font-bold text-[#172033] tabular-nums">
                      {ch.current != null ? ch.current.toFixed(2) : "---"} A
                    </div>
                  </div>

                  {/* Drop Conductor */}
                  <div className={`w-0.5 h-2.5 ${isTripped ? "bg-red-600" : "bg-blue-600"}`} />

                  {/* Step E: Prototype Bulb Load */}
                  <div
                    className={`w-full p-2 rounded-lg border flex flex-col items-center gap-1 ${
                      isLoadGlow
                        ? "bg-amber-50 border-amber-200 text-amber-900"
                        : "bg-[#F8FAFC] border-[#E2E8F0] text-slate-500"
                    }`}
                  >
                    <Lightbulb className={`w-4 h-4 ${isLoadGlow ? "text-amber-600 fill-amber-500" : "text-slate-400"}`} />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#172033]">PROTOTYPE LOAD CH{ch.channel}</span>
                    <span className="text-[8px] font-bold">{isLoadGlow ? "● ENERGIZED" : "○ DE-ENERGIZED"}</span>
                    <span className="text-[7px] text-[#94A3B8] uppercase tracking-tight">COMMANDED LOAD STATE</span>
                    <div className="w-full mt-1 pt-1 border-t border-[#E2E8F0] text-[8px] flex justify-between text-[#64748B]">
                      <span>S (V&times;I):</span>
                      <span className="font-bold text-[#172033] tabular-nums">
                        {ch.voltage != null && ch.current != null
                          ? `${(ch.voltage * ch.current).toFixed(1)} VA`
                          : "--- VA"}
                      </span>
                    </div>
                  </div>

                  {/* Return Line to Common Neutral */}
                  <div className="w-0.5 h-3 bg-slate-400" />
                </div>
              );
            })}
          </div>

          {/* 5. Common Neutral Return Busbar */}
          <div className="relative mt-3 px-4">
            <div className="h-1 w-full bg-slate-400 rounded-full" />
            <div className="text-center text-[9px] text-[#64748B] font-bold mt-1 uppercase tracking-widest">
              COMMON NEUTRAL RETURN BUSBAR
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
