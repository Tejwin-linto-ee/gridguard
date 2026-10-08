"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import {
  ClipboardList, RefreshCw, AlertTriangle, ShieldCheck,
  CheckCircle2, Clock, Zap, UserCheck, Sliders, Cpu, Activity
} from "lucide-react";

interface TimelineEvent {
  id: string;
  timestamp: string;
  channel: number | null;
  level: string;
  event_type: string;
  source: string;
  description: string;
  measured_value: number | null;
  threshold: number | null;
  action_taken: string | null;
}

export default function EventTimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState<string>("ALL");
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const loadTimeline = async () => {
    try {
      const data = await api.getEventTimeline(100);
      if (Array.isArray(data)) {
        setEvents(data);
      }
    } catch (err) {
      console.warn("Error fetching timeline:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
    if (!autoRefresh) return;
    const interval = setInterval(loadTimeline, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const filteredEvents = events.filter((evt) => {
    if (filterChannel !== "ALL" && evt.channel?.toString() !== filterChannel) return false;
    if (filterLevel !== "ALL" && evt.level !== filterLevel) return false;
    return true;
  });

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "CRITICAL":
      case "TRIPPED":
      case "FAULT_LATCHED":
        return "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]";
      case "WARNING":
      case "HIGH_LOAD":
        return "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]";
      case "RESET":
        return "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]";
      case "NORMAL":
      default:
        return "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]";
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "CRITICAL":
      case "TRIPPED":
        return <AlertTriangle className="w-4 h-4 text-[#DC2626]" />;
      case "FAULT_LATCHED":
        return <Zap className="w-4 h-4 text-[#DC2626]" />;
      case "WARNING":
      case "HIGH_LOAD":
        return <Activity className="w-4 h-4 text-[#D97706]" />;
      case "RESET":
        return <UserCheck className="w-4 h-4 text-[#2563EB]" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-[#15803D]" />;
    }
  };

  return (
    <AppShell title="GRID AUDIT & EVENT TIMELINE">
      <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-[10px] font-mono bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded font-semibold uppercase tracking-wider">
                SECTION 35 DEMO TIMELINE
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0] rounded font-semibold uppercase tracking-wider">
                SUB-SECOND AUDIT LOG
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[#172033] flex items-center gap-2.5 font-mono">
              <ClipboardList className="w-6 h-6 text-[#2563EB]" />
              Live Chronological Event Timeline
            </h1>
            <p className="text-sm text-[#475569] mt-1">
              Global event stream capturing protection state transitions, threshold triggers,
              face-recognition authorizations, and relay sequencing with forensic precision.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer shadow-2xs ${
                autoRefresh
                  ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]"
                  : "bg-white border-[#CBD5E1] text-[#475569] hover:text-[#172033]"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Live Sync (2s)" : "Paused"}
            </button>
            <button
              onClick={loadTimeline}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#CBD5E1] text-[#475569] hover:text-[#172033] hover:bg-[#F8FAFC] text-xs font-mono transition-colors shadow-2xs cursor-pointer"
            >
              Manual Fetch
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#64748B] font-semibold">CHANNEL:</span>
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] font-mono text-xs focus:border-[#2563EB] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Channels</option>
                <option value="1">Channel 01</option>
                <option value="2">Channel 02</option>
                <option value="3">Channel 03</option>
                <option value="4">Channel 04</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#64748B] font-semibold">SEVERITY / LEVEL:</span>
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-[#172033] font-mono text-xs focus:border-[#2563EB] focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Levels</option>
                <option value="CRITICAL">Critical</option>
                <option value="TRIPPED">Tripped</option>
                <option value="FAULT_LATCHED">Fault Latched</option>
                <option value="WARNING">Warning</option>
                <option value="HIGH_LOAD">High Load</option>
                <option value="RESET">Reset / Auth</option>
                <option value="NORMAL">Normal</option>
              </select>
            </div>
          </div>

          <div className="text-xs font-mono text-[#64748B]">
            Showing <strong className="text-[#172033]">{filteredEvents.length}</strong> recorded events
          </div>
        </div>

        {/* Timeline Sequence Feed */}
        <div className="space-y-3">
          {filteredEvents.length === 0 ? (
            <div className="p-8 rounded-xl bg-white border border-[#E2E8F0] shadow-xs text-center text-[#64748B] font-mono text-xs">
              No events found matching current filter parameters.
            </div>
          ) : (
            filteredEvents.map((evt, idx) => {
              const dateObj = new Date(evt.timestamp);
              const timeStr = isNaN(dateObj.getTime())
                ? evt.timestamp
                : dateObj.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

              return (
                <div
                  key={evt.id || idx}
                  className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="mt-0.5 p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] shadow-2xs shrink-0">
                      {getLevelIcon(evt.level)}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#172033]">{timeStr}</span>
                        {evt.channel && (
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] rounded">
                            CH 0{evt.channel}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${getLevelBadge(evt.level)}`}>
                          {evt.level}
                        </span>
                        <span className="text-[10px] font-mono text-[#64748B] uppercase">
                          SRC: {evt.source}
                        </span>
                      </div>

                      <p className="text-xs font-mono text-[#475569] break-words">{evt.description}</p>

                      {(evt.measured_value !== null || evt.threshold !== null) && (
                        <div className="flex items-center gap-3 text-[11px] font-mono text-[#64748B]">
                          {evt.measured_value !== null && (
                            <span>
                              Measured: <strong className="text-[#172033]">{evt.measured_value}A</strong>
                            </span>
                          )}
                          {evt.threshold !== null && (
                            <span>
                              Threshold: <strong className="text-[#B45309]">{evt.threshold}A</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[10px] font-mono text-[#64748B]">
                      Action: <strong className="text-[#172033]">{evt.action_taken || "NONE"}</strong>
                    </span>
                    <span className="text-[9px] font-mono text-[#94A3B8]">{evt.id}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
