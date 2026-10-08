"use client";

import React from "react";
import { Cpu, Radio, GitMerge, Server, Database, Activity, Monitor } from "lucide-react";
import { InspectedNode } from "./ComponentInspectorDrawer";

interface DataPipelineDiagramProps {
  hasLiveData: boolean;
  mqttConnected: boolean;
  packetAgeSec?: number | null;
  onSelectNode: (node: InspectedNode) => void;
}

export function DataPipelineDiagram({
  hasLiveData,
  mqttConnected,
  packetAgeSec,
  onSelectNode,
}: DataPipelineDiagramProps) {
  const isTransmitting = hasLiveData;

  return (
    <div className="bg-white p-4 border border-[#E2E8F0] rounded-xl shadow-xs font-mono text-xs text-[#172033]">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <span className="font-bold text-[#172033] uppercase text-[11px] tracking-wider">
            EDGE-TO-CLOUD DATA & CONTROL ARCHITECTURE
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-[#64748B]">TELEMETRY FLOW:</span>
          <span
            className={`px-2 py-0.5 rounded font-bold ${
              isTransmitting
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            {isTransmitting ? "● ACTIVE PACKET STREAM" : "○ DISCONNECTED / IDLE"}
          </span>
        </div>
      </div>

      {/* Pipeline Nodes Row */}
      <div className="flex flex-wrap md:flex-nowrap items-center justify-between gap-2 overflow-x-auto py-2">
        {/* 1. ESP32-S3 Node */}
        <div
          onClick={() =>
            onSelectNode({
              type: "ESP32",
              title: "ESP32-S3 N16R8 Edge Node",
              subtitle: "FreeRTOS Dual-Core Sensing & Protection Engine",
            })
          }
          className="flex-1 min-w-[130px] p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-blue-400 hover:bg-white cursor-pointer transition-all shadow-2xs group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <Cpu className="w-4 h-4 text-blue-600" />
            <span
              className={`w-2 h-2 rounded-full ${
                hasLiveData ? "bg-green-600" : "bg-slate-400"
              }`}
            />
          </div>
          <div className="text-[11px] font-bold text-[#172033] group-hover:text-blue-600 transition-colors">
            ESP32-S3 N16R8
          </div>
          <div className="text-[9px] text-[#64748B]">Edge Controller</div>
          <div className="mt-1 text-[8px] text-[#94A3B8] tabular-nums">
            {packetAgeSec != null ? `Age: ${packetAgeSec.toFixed(1)}s` : "Age: ---"}
          </div>
        </div>

        {/* Dynamic Data Connector 1 */}
        <div className="flex flex-col items-center justify-center px-1">
          <div className="text-[8px] text-[#64748B] font-mono">TLS 8883</div>
          <div className="relative w-8 h-0.5 bg-[#E2E8F0] my-1">
            {isTransmitting && (
              <span className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-600" />
            )}
          </div>
          <span className="text-[7px] text-[#94A3B8]">&rarr;</span>
        </div>

        {/* 2. HiveMQ Cloud MQTT Broker */}
        <div
          onClick={() =>
            onSelectNode({
              type: "HIVEMQ",
              title: "HiveMQ Cloud MQTT Broker",
              subtitle: "TLS Encrypted MQTT 3.1.1 Message Exchange",
            })
          }
          className="flex-1 min-w-[130px] p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-blue-400 hover:bg-white cursor-pointer transition-all shadow-2xs group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <Radio className="w-4 h-4 text-amber-600" />
            <span
              className={`w-2 h-2 rounded-full ${
                mqttConnected ? "bg-green-600" : "bg-slate-400"
              }`}
            />
          </div>
          <div className="text-[11px] font-bold text-[#172033] group-hover:text-blue-600 transition-colors">
            HiveMQ Cloud
          </div>
          <div className="text-[9px] text-[#64748B]">MQTT TLS Broker</div>
          <div className="mt-1 text-[8px] text-[#94A3B8]">
            {mqttConnected ? "CONNECTED" : "DISCONNECTED"}
          </div>
        </div>

        {/* Dynamic Data Connector 2 */}
        <div className="flex flex-col items-center justify-center px-1">
          <div className="text-[8px] text-[#64748B] font-mono">MQTT Sub</div>
          <div className="relative w-8 h-0.5 bg-[#E2E8F0] my-1">
            {isTransmitting && (
              <span className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-600" />
            )}
          </div>
          <span className="text-[7px] text-[#94A3B8]">&rarr;</span>
        </div>

        {/* 3. Node-RED Ingestion */}
        <div
          onClick={() =>
            onSelectNode({
              type: "NODERED",
              title: "Node-RED Industrial Gateway",
              subtitle: "Flow Orchestration & Telemetry Normalization",
            })
          }
          className="flex-1 min-w-[130px] p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-blue-400 hover:bg-white cursor-pointer transition-all shadow-2xs group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <GitMerge className="w-4 h-4 text-red-600" />
            <span className="w-2 h-2 rounded-full bg-slate-400" />
          </div>
          <div className="text-[11px] font-bold text-[#172033] group-hover:text-blue-600 transition-colors">
            Node-RED Flow
          </div>
          <div className="text-[9px] text-[#64748B]">Stream Parser</div>
          <div className="mt-1 text-[8px] text-[#94A3B8]">Normalizing</div>
        </div>

        {/* Dynamic Data Connector 3 */}
        <div className="flex flex-col items-center justify-center px-1">
          <div className="text-[8px] text-[#64748B] font-mono">HTTP/JSON</div>
          <div className="relative w-8 h-0.5 bg-[#E2E8F0] my-1">
            {isTransmitting && (
              <span className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-600" />
            )}
          </div>
          <span className="text-[7px] text-[#94A3B8]">&rarr;</span>
        </div>

        {/* 4. FastAPI Backend */}
        <div
          onClick={() =>
            onSelectNode({
              type: "FASTAPI",
              title: "FastAPI Industrial Core",
              subtitle: "REST API, Biometric RBAC & Protection Engine",
            })
          }
          className="flex-1 min-w-[130px] p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-blue-400 hover:bg-white cursor-pointer transition-all shadow-2xs group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <Server className="w-4 h-4 text-blue-600" />
            <span className="w-2 h-2 rounded-full bg-green-600" />
          </div>
          <div className="text-[11px] font-bold text-[#172033] group-hover:text-blue-600 transition-colors">
            FastAPI Backend
          </div>
          <div className="text-[9px] text-[#64748B]">RBAC & API Core</div>
          <div className="mt-1 text-[8px] text-[#94A3B8]">Port 8000</div>
        </div>

        {/* Dynamic Data Connector 4 */}
        <div className="flex flex-col items-center justify-center px-1">
          <div className="text-[8px] text-[#64748B] font-mono">WS / SQL</div>
          <div className="relative w-8 h-0.5 bg-[#E2E8F0] my-1">
            {isTransmitting && (
              <span className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-600" />
            )}
          </div>
          <span className="text-[7px] text-[#94A3B8]">&rarr;</span>
        </div>

        {/* 5. PostgreSQL + WebSocket & SCADA */}
        <div
          onClick={() =>
            onSelectNode({
              type: "WEBSOCKET",
              title: "PostgreSQL 16 & WebSocket Stream",
              subtitle: "Time-Series Telemetry & Low-Latency UI Updates",
            })
          }
          className="flex-1 min-w-[130px] p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-blue-400 hover:bg-white cursor-pointer transition-all shadow-2xs group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1">
              <Database className="w-4 h-4 text-blue-600" />
              <Monitor className="w-4 h-4 text-blue-600" />
            </div>
            <span className="w-2 h-2 rounded-full bg-green-600" />
          </div>
          <div className="text-[11px] font-bold text-[#172033] group-hover:text-blue-600 transition-colors">
            PostgreSQL & WS
          </div>
          <div className="text-[9px] text-[#64748B]">Database & SCADA</div>
          <div className="mt-1 text-[8px] text-[#94A3B8]">Live Client</div>
        </div>
      </div>
    </div>
  );
}
