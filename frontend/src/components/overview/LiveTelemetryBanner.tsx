"use client";

import React from "react";
import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";

interface LiveTelemetryBannerProps {
  hasLiveData: boolean;
  packetAgeSec?: number | null;
  latencyMs?: number | null;
  esp32Status?: "ONLINE" | "OFFLINE";
  lastHeartbeatAgeSec?: number | null;
  mqttConnected?: boolean;
  deviceMode?: string;
  hardwareType?: string;
  connectionStatus?: string;
}

export function LiveTelemetryBanner({
  hasLiveData,
  packetAgeSec,
  latencyMs,
  esp32Status = "OFFLINE",
  lastHeartbeatAgeSec,
  mqttConnected = false,
  deviceMode = "SIMULATOR",
  hardwareType = "ESP32-S3 SIMULATOR",
  connectionStatus,
}: LiveTelemetryBannerProps) {
  const isOnline = esp32Status === "ONLINE";
  const isSimulator = deviceMode === "SIMULATOR" || hardwareType.includes("SIMULATOR");
  const isStale = hasLiveData && packetAgeSec != null && packetAgeSec > 10;

  // Independent Connection State Machine: WAITING_FOR_DEVICE | ONLINE | STALE | OFFLINE
  const effectiveConnStatus =
    connectionStatus ||
    (!hasLiveData && packetAgeSec == null
      ? "WAITING_FOR_DEVICE"
      : isStale
      ? "STALE"
      : isOnline
      ? "ONLINE"
      : "OFFLINE");

  // Fix Telemetry Age: Guard against large or invalid timestamps
  const ageDisplay =
    packetAgeSec != null && packetAgeSec >= 0 && packetAgeSec < 86400
      ? `${packetAgeSec.toFixed(1)} s`
      : "---";

  const hbDisplay =
    lastHeartbeatAgeSec != null && lastHeartbeatAgeSec >= 0 && lastHeartbeatAgeSec < 86400
      ? `${lastHeartbeatAgeSec.toFixed(1)} s ago`
      : "No heartbeat";

  return (
    <div
      className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 font-sans transition-colors ${
        isOnline && hasLiveData && !isStale
          ? "bg-green-50/70 border-green-200 text-green-950"
          : isStale
          ? "bg-amber-50/80 border-amber-300 text-amber-950"
          : "bg-[#FFFBEB] border-amber-200 text-amber-950"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full shrink-0 ${
            effectiveConnStatus === "ONLINE"
              ? "bg-[#16A34A]"
              : effectiveConnStatus === "STALE"
              ? "bg-amber-500 animate-pulse"
              : "bg-[#DC2626] animate-pulse"
          }`}
        />
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xs uppercase tracking-wider font-mono">
              {isSimulator
                ? "CONTROLLER: SIMULATOR ACTIVE | PHYSICAL ESP32: NOT CONNECTED"
                : isOnline
                ? "CONTROLLER: PHYSICAL ESP32-S3 \u25cf ONLINE"
                : "CONTROLLER: PHYSICAL ESP32-S3 \u25cf NOT CONNECTED"}
            </span>

            {/* 1. Independent Device Mode Badge */}
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
                deviceMode === "SIMULATOR"
                  ? "bg-purple-100 text-purple-800 border-purple-300"
                  : deviceMode === "HARDWARE_VALIDATED"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : deviceMode === "HARDWARE_VALIDATION_PENDING"
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : deviceMode === "REAL_HARDWARE"
                  ? "bg-blue-100 text-blue-800 border-blue-300"
                  : "bg-slate-100 text-slate-800 border-slate-300"
              }`}
            >
              DEVICE MODE: {deviceMode ? deviceMode.replace(/_/g, " ") : "SIMULATOR"}
            </span>

            {/* 2. Physical ESP32 Hardware Status Badge */}
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
                isOnline
                  ? "bg-green-100 text-green-800 border-green-300"
                  : "bg-slate-100 text-slate-700 border-slate-300"
              }`}
            >
              PHYSICAL ESP32: {isOnline ? "ONLINE" : "NOT CONNECTED"}
            </span>

            {/* 3. Simulator Status Badge */}
            {isSimulator && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded border font-mono bg-blue-100 text-blue-800 border-blue-300">
                SIMULATOR: {hasLiveData ? "ONLINE" : "STANDBY"}
              </span>
            )}

            {/* 4. Connection Status Badge */}
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
                effectiveConnStatus === "ONLINE"
                  ? "bg-green-100 text-green-800 border-green-300"
                  : effectiveConnStatus === "STALE"
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : effectiveConnStatus === "WAITING_FOR_DEVICE"
                  ? "bg-slate-100 text-slate-800 border-slate-300"
                  : "bg-red-100 text-red-800 border-red-300"
              }`}
            >
              CONNECTION: {effectiveConnStatus.replace(/_/g, " ")}
            </span>

            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${
                mqttConnected
                  ? "bg-white text-green-700 border-green-300"
                  : "bg-white text-red-700 border-red-300"
              }`}
            >
              MQTT: {mqttConnected ? "CONNECTED" : "DISCONNECTED"}
            </span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-0.5 font-mono">
            Last heartbeat: <strong className="text-[#172033]">{hbDisplay}</strong> • Architecture: ESP32-S3 → HiveMQ Cloud (TLS 8883) → Node-RED → FastAPI
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono">
        <div className="hidden md:flex items-center gap-3 text-[11px] text-[#64748B]">
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Telemetry Age:</span>
            <strong className="text-[#172033] tabular-nums">{ageDisplay}</strong>
          </div>
        </div>

        {!isOnline && (
          <Link
            href="/demo"
            className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs transition-colors shrink-0 flex items-center gap-1"
          >
            <span>Exhibition Demo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
