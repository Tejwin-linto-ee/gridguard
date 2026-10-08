"use client";

import React from "react";
import Link from "next/link";
import { Cpu, ArrowRight, Zap, Shield, Radio, Activity, CheckCircle2 } from "lucide-react";
import { ChannelData, SystemTelemetry } from "@/types/telemetry";

interface DigitalTwinPreviewCardProps {
  system: SystemTelemetry;
  channels: ChannelData[];
  hasLiveData: boolean;
  deviceMode?: string;
  hardwareType?: string;
}

export function DigitalTwinPreviewCard({
  system,
  channels,
  hasLiveData,
  deviceMode = "SIMULATOR",
  hardwareType = "ESP32-S3 SIMULATOR",
}: DigitalTwinPreviewCardProps) {
  const isSimulator = deviceMode === "SIMULATOR" || hardwareType.includes("SIMULATOR");
  return (
    <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-4 font-sans text-[#172033]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wide font-mono">
                Digital Twin Topology Preview
              </h3>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono border ${
                isSimulator ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}>
                CONTROLLER: {isSimulator ? "ESP32-S3 SIMULATOR" : "ESP32-S3 N16R8"}
              </span>
            </div>
            <p className="text-[11px] text-[#64748B]">
              Physical Architecture: AC Input → PZEM → Distribution Bus → 4 Parallel Channels
            </p>
          </div>
        </div>

        <Link
          href="/digital-twin"
          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 font-mono transition-colors"
        >
          <span>OPEN FULL DIGITAL TWIN</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Electrical Topology Schematic Preview */}
      <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] space-y-3 font-mono">
        {/* Stage 1: AC Mains + PZEM Meter */}
        <div className="flex items-center justify-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] font-bold text-[#172033] shadow-2xs flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-blue-600" />
            <span>AC MAINS 230V</span>
          </div>
          <span className="text-[#64748B] font-bold">&rarr;</span>
          <div className="px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] font-bold text-[#172033] shadow-2xs">
            PZEM-004T V3.0
          </div>
          <span className="text-[#64748B] font-bold">&rarr;</span>
          <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-[#1D4ED8] font-bold shadow-2xs">
            LIVE DISTRIBUTION BUS
          </div>
        </div>

        {/* Stage 2: 4 Parallel Prototype Channels */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#E2E8F0]">
          {[1, 2, 3, 4].map((chId) => {
            const ch = channels.find((c) => c.channel === chId);
            const isTripped = ch?.status === "FAULT LATCHED" || ch?.status === "TRIPPED";
            const mainOn = ch?.main_relay === true;
            const auxOn = ch?.aux_relay === true;

            return (
              <div
                key={chId}
                className="bg-white p-2.5 rounded-lg border border-[#E2E8F0] text-[10px] space-y-1 shadow-2xs text-center"
              >
                <div className="flex items-center justify-between font-bold border-b border-slate-100 pb-1">
                  <span>CH 0{chId}</span>
                  <span
                    className={
                      isTripped
                        ? "text-red-600 font-bold"
                        : hasLiveData
                        ? "text-green-700 font-bold"
                        : "text-slate-400"
                    }
                  >
                    {isTripped ? "TRIPPED" : hasLiveData ? "ENERGIZED" : "IDLE"}
                  </span>
                </div>
                <div className="text-[9px] text-[#64748B] text-left pt-0.5 space-y-0.5">
                  <div>ZMPT101B (Voltage)</div>
                  <div>Main + Aux: {mainOn && auxOn ? "CLOSED" : "OPEN"}</div>
                  <div>ACS712 (Current)</div>
                  <div className="text-[#172033] font-bold truncate">Prototype Load</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Communication Pipeline Strip */}
      <div className="p-3 bg-white rounded-lg border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[#64748B]">
        <span className="font-bold text-[#172033]">TELEMETRY PIPELINE:</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">ESP32-S3</span>
          <span>&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">HiveMQ</span>
          <span>&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">Node-RED</span>
          <span>&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">FastAPI</span>
          <span>&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">PostgreSQL</span>
          <span>&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-green-50 border border-green-200 text-green-800 font-bold">WebSocket</span>
        </div>
      </div>
    </div>
  );
}
