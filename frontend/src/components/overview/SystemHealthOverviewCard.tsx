"use client";

import React from "react";
import Link from "next/link";
import { HeartPulse, ArrowRight, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { SystemHealthData } from "@/types/telemetry";

import { useSystemHealth } from "@/context/SystemHealthContext";

interface SystemHealthOverviewCardProps {
  health?: SystemHealthData | null;
  hasLiveData?: boolean;
}

export function SystemHealthOverviewCard({
  health: propHealth,
  hasLiveData: propHasLiveData,
}: SystemHealthOverviewCardProps) {
  const authoritative = useSystemHealth();
  const health = authoritative.rawHealthData ?? propHealth;

  const services = [
    {
      name: "Physical ESP32-S3",
      status: authoritative.physicalEsp32.displayStatus,
      details: authoritative.physicalEsp32.isOnline
        ? (authoritative.physicalEsp32.packetAgeSec != null
            ? `Active packet (${authoritative.physicalEsp32.packetAgeSec.toFixed(1)}s)`
            : "Active physical heartbeat")
        : "Physical hardware NOT CONNECTED",
      latency: authoritative.physicalEsp32.isOnline ? health?.esp32?.latency_ms : null,
      isCore: true,
    },
    {
      name: "Hardware Simulator",
      status: authoritative.simulator.displayStatus,
      details: authoritative.simulator.isRunning
        ? (authoritative.simulator.packetAgeSec != null
            ? `Simulated stream (${authoritative.simulator.packetAgeSec.toFixed(1)}s)`
            : "Simulator active")
        : "Simulator offline",
      latency: authoritative.simulator.isRunning ? (health?.simulator?.latency_ms || 1.2) : null,
      isCore: true,
    },
    {
      name: "MQTT / HiveMQ",
      status: authoritative.mqtt.state,
      details: `${authoritative.mqtt.brokerHost} (Port ${authoritative.mqtt.brokerPort})`,
      latency: health?.mqtt_broker?.latency_ms,
      isCore: true,
    },
    {
      name: "Node-RED Service",
      status: authoritative.nodeRed.service?.status || authoritative.nodeRed.state,
      details: authoritative.nodeRed.details,
      latency: health?.node_red?.latency_ms,
      isCore: false,
    },
    {
      name: "Node-RED MQTT Input",
      status: authoritative.nodeRed.mqtt?.status || (authoritative.nodeRed.state === "ONLINE" ? "CONNECTED" : "DISCONNECTED"),
      details: authoritative.nodeRed.mqtt?.status === "RECEIVING"
        ? "Subscribed & receiving packets"
        : (authoritative.nodeRed.state === "ONLINE" ? "Connected to HiveMQ Cloud (Port 8883)" : "Node-RED offline"),
      latency: health?.node_red_mqtt?.latency_ms || health?.mqtt_broker?.latency_ms,
      isCore: false,
    },
    {
      name: "FastAPI",
      status: authoritative.fastApi.state,
      details: health?.backend_api?.details || "REST & WebSockets Core",
      latency: health?.backend_api?.latency_ms,
      isCore: true,
    },
    {
      name: "PostgreSQL",
      status: authoritative.postgres.state === "CONNECTED" ? "ONLINE" : "OFFLINE",
      details: health?.database?.details || "Audit & Timeseries Database",
      latency: health?.database?.latency_ms,
      isCore: true,
    },
    {
      name: "WebSocket",
      status: authoritative.websocket.state === "ESTABLISHED" ? "CONNECTED" : "DISCONNECTED",
      details: health?.websocket?.details || "Real-time browser stream",
      latency: health?.websocket?.latency_ms,
      isCore: true,
    },
    {
      name: "Gemini AI",
      status: health?.ai_service?.status || "AVAILABLE",
      details: health?.ai_service?.details || "Advisory diagnostics engine",
      latency: health?.ai_service?.latency_ms,
      isCore: false,
    },
  ];

  return (
    <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-4 font-sans text-[#172033]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <HeartPulse className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wide font-mono">
              System Service Health
            </h3>
            <p className="text-[11px] text-[#64748B]">
              Authoritative Health Probes • 7 Monitored Services
            </p>
          </div>
        </div>

        <Link
          href="/system-health"
          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 font-mono transition-colors"
        >
          <span>FULL DIAGNOSTICS</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Services List */}
      <div className="divide-y divide-[#E2E8F0] text-xs font-mono">
        {services.map((svc) => {
          const isOnline =
            svc.status === "ONLINE" ||
            svc.status === "CONNECTED" ||
            svc.status === "AVAILABLE";

          const isWarning = svc.status === "STALE" || svc.status === "DEGRADED";

          return (
            <div
              key={svc.name}
              className="py-2 flex items-center justify-between gap-2 hover:bg-slate-50 px-1 rounded transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isOnline
                      ? "bg-[#16A34A]"
                      : isWarning
                      ? "bg-[#D97706]"
                      : "bg-[#DC2626]"
                  }`}
                />
                <div>
                  <span className="font-bold text-[#172033] block text-[11px]">
                    {svc.name}
                  </span>
                  <span className="text-[10px] text-[#64748B] block truncate max-w-[180px]">
                    {svc.details}
                  </span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                    isOnline
                      ? "bg-green-50 text-green-700 border-green-200"
                      : isWarning
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}
                >
                  {svc.status}
                </span>
                <span className="text-[9px] text-[#94A3B8] block mt-0.5 tabular-nums">
                  {svc.latency != null ? `${svc.latency.toFixed(1)}ms` : "---"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
