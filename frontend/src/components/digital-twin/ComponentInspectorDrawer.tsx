"use client";

import React from "react";
import { X, Activity, Cpu, ShieldCheck, Zap, Lightbulb, Server, Radio, Database } from "lucide-react";
import { ChannelData, SystemTelemetry } from "@/types/telemetry";
import { useSystemHealth } from "@/context/SystemHealthContext";

export type InspectableNodeType =
  | "PZEM"
  | "ESP32"
  | "HIVEMQ"
  | "NODERED"
  | "FASTAPI"
  | "WEBSOCKET"
  | "ZMPT101B"
  | "MAIN_RELAY"
  | "AUX_RELAY"
  | "ACS712"
  | "PROTOTYPE_LOAD"
  | "AC_MAINS"
  | "DISTRIBUTION_BUS"
  | "NEUTRAL_BUS";

export interface InspectedNode {
  type: InspectableNodeType;
  channelId?: number;
  title: string;
  subtitle: string;
}

interface ComponentInspectorDrawerProps {
  node: InspectedNode | null;
  onClose: () => void;
  system: SystemTelemetry;
  channels: ChannelData[];
  packetAgeSec?: number | null;
  hasLiveData?: boolean;
}

export function ComponentInspectorDrawer({
  node,
  onClose,
  system,
  channels,
  packetAgeSec,
  hasLiveData,
}: ComponentInspectorDrawerProps) {
  const health = useSystemHealth();

  if (!node) return null;

  const ch = node.channelId ? channels.find((c) => c.channel === node.channelId) : null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white border-l border-[#E2E8F0] shadow-xl z-50 p-5 flex flex-col justify-between font-mono text-xs text-[#172033] overflow-y-auto">
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            {node.type === "PZEM" && <ShieldCheck className="w-5 h-5 text-blue-600" />}
            {node.type === "ESP32" && <Cpu className="w-5 h-5 text-blue-600" />}
            {node.type === "HIVEMQ" && <Radio className="w-5 h-5 text-amber-600" />}
            {node.type === "FASTAPI" && <Server className="w-5 h-5 text-blue-600" />}
            {node.type === "PROTOTYPE_LOAD" && <Lightbulb className="w-5 h-5 text-amber-600" />}
            {(node.type === "ZMPT101B" || node.type === "ACS712") && <Activity className="w-5 h-5 text-blue-600" />}
            {(node.type === "MAIN_RELAY" || node.type === "AUX_RELAY") && <Zap className="w-5 h-5 text-blue-600" />}
            <div>
              <div className="text-[#172033] font-bold text-sm tracking-wide">{node.title}</div>
              <div className="text-[10px] text-[#64748B]">{node.subtitle}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-100 text-[#64748B] hover:text-[#172033] transition-colors"
            aria-label="Close inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Provenance & Status Bar */}
        <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] mb-4 flex items-center justify-between">
          <span className="text-[11px] text-[#64748B]">DATA PROVENANCE</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              health.dataProvenance === "LIVE_ESP32_MQTT" || health.dataProvenance === "SIMULATOR_MQTT"
                ? "bg-green-50 text-green-700 border border-green-200"
                : health.dataProvenance === "STALE_DEVICE_DATA"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            {health.dataProvenanceDisplay}
          </span>
        </div>

        {/* Telemetry Details based on component */}
        {node.type === "ZMPT101B" && ch && (
          <div className="space-y-3">
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] mb-1">CHANNEL VOLTAGE SENSOR</span>
              <div className="text-2xl font-bold text-[#172033] tabular-nums">
                {ch.voltage != null ? `${ch.voltage.toFixed(1)} V` : "--- V"}
              </div>
              <span className="text-[10px] text-[#94A3B8]">
                {ch.voltage != null ? "Signal Status: VALID" : "Signal Status: NO LIVE DATA"}
              </span>
            </div>
            <div className="space-y-2 text-[11px] text-[#172033]">
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Physical Sensor:</span>
                <span>ZMPT101B Voltage Sensor Module</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Connection:</span>
                <span>Parallel Across CH{ch.channel} Live & Neutral</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Sampling Rate:</span>
                <span>1000 Hz Peak Detection</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Protection Range:</span>
                <span>180 V &ndash; 260 V RMS</span>
              </div>
            </div>
          </div>
        )}

        {node.type === "ACS712" && ch && (
          <div className="space-y-3">
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] mb-1">CHANNEL CURRENT SENSOR</span>
              <div className="text-2xl font-bold text-[#172033] tabular-nums">
                {ch.current != null ? `${ch.current.toFixed(2)} A` : "--- A"}
              </div>
              <span className="text-[10px] text-[#94A3B8]">
                {ch.current != null ? "Signal Status: VALID" : "Signal Status: NO LIVE DATA"}
              </span>
            </div>
            <div className="space-y-2 text-[11px] text-[#172033]">
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Physical Sensor:</span>
                <span>ACS712 Hall-Effect IC (5A / 20A / 30A)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Connection:</span>
                <span>In-Series with Channel Load Conductor</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Trip Response Time:</span>
                <span>&lt; 10 ms (Edge Hardware FreeRTOS)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Overcurrent Limit:</span>
                <span>5.00 A Fast Trip</span>
              </div>
            </div>
          </div>
        )}

        {(node.type === "MAIN_RELAY" || node.type === "AUX_RELAY") && ch && (
          <div className="space-y-3">
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] mb-1">
                {node.type === "MAIN_RELAY" ? "MAIN RELAY" : "AUXILIARY RELAY"}
              </span>
              <div
                className={`text-xl font-bold tabular-nums ${
                  (node.type === "MAIN_RELAY" ? ch.main_relay : ch.aux_relay)
                    ? "text-green-700"
                    : "text-red-700"
                }`}
              >
                COMMANDED: {(node.type === "MAIN_RELAY" ? ch.main_relay : ch.aux_relay) == null ? "UNKNOWN" : (node.type === "MAIN_RELAY" ? ch.main_relay : ch.aux_relay) ? "CLOSED (ON)" : "OPEN (OFF)"}
              </div>
              <div className="mt-2 text-[10px] text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200">
                FEEDBACK: NOT AVAILABLE (Commanded State Only)
              </div>
            </div>
            <div className="space-y-2 text-[11px] text-[#172033]">
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Hardware Architecture:</span>
                <span>Dual Relay Topology (Main + Aux)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Safety Policy:</span>
                <span>Fail Closed / De-Energized Safe</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Restoration Sequence:</span>
                <span>Main (0ms) &rarr; Aux (+250ms)</span>
              </div>
            </div>
          </div>
        )}

        {node.type === "PROTOTYPE_LOAD" && ch && (
          <div className="space-y-3">
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] mb-1">PROTOTYPE LOAD (BULB LOAD)</span>
              <div
                className={`text-lg font-bold ${
                  ch.load_active && ch.main_relay && ch.aux_relay ? "text-amber-700" : "text-slate-500"
                }`}
              >
                COMMANDED LOAD STATE: {ch.load_active && ch.main_relay && ch.aux_relay ? "● ENERGIZED" : "○ DE-ENERGIZED"}
              </div>
              <div className="text-[10px] text-[#64748B] mt-1">
                Note: Prototype load emulates load channel circuit.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-white p-2 rounded-lg border border-[#E2E8F0]">
                <span className="text-[9px] text-[#64748B] block">VOLTAGE</span>
                <span className="text-xs font-bold text-[#172033] tabular-nums">
                  {ch.voltage != null ? `${ch.voltage.toFixed(1)} V` : "--- V"}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-[#E2E8F0]">
                <span className="text-[9px] text-[#64748B] block">CURRENT</span>
                <span className="text-xs font-bold text-[#172033] tabular-nums">
                  {ch.current != null ? `${ch.current.toFixed(2)} A` : "--- A"}
                </span>
              </div>
            </div>

            <div className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
              <span className="text-[10px] text-[#64748B] block mb-0.5">APPARENT POWER (S = V &times; I)</span>
              <div className="text-base font-bold text-[#172033] tabular-nums">
                {ch.voltage != null && ch.current != null
                  ? `${(ch.voltage * ch.current).toFixed(1)} VA`
                  : "--- NO LIVE DATA"}
              </div>
              <span className="text-[9px] text-[#94A3B8]">Calculated strictly when both V and I are valid.</span>
            </div>
          </div>
        )}

        {node.type === "PZEM" && (
          <div className="space-y-3">
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] mb-1">SYSTEM POWER & ENERGY METER</span>
              <div className="text-2xl font-bold text-[#172033] tabular-nums">
                {system.power != null ? `${system.power.toFixed(1)} W` : "--- W"}
              </div>
              <span className="text-[10px] text-[#94A3B8]">Active Real Power (System Total)</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white p-2 rounded-lg border border-[#E2E8F0] text-center">
                <span className="text-[9px] text-[#64748B] block">VOLTAGE</span>
                <span className="text-xs font-bold text-[#172033] tabular-nums">
                  {system.voltage != null ? `${system.voltage.toFixed(1)} V` : "--- V"}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-[#E2E8F0] text-center">
                <span className="text-[9px] text-[#64748B] block">CURRENT</span>
                <span className="text-xs font-bold text-[#172033] tabular-nums">
                  {system.current != null ? `${system.current.toFixed(2)} A` : "--- A"}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-[#E2E8F0] text-center">
                <span className="text-[9px] text-[#64748B] block">FREQUENCY</span>
                <span className="text-xs font-bold text-[#172033] tabular-nums">
                  {system.frequency != null ? `${system.frequency.toFixed(2)} Hz` : "--- Hz"}
                </span>
              </div>
              <div className="bg-white p-2 rounded-lg border border-[#E2E8F0] text-center">
                <span className="text-[9px] text-[#64748B] block">POWER FACTOR</span>
                <span className="text-xs font-bold text-[#172033] tabular-nums">
                  {system.power_factor != null ? system.power_factor.toFixed(2) : "---"}
                </span>
              </div>
              <div className="col-span-2 bg-white p-2 rounded-lg border border-[#E2E8F0] text-center">
                <span className="text-[9px] text-[#64748B] block">TOTAL ENERGY</span>
                <span className="text-xs font-bold text-[#172033] tabular-nums">
                  {system.energy != null ? `${system.energy.toFixed(3)} kWh` : "--- kWh"}
                </span>
              </div>
            </div>
          </div>
        )}

        {node.type === "ESP32" && (
          <div className="space-y-3 text-[11px]">
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] mb-1">
                {health.physicalEsp32.isOnline
                  ? "SYSTEM CONTROLLER & EDGE GATEWAY"
                  : "SYSTEM CONTROLLER MODEL (SIMULATOR)"}
              </span>
              <div className="text-base font-bold text-[#172033]">
                {health.physicalEsp32.isOnline ? "ESP32-S3 N16R8" : "ESP32-S3 Hardware Simulator"}
              </div>
              <div className="text-[10px] text-[#64748B] mt-1">
                {health.physicalEsp32.isOnline
                  ? "Dual Xtensa LX7 @ 240MHz • 16MB Flash • 8MB PSRAM"
                  : "Virtual Edge Model (hardware_simulator.py • Dual-Core Emulation)"}
              </div>
            </div>

            <div className="space-y-2 text-[#172033]">
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Physical ESP32:</span>
                <span className={health.physicalEsp32.isOnline ? "text-green-700 font-bold" : "text-slate-600 font-bold"}>
                  {health.physicalEsp32.displayStatus}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Simulator Status:</span>
                <span className={health.simulator.isRunning ? "text-blue-700 font-bold" : "text-slate-500 font-bold"}>
                  {health.simulator.displayStatus}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Device Mode:</span>
                <span className="font-bold text-purple-700 uppercase">
                  {health.deviceMode}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Physical Wi-Fi:</span>
                <span className={health.physicalEsp32.isLive ? "text-green-700 font-bold" : "text-slate-500"}>
                  {health.physicalEsp32.isLive ? "● CONNECTED (2.4 GHz)" : "○ NOT CONNECTED"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">HiveMQ MQTT TLS:</span>
                <span className={health.mqtt.state === "CONNECTED" ? "text-green-700 font-bold" : "text-slate-500"}>
                  {health.mqtt.state === "CONNECTED" ? "● CONNECTED (Port 8883)" : "○ DISCONNECTED"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Telemetry Age:</span>
                <span className="tabular-nums font-bold">
                  {health.physicalEsp32.isOnline
                    ? `${health.physicalEsp32.packetAgeSec?.toFixed(1) ?? "---"}s (Physical)`
                    : health.simulator.isRunning
                    ? `${health.simulator.packetAgeSec?.toFixed(1) ?? "---"}s (Simulated)`
                    : "NO LIVE DATA"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Subscribed Topics:</span>
                <span>smarttransformer/commands</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Publish Topics:</span>
                <span>smarttransformer/telemetry</span>
              </div>
            </div>
          </div>
        )}

        {(node.type === "HIVEMQ" || node.type === "NODERED" || node.type === "FASTAPI" || node.type === "WEBSOCKET") && (
          <div className="space-y-3 text-[11px]">
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <span className="text-[#64748B] block text-[10px] mb-1">CLOUD & DATA PIPELINE NODE</span>
              <div className="text-base font-bold text-[#172033]">{node.title}</div>
              <div className="text-[10px] text-[#64748B] mt-1">{node.subtitle}</div>
            </div>

            <div className="space-y-2 text-[#172033]">
              <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                <span className="text-[#64748B]">Role in Pipeline:</span>
                <span>
                  {node.type === "HIVEMQ" && "Global MQTT TLS Broker"}
                  {node.type === "NODERED" && "MQTT Subscriber & Flow Forwarder"}
                  {node.type === "FASTAPI" && "REST & Biometric RBAC Core"}
                  {node.type === "WEBSOCKET" && "Real-Time Telemetry Stream"}
                </span>
              </div>

              {node.type === "HIVEMQ" && (
                <>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Connection:</span>
                    <span
                      className={`font-bold ${
                        health.mqtt.state === "CONNECTED"
                          ? "text-green-700"
                          : health.mqtt.state === "CONNECTING"
                          ? "text-amber-700"
                          : health.mqtt.state === "ERROR"
                          ? "text-red-700"
                          : "text-slate-600"
                      }`}
                    >
                      {health.mqtt.state === "CONNECTED"
                        ? "● CONNECTED"
                        : health.mqtt.state === "CONNECTING"
                        ? "○ CONNECTING"
                        : health.mqtt.state === "ERROR"
                        ? "⚠ ERROR"
                        : "○ DISCONNECTED"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Telemetry Flow:</span>
                    <span className="font-semibold text-slate-700">
                      {health.mqtt.state === "CONNECTED" && health.device.isLive
                        ? (health.dataProvenance === "SIMULATOR_MQTT" ? "LIVE (SIMULATOR)" : "LIVE TELEMETRY")
                        : (health.device.state === "STALE" ? "STALE" : "NO LIVE MQTT INPUT")}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Broker Port (TLS):</span>
                    <span>8883 ({health.mqtt.brokerReachable ? "Reachable" : "Standby"})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Device Session:</span>
                    <span className="font-mono text-[10px]">{health.mqtt.sessionStatus}</span>
                  </div>
                </>
              )}

              {node.type === "NODERED" && (
                <>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Service Status:</span>
                    <span className={`font-bold ${health.nodeRed.state === "ONLINE" ? "text-green-700" : "text-slate-600"}`}>
                      {health.nodeRed.state === "ONLINE" ? "● ONLINE" : "○ OFFLINE"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Pipeline Flow:</span>
                    <span className="font-semibold text-slate-700">
                      {health.nodeRed.pipelineStatus === "RECEIVING"
                        ? "● ACTIVE (RECEIVING)"
                        : health.nodeRed.state === "ONLINE"
                        ? "○ IDLE (NO RECENT INGESTION)"
                        : "○ HALTED"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Ingestion URL:</span>
                    <span className="font-mono text-[10px]">http://127.0.0.1:1880</span>
                  </div>
                </>
              )}

              {node.type === "FASTAPI" && (
                <>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Service Status:</span>
                    <span className={`font-bold ${health.fastApi.state === "ONLINE" ? "text-green-700" : "text-red-700"}`}>
                      {health.fastApi.state === "ONLINE" ? "● ONLINE" : "○ OFFLINE"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Port:</span>
                    <span>8000</span>
                  </div>
                </>
              )}

              {node.type === "WEBSOCKET" && (
                <>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Transport Status:</span>
                    <span className={`font-bold ${health.websocket.state === "ESTABLISHED" ? "text-green-700" : "text-slate-600"}`}>
                      {health.websocket.state === "ESTABLISHED" ? "● ESTABLISHED" : "○ DISCONNECTED"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
                    <span className="text-[#64748B]">Endpoint:</span>
                    <span className="font-mono text-[10px]">/ws/telemetry</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="pt-4 border-t border-[#E2E8F0] text-[10px] text-[#94A3B8] flex items-center justify-between">
        <span>GRIDGUARD SCADA DIGITAL TWIN</span>
        <span>ZERO-FABRICATED</span>
      </div>
    </div>
  );
}
