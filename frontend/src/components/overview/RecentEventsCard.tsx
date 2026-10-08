"use client";

import React from "react";
import Link from "next/link";
import { History, ArrowRight, CheckCircle2, AlertTriangle, Info } from "lucide-react";

interface RecentEventItem {
  id?: string | number;
  timestamp: string;
  source: string;
  channel?: number | null;
  event: string;
  severity: "INFO" | "WARNING" | "FAULT" | string;
}

interface RecentEventsCardProps {
  events: RecentEventItem[];
}

export function RecentEventsCard({ events }: RecentEventsCardProps) {
  const getSeverityBadge = (sev: string) => {
    switch (sev?.toUpperCase()) {
      case "FAULT":
      case "CRITICAL":
        return "bg-red-50 text-red-700 border-red-200";
      case "WARNING":
        return "bg-amber-50 text-amber-700 border-amber-200";
      default:
        return "bg-blue-50 text-blue-700 border-blue-200";
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between space-y-4 font-sans text-[#172033]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#172033] uppercase tracking-wide font-mono">
              Recent System Events
            </h3>
            <p className="text-[11px] text-[#64748B]">
              Authoritative Event Audit Log • Protection &amp; Lifecycle
            </p>
          </div>
        </div>

        <Link
          href="/timeline"
          className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 font-mono transition-colors"
        >
          <span>VIEW TIMELINE</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Events List */}
      <div className="flex-1 flex flex-col justify-center">
        {events && events.length > 0 ? (
          <div className="divide-y divide-[#E2E8F0] text-xs font-mono">
            {events.slice(0, 5).map((ev, idx) => (
              <div
                key={ev.id || idx}
                className="py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 px-1 rounded transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[10px] text-[#64748B] tabular-nums shrink-0">
                    {ev.timestamp?.includes("T")
                      ? new Date(ev.timestamp).toLocaleTimeString()
                      : ev.timestamp || "---"}
                  </span>
                  <div className="truncate">
                    <span className="font-bold text-[#172033] text-[11px]">
                      {ev.channel ? `CH0${ev.channel}` : ev.source}:{" "}
                    </span>
                    <span className="text-[#475569] text-[11px] font-sans">
                      {ev.event}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${getSeverityBadge(
                    ev.severity
                  )}`}
                >
                  {ev.severity}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
              <Info className="w-5 h-5" />
            </div>
            <h4 className="text-xs font-bold text-[#172033] font-mono tracking-wider uppercase">
              NO RECENT EVENTS
            </h4>
            <p className="text-[11px] text-[#64748B] max-w-xs mx-auto">
              No historical safety trips or maintenance events recorded during this session.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
