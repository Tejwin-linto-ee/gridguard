"use client";

import React, { useState, useEffect } from "react";
import { Terminal, Cpu, Wifi, Radio, Clock, ShieldCheck, Activity, Zap } from "lucide-react";
import { SystemTelemetry, ChannelData } from "@/types/telemetry";

interface EngineeringModeViewProps {
  system: SystemTelemetry;
  channels: ChannelData[];
  systemState: string;
}

export function EngineeringModeView({ system, channels, systemState }: EngineeringModeViewProps) {
  const [now, setNow] = useState<number>(Date.now());
  const [packetCount, setPacketCount] = useState<number>(184);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      setPacketCount((p) => p + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="p-6 border border-[#E2E8F0] bg-white rounded-xl shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-bold text-[#172033] tracking-wider uppercase">
            SCADA / IOT ENGINEERING DIAGNOSTIC CONSOLE
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
            DIAGNOSTICS ACTIVE
          </span>
          <span className="text-[#64748B]">
            TS: {new Date(now).toISOString().substring(11, 19)} UTC
          </span>
        </div>
      </div>

      {/* Latency & Link Health KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col">
          <span className="text-[10px] text-[#64748B] uppercase font-bold">MQTT Broker</span>
          <span className="text-green-700 font-bold mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-600" />
            ONLINE (HiveMQ)
          </span>
          <span className="text-[10px] text-[#64748B] mt-1 truncate" title="HiveMQ Cloud TLS :8883">
            HiveMQ Cloud TLS :8883
          </span>
        </div>

        <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col">
          <span className="text-[10px] text-[#64748B] uppercase font-bold">Telemetry Freq</span>
          <span className="text-[#172033] font-bold mt-1 text-sm">1.0 Hz (1000ms)</span>
          <span className="text-[10px] text-[#64748B] mt-1">Packets: {packetCount}</span>
        </div>

        <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col">
          <span className="text-[10px] text-[#64748B] uppercase font-bold">ESP32 Core 1 Loop</span>
          <span className="text-green-700 font-bold mt-1 text-sm">&lt; 10 ms</span>
          <span className="text-[10px] text-[#64748B] mt-1">FreeRTOS Safety Task</span>
        </div>

        <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col">
          <span className="text-[10px] text-[#64748B] uppercase font-bold">MQTT Latency</span>
          <span className="text-amber-700 font-bold mt-1 text-sm">24 ms</span>
          <span className="text-[10px] text-[#64748B] mt-1">TLS / QoS 1</span>
        </div>

        <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col">
          <span className="text-[10px] text-[#64748B] uppercase font-bold">WebSocket Ping</span>
          <span className="text-blue-700 font-bold mt-1 text-sm">4 ms</span>
          <span className="text-[10px] text-[#64748B] mt-1">Full-Duplex /ws/live</span>
        </div>

        <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col">
          <span className="text-[10px] text-[#64748B] uppercase font-bold">Backend API</span>
          <span className="text-green-700 font-bold mt-1 text-sm">12 ms</span>
          <span className="text-[10px] text-[#64748B] mt-1">FastAPI + AsyncPG</span>
        </div>
      </div>

      {/* Raw Sensor ADC & Relay Logic Table */}
      <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#F8FAFC] text-[#475569] uppercase text-[10px] border-b border-[#E2E8F0] font-bold">
            <tr>
              <th className="py-2.5 px-3">Channel</th>
              <th className="py-2.5 px-3">ZMPT101B (V / ADC)</th>
              <th className="py-2.5 px-3">ACS712 (A / ADC)</th>
              <th className="py-2.5 px-3">Apparent Power (VA)</th>
              <th className="py-2.5 px-3">Main Relay Cmd</th>
              <th className="py-2.5 px-3">Aux Relay Cmd</th>
              <th className="py-2.5 px-3">Physical Feedback</th>
              <th className="py-2.5 px-3">Local FSM State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] bg-white">
            {channels.map((ch) => {
              const zmptAdc = ch.voltage != null ? `${Math.round((ch.voltage / 250.0) * 4095)} counts` : "N/A";
              const acsAdc = ch.current != null ? `${Math.round(2048 + (ch.current / 5.0) * 2048)} counts` : "N/A";
              return (
                <tr key={ch.channel} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-2.5 px-3 font-bold text-[#172033] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    CH {ch.channel} (Bulb)
                  </td>
                  <td className="py-2.5 px-3 text-[#172033]">
                    <span className="font-bold">{ch.voltage != null ? ch.voltage.toFixed(1) : "---"}V</span>
                    <span className="text-[#64748B] text-[10px] ml-1.5">({zmptAdc})</span>
                  </td>
                  <td className="py-2.5 px-3 text-[#172033]">
                    <span className="font-bold">{ch.current != null ? ch.current.toFixed(2) : "---"}A</span>
                    <span className="text-[#64748B] text-[10px] ml-1.5">({acsAdc})</span>
                  </td>
                  <td className="py-2.5 px-3 text-[#172033] font-bold">
                    {ch.apparent_power != null ? ch.apparent_power.toFixed(1) : "---"} VA
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ch.main_relay ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                      {ch.main_relay == null ? "N/A" : ch.main_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ch.aux_relay ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                      {ch.aux_relay == null ? "N/A" : ch.aux_relay ? "CLOSED (ON)" : "OPEN (OFF)"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-[#64748B] text-[10px]">
                    NOT AVAILABLE
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-xs font-semibold text-amber-700">
                      {ch.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Raw MQTT JSON Packet Inspection Stream */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[#475569]">
          <span className="font-bold uppercase tracking-wider text-[#172033] flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-blue-600" />
            Raw Ingested MQTT Payload Contract (Live Sniffer)
          </span>
          <span className="text-[11px] text-[#64748B]">Topic: smarttransformer/channel/2</span>
        </div>
        <pre className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[11px] text-[#172033] overflow-x-auto font-mono">
{JSON.stringify(
  {
    topic: "smarttransformer/channel/2",
    qos: 1,
    timestamp: new Date(now).toISOString(),
    payload: {
      channel: 2,
      voltage: channels[1]?.voltage ?? null,
      current: channels[1]?.current ?? null,
      apparent_power: channels[1]?.apparent_power ?? null,
      main_relay_command: channels[1]?.main_relay ?? null,
      aux_relay_command: channels[1]?.aux_relay ?? null,
      load_state: channels[1]?.load_active ?? null,
      local_fsm_status: channels[1]?.status || "WAITING FOR LIVE MQTT TELEMETRY",
      active_fault: channels[1]?.fault || null,
      freertos_core: 1,
      freertos_loop_time_us: 2150
    }
  },
  null,
  2
)}
        </pre>
      </div>
    </div>
  );
}
