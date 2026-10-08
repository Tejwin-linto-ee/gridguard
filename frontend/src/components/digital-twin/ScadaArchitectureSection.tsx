"use client";

import React from "react";
import {
  Cpu,
  Radio,
  GitMerge,
  Server,
  Database,
  Monitor,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { SystemHealthData } from "@/types/telemetry";
import { InspectedNode } from "./ComponentInspectorDrawer";

import { useSystemHealth } from "@/context/SystemHealthContext";

interface ScadaArchitectureSectionProps {
  health?: SystemHealthData | null;
  hasLiveData?: boolean;
  mqttConnected?: boolean;
  packetAgeSec?: number | null;
  onInspectNode: (node: InspectedNode) => void;
}

export function ScadaArchitectureSection({
  health: propHealth,
  hasLiveData: propHasLiveData,
  mqttConnected: propMqttConnected,
  packetAgeSec: propPacketAgeSec,
  onInspectNode,
}: ScadaArchitectureSectionProps) {
  const authoritative = useSystemHealth();

  // Authoritative state from context
  const isPhysicalOnline = authoritative.physicalEsp32.isOnline;
  const isSimOnline = authoritative.simulator.isRunning;
  const isSimulatorPipeline = authoritative.deviceMode === "SIMULATOR" || (!isPhysicalOnline && isSimOnline);

  const esp32Status = isPhysicalOnline
    ? "ONLINE"
    : isSimOnline
    ? "ONLINE (SIMULATED)"
    : "NOT CONNECTED";

  const esp32Dot = isPhysicalOnline
    ? "bg-green-600"
    : isSimOnline
    ? "bg-blue-600"
    : "bg-slate-400";

  const esp32Color = isPhysicalOnline
    ? "text-green-700 bg-green-50 border-green-200"
    : isSimOnline
    ? "text-blue-700 bg-blue-50 border-blue-200"
    : "text-slate-500 bg-slate-100 border-slate-200";

  const packetAgeSec = authoritative.device.packetAgeSec ?? propPacketAgeSec;
  const hasLiveData = authoritative.device.isLive || authoritative.simulator.isLive;

  // Real states for MQTT, Node-RED, FastAPI, PostgreSQL, WebSocket
  const mqttState = authoritative.mqtt.state;
  const nodeRedState = authoritative.nodeRed.state;
  const fastApiState = authoritative.fastApi.state;
  const postgresState = authoritative.postgres.state === "CONNECTED" ? "ONLINE" : "OFFLINE";
  const wsState = authoritative.websocket.state === "ESTABLISHED" ? "CONNECTED" : "DISCONNECTED";

  const commNodes = [
    {
      type: "ESP32" as const,
      name: isPhysicalOnline ? "ESP32-S3" : isSimOnline ? "Hardware Sim" : "ESP32-S3 (Physical)",
      model: isPhysicalOnline ? "N16R8 Dual-Core" : isSimOnline ? "ESP32-S3 Model" : "NOT CONNECTED",
      role: isPhysicalOnline ? "Physical Protection & ADC" : isSimOnline ? "Simulated Protection & ADC" : "Physical Hardware Standby",
      status: esp32Status,
      statusDot: esp32Dot,
      icon: Cpu,
      iconColor: isPhysicalOnline ? "text-green-600" : isSimOnline ? "text-blue-600" : "text-slate-400",
      protocol: isPhysicalOnline ? "TLS 8883 (Physical)" : "TLS 8883 (Sim)",
      title: isPhysicalOnline ? "ESP32-S3 N16R8 Edge Node" : "Hardware Simulator (ESP32-S3 Model)",
      subtitle: isPhysicalOnline
        ? "Physical FreeRTOS Dual-Core Sensing & Protection Engine"
        : "Physics Emulation of 4 Channels & ADC (hardware_simulator.py)",
    },
    {
      type: "HIVEMQ" as const,
      name: "HiveMQ Cloud",
      model: "MQTT 3.1.1 Broker",
      role: "Cloud Message Exchange",
      status: mqttState,
      statusDot: mqttState === "CONNECTED" ? "bg-green-600" : "bg-red-500",
      icon: Radio,
      iconColor: "text-amber-600",
      protocol: "MQTT Sub",
      title: "HiveMQ Cloud MQTT Broker",
      subtitle: "TLS Encrypted MQTT 3.1.1 Message Exchange",
    },
    {
      type: "NODERED" as const,
      name: "Node-RED",
      model: "Flow Orchestration",
      role: `Service: ${nodeRedState} | MQTT: ${authoritative.nodeRed.mqtt?.status || (nodeRedState === "ONLINE" ? "CONNECTED" : "DISCONNECTED")}`,
      status: nodeRedState === "ONLINE" && (authoritative.nodeRed.mqtt?.status === "CONNECTED" || authoritative.nodeRed.mqtt?.status === "RECEIVING") ? "ONLINE / LIVE" : nodeRedState,
      statusDot: nodeRedState === "ONLINE" ? "bg-green-600" : "bg-slate-400",
      icon: GitMerge,
      iconColor: "text-red-600",
      protocol: "HTTP/JSON",
      title: "Node-RED Industrial Gateway",
      subtitle: `Service: ${nodeRedState} • MQTT: ${authoritative.nodeRed.mqtt?.status || (nodeRedState === "ONLINE" ? "CONNECTED" : "DISCONNECTED")} • Pipeline: ${authoritative.nodeRed.pipeline?.status || "IDLE"}`,
    },
    {
      type: "FASTAPI" as const,
      name: "FastAPI",
      model: "Python Core Backend",
      role: "Protection Analytics & RBAC",
      status: fastApiState,
      statusDot: fastApiState === "ONLINE" ? "bg-green-600" : "bg-red-500",
      icon: Server,
      iconColor: "text-blue-600",
      protocol: "AsyncPG",
      title: "FastAPI Backend Engine",
      subtitle: "Authoritative Protection Logic & REST API",
    },
    {
      type: "FASTAPI" as const,
      name: "PostgreSQL",
      model: "Relational Database",
      role: "Audit Logs & Timeseries",
      status: postgresState,
      statusDot: postgresState === "ONLINE" ? "bg-green-600" : "bg-red-500",
      icon: Database,
      iconColor: "text-indigo-600",
      protocol: "WebSocket",
      title: "PostgreSQL Database",
      subtitle: "Persistent System State & Diagnostic Ledger",
    },
    {
      type: "WEBSOCKET" as const,
      name: "GRIDGUARD SCADA",
      model: "Next.js HMI",
      role: "Single-Line Diagram Twin",
      status: wsState,
      statusDot: wsState === "CONNECTED" ? "bg-green-600" : "bg-slate-400",
      icon: Monitor,
      iconColor: "text-blue-600",
      protocol: "HMI Display",
      title: "GRIDGUARD SCADA Digital Twin",
      subtitle: "Real-Time Operator Cockpit & Diagnostics",
    },
  ];

  return (
    <div className="space-y-4 font-sans text-[#172033]">
      {/* SECTION C: COMMUNICATION & SCADA ARCHITECTURE */}
      <div className="bg-white p-5 rounded-xl border border-[#D9E1EA] shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D9E1EA] pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider font-mono">
                COMMUNICATION &amp; SCADA ARCHITECTURE
              </h3>
              <p className="text-[11px] text-[#64748B]">
                {isPhysicalOnline
                  ? "Authoritative Industrial Telemetry Pipeline (ESP32-S3 \u2192 HiveMQ \u2192 Node-RED \u2192 FastAPI \u2192 PostgreSQL \u2192 SCADA)"
                  : isSimOnline
                  ? "Authoritative Simulated Telemetry Pipeline (Hardware Simulator \u2192 HiveMQ \u2192 Node-RED \u2192 FastAPI \u2192 PostgreSQL \u2192 SCADA)"
                  : "Awaiting Device Ingestion (ESP32 Standby \u2192 HiveMQ \u2192 Node-RED \u2192 FastAPI \u2192 PostgreSQL \u2192 SCADA)"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="text-[#64748B]">PIPELINE:</span>
            <span
              className={`px-2.5 py-1 rounded font-bold border ${
                isPhysicalOnline
                  ? "bg-green-50 text-green-700 border-green-200"
                  : isSimOnline
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {isPhysicalOnline
                ? "\u25cf LIVE PHYSICAL ESP32"
                : isSimOnline
                ? "\u25cf SIMULATOR TELEMETRY"
                : "\u25cb HARDWARE DISCONNECTED (IDLE)"}
            </span>
          </div>
        </div>

        {/* Horizontal Node Flow on Desktop */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 overflow-x-auto py-2">
          {commNodes.map((node, idx) => {
            const Icon = node.icon;
            return (
              <React.Fragment key={node.name}>
                <div
                  onClick={() =>
                    onInspectNode({
                      type: node.type,
                      title: node.title,
                      subtitle: node.subtitle,
                    })
                  }
                  className="flex-1 min-w-[170px] p-3 rounded-lg bg-[#F8FAFC] border border-[#D9E1EA] hover:border-blue-400 hover:bg-white cursor-pointer transition-all shadow-2xs group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-4 h-4 ${node.iconColor}`} />
                    <span className={`w-2 h-2 rounded-full ${node.statusDot}`} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#172033] group-hover:text-blue-600 transition-colors font-mono">
                      {node.name}
                    </div>
                    <div className="text-[10px] text-[#64748B]">{node.model}</div>
                    <div className="text-[9px] text-[#94A3B8] mt-0.5">{node.role}</div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[9px] font-mono">
                    <span className="text-[#64748B]">STATUS:</span>
                    <span className="font-bold text-[#172033]">{node.status}</span>
                  </div>
                </div>

                {/* Arrow Connector between nodes */}
                {idx < commNodes.length - 1 && (
                  <div className="hidden lg:flex flex-col items-center justify-center px-1 text-center select-none">
                    <span className="text-[8px] text-[#64748B] font-mono font-bold">{node.protocol}</span>
                    <div className="w-6 h-0.5 bg-[#CBD5E1] my-1" />
                    <span className="text-[8px] text-[#94A3B8]">&rarr;</span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* SECTION D: SYSTEM STATUS & DIAGNOSTIC MATRIX */}
      <div className="bg-white p-5 rounded-xl border border-[#D9E1EA] shadow-xs">
        <div className="flex items-center justify-between border-b border-[#D9E1EA] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wider font-mono">
              SYSTEM STATUS &amp; SERVICE HEALTH MATRIX
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[#64748B]">
            AUTHORITATIVE LIVE SUBSYSTEM STATES
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
          {/* 1. ESP32-S3 Physical */}
          <div className="p-3 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#64748B]">Physical ESP32</span>
              <span className={`w-2 h-2 rounded-full ${isPhysicalOnline ? "bg-green-600" : "bg-slate-400"}`} />
            </div>
            <div className={`text-xs font-bold px-2 py-0.5 rounded border inline-block ${isPhysicalOnline ? "text-green-700 bg-green-50 border-green-200" : "text-slate-600 bg-slate-100 border-slate-200"}`}>
              {isPhysicalOnline ? "ONLINE" : "NOT CONNECTED"}
            </div>
            <div className="text-[9px] text-[#64748B]">
              {isPhysicalOnline && authoritative.physicalEsp32.packetAgeSec != null
                ? `Age: ${authoritative.physicalEsp32.packetAgeSec.toFixed(1)}s`
                : "Hardware not connected"}
            </div>
          </div>

          {/* 2. MQTT HiveMQ */}
          <div className="p-3 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#64748B]">MQTT HiveMQ</span>
              <span className={`w-2 h-2 rounded-full ${mqttState === "CONNECTED" ? "bg-green-600" : "bg-red-500"}`} />
            </div>
            <div
              className={`text-xs font-bold px-2 py-0.5 rounded border inline-block ${
                mqttState === "CONNECTED"
                  ? "text-green-700 bg-green-50 border-green-200"
                  : "text-red-700 bg-red-50 border-red-200"
              }`}
            >
              {mqttState}
            </div>
            <div className="text-[9px] text-[#64748B]">TLS 8883 Cloud</div>
          </div>

          {/* 3. Node-RED */}
          <div className="p-3 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#64748B]">Node-RED</span>
              <span className={`w-2 h-2 rounded-full ${nodeRedState === "ONLINE" ? "bg-green-600" : "bg-slate-400"}`} />
            </div>
            <div
              className={`text-xs font-bold px-2 py-0.5 rounded border inline-block ${
                nodeRedState === "ONLINE"
                  ? "text-green-700 bg-green-50 border-green-200"
                  : "text-slate-600 bg-slate-100 border-slate-200"
              }`}
            >
              {nodeRedState}
            </div>
            <div className="text-[9px] text-[#64748B]">Flow Engine</div>
          </div>

          {/* 4. FastAPI */}
          <div className="p-3 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#64748B]">FastAPI</span>
              <span className={`w-2 h-2 rounded-full ${fastApiState === "ONLINE" ? "bg-green-600" : "bg-red-500"}`} />
            </div>
            <div
              className={`text-xs font-bold px-2 py-0.5 rounded border inline-block ${
                fastApiState === "ONLINE"
                  ? "text-green-700 bg-green-50 border-green-200"
                  : "text-red-700 bg-red-50 border-red-200"
              }`}
            >
              {fastApiState}
            </div>
            <div className="text-[9px] text-[#64748B]">REST &amp; Protection Core</div>
          </div>

          {/* 5. PostgreSQL */}
          <div className="p-3 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#64748B]">PostgreSQL</span>
              <span className={`w-2 h-2 rounded-full ${postgresState === "ONLINE" ? "bg-green-600" : "bg-red-500"}`} />
            </div>
            <div
              className={`text-xs font-bold px-2 py-0.5 rounded border inline-block ${
                postgresState === "ONLINE"
                  ? "text-green-700 bg-green-50 border-green-200"
                  : "text-red-700 bg-red-50 border-red-200"
              }`}
            >
              {postgresState}
            </div>
            <div className="text-[9px] text-[#64748B]">Audit Ledger</div>
          </div>

          {/* 6. WebSocket */}
          <div className="p-3 rounded-lg border border-[#D9E1EA] bg-[#F8FAFC] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#64748B]">WebSocket</span>
              <span className={`w-2 h-2 rounded-full ${wsState === "CONNECTED" ? "bg-green-600" : "bg-slate-400"}`} />
            </div>
            <div
              className={`text-xs font-bold px-2 py-0.5 rounded border inline-block ${
                wsState === "CONNECTED"
                  ? "text-green-700 bg-green-50 border-green-200"
                  : "text-slate-600 bg-slate-100 border-slate-200"
              }`}
            >
              {wsState}
            </div>
            <div className="text-[9px] text-[#64748B]">Live Telemetry HMI</div>
          </div>
        </div>
      </div>
    </div>
  );
}
