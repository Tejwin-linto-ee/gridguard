"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FaceResetModal } from "@/components/faults/FaceResetModal";
import { api } from "@/lib/api";
import {
  Zap, Activity, Gauge, Clock, ShieldAlert, AlertOctagon, ArrowLeft,
  Power, CheckCircle2, ChevronRight, Lock
} from "lucide-react";

export default function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const channelId = parseInt(resolvedParams.id, 10) || 1;

  const [channelData, setChannelData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [detail, hist] = await Promise.all([
        api.getChannelDetail(channelId),
        api.getChannelHistory(channelId),
      ]);
      setChannelData(detail);
      setHistory(hist);
    } catch {
      setChannelData({
        channel: channelId,
        voltage: null,
        current: null,
        apparent_power: null,
        main_relay: null,
        aux_relay: null,
        relay_feedback_available: false,
        load_active: null,
        status: "WAITING FOR LIVE MQTT TELEMETRY",
        fault: null,
        risk_index: null,
        operating_hours: null,
        trip_count: 0,
        priority_level: "IMPORTANT",
        data_source: "DEMO DATA",
      });
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [channelId]);

  if (loading || !channelData) {
    return (
      <AppShell title={`CHANNEL ${channelId} DETAIL`}>
        <div className="p-8 text-center text-[#64748B] font-mono">Loading channel telemetry...</div>
      </AppShell>
    );
  }

  const isTripped = channelData.status === "FAULT LATCHED" || channelData.status === "TRIPPED";

  return (
    <AppShell title={`CHANNEL ${channelId} SPECIFICATION & TELEMETRY`} dataSource={channelData.data_source} onRefresh={loadData}>
      {/* Back to Overview */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono font-medium text-blue-600 hover:text-blue-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to System Overview</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B] font-mono font-medium">Switch Channel:</span>
          {[1, 2, 3, 4].map((ch) => (
            <Link
              key={ch}
              href={`/channels/${ch}`}
              className={`px-3 py-1 rounded-md text-xs font-mono font-bold transition-all shadow-xs ${
                ch === channelId
                  ? "bg-blue-600 text-white"
                  : "bg-white text-[#64748B] border border-[#CBD5E1] hover:text-[#172033] hover:bg-slate-50"
              }`}
            >
              CH {ch}
            </Link>
          ))}
        </div>
      </div>

      {/* Latched Alert Banner */}
      {isTripped && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-4 font-mono shadow-xs">
          <div className="flex items-center gap-3">
            <AlertOctagon className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <div className="text-sm font-bold text-red-900 uppercase">
                CHANNEL {channelId} PROTECTION TRIP LATCHED
              </div>
              <div className="text-xs text-red-700 mt-0.5">
                Measured value exceeded protection threshold. Both Main and Aux relays are locked OPEN.
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsResetOpen(true)}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold tracking-wider transition-colors cursor-pointer shadow-xs"
          >
            AUTHORIZE FACE RESET
          </button>
        </div>
      )}

      {/* Channel Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-[#172033] font-mono tracking-wide">
                CHANNEL {channelId}
              </h2>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                PROTOTYPE LOAD CHANNEL
              </span>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
                PRIORITY: {channelData.priority_level || "NORMAL"}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1.5">
              Bulb {channelId} emulating transformer load channel. ZMPT101B voltage sensor & ACS712 current sensor.
            </p>
          </div>
          <StatusBadge status={channelData.status} size="lg" />
        </div>
      </div>

      {/* 3 Core Electrical Measurement Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between text-[#64748B] text-xs font-mono uppercase font-semibold">
            <span>VOLTAGE (ZMPT101B)</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-[#172033] font-mono mt-2">
            {channelData.voltage != null ? channelData.voltage.toFixed(1) : "---"} <span className="text-sm text-blue-600 font-semibold">V</span>
          </div>
          <div className="text-[11px] text-[#94A3B8] font-mono mt-2">Nominal: 220.0 - 240.0 V</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between text-[#64748B] text-xs font-mono uppercase font-semibold">
            <span>CURRENT (ACS712)</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-bold font-mono mt-2 text-[#172033]">
            {channelData.current != null ? channelData.current.toFixed(2) : "---"} <span className="text-sm text-blue-600 font-semibold">A</span>
          </div>
          <div className="text-[11px] text-[#94A3B8] font-mono mt-2">Trip Threshold: &gt; 2.50 A</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center justify-between text-[#64748B] text-xs font-mono uppercase font-semibold">
            <span>APPARENT POWER (V × I)</span>
            <Gauge className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-3xl font-bold text-[#172033] font-mono mt-2">
            {channelData.apparent_power != null ? channelData.apparent_power.toFixed(1) : "---"} <span className="text-sm text-blue-600 font-semibold">VA</span>
          </div>
          <div className="text-[11px] text-[#94A3B8] font-mono mt-2">Designation: Apparent Power (VA)</div>
        </div>
      </div>

      {/* Hardware Relay State & Feedback Clarification */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider border-b border-[#E2E8F0] pb-2">
            DUAL RELAY CONFIGURATION
          </h3>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono">
            <span className="text-[#475569] font-medium">MAIN RELAY {channelId}</span>
            <span className={channelData.main_relay ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>
              {channelData.main_relay ? "COMMANDED CLOSED (ON)" : "COMMANDED OPEN (OFF)"}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono">
            <span className="text-[#475569] font-medium">AUXILIARY RELAY {channelId}</span>
            <span className={channelData.aux_relay ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>
              {channelData.aux_relay ? "COMMANDED CLOSED (ON)" : "COMMANDED OPEN (OFF)"}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-[#475569]">
            <strong className="text-[#172033]">Hardware Feedback Architecture:</strong> Commanded state reflects ESP32 relay GPIO driving signal. Auxiliary physical feedback contacts are not installed on standard 5V relay carrier boards; system explicitly denotes: <span className="text-amber-700 font-mono font-bold">FEEDBACK NOT AVAILABLE</span>.
          </div>
        </div>

        {/* Operating Duty & Channel Risk Analysis */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider border-b border-[#E2E8F0] pb-2">
            OPERATING DUTY & PROJECT-DEFINED RISK INDEX
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
              <span className="text-[10px] text-[#64748B] font-semibold">OPERATING HOURS</span>
              <div className="text-lg font-bold text-[#172033] mt-1">{channelData.operating_hours != null ? `${channelData.operating_hours.toFixed(1)} h` : "0.0 h"}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
              <span className="text-[10px] text-[#64748B] font-semibold">HISTORIC TRIPS</span>
              <div className="text-lg font-bold text-[#172033] mt-1">{channelData.trip_count || 0}</div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
            <div className="flex items-center justify-between text-xs font-mono mb-2">
              <span className="text-[#475569] font-medium">Channel Risk Index:</span>
              <span className="font-bold text-blue-700 text-sm">
                {channelData.risk_index != null ? `${channelData.risk_index.toFixed(0)} / 100` : "RISK UNAVAILABLE — INSUFFICIENT LIVE DATA"}
              </span>
            </div>
            <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${channelData.risk_index != null && channelData.risk_index > 60 ? "bg-red-600" : channelData.risk_index != null && channelData.risk_index > 30 ? "bg-amber-500" : "bg-emerald-600"}`}
                style={{ width: `${channelData.risk_index != null ? channelData.risk_index : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-[#64748B] mt-2 font-mono">
              *Project-defined Channel Risk Index evaluated from current stress, trip history, and loading trends. Not a certified transformer health percentage.
            </p>
          </div>
        </div>
      </div>

      {/* Telemetry Wave History Table */}
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
        <h3 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider mb-4">
          CHANNEL {channelId} RECENT TELEMETRY SAMPLES
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Voltage (V)</th>
                <th className="py-2.5 px-3">Current (A)</th>
                <th className="py-2.5 px-3">Apparent Power (VA)</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {history.slice(0, 10).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 text-[#64748B]">
                    {new Date(row.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5 px-3 text-[#172033] font-medium">{row.voltage.toFixed(1)}</td>
                  <td className="py-2.5 px-3 text-[#172033] font-medium">{row.current.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-blue-700 font-medium">{row.apparent_power.toFixed(1)}</td>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={row.status} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Face Auth Reset Modal */}
      <FaceResetModal
        channel={channelId}
        faultType={channelData.fault || "OVERCURRENT"}
        isOpen={isResetOpen}
        onClose={() => setIsResetOpen(false)}
        onSuccess={() => {
          setIsResetOpen(false);
          loadData();
        }}
      />
    </AppShell>
  );
}
