import React from "react";
import { Radio, Database, History, AlertCircle } from "lucide-react";
import { DataSourceType } from "@/types/telemetry";

interface DataSourceIndicatorProps {
  source: DataSourceType | string;
  size?: "sm" | "md";
}

export function DataSourceIndicator({ source, size = "md" }: DataSourceIndicatorProps) {
  const norm = (source || "DEMO DATA").toUpperCase();

  let color = "bg-blue-500/10 text-blue-400 border-blue-500/30";
  let icon = <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />;
  let label = "DEMO DATA";

  if (norm.includes("LIVE")) {
    color = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    icon = <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />;
    label = "● LIVE MQTT";
  } else if (norm.includes("DEMO") || norm.includes("SIMULAT")) {
    color = "bg-amber-500/10 text-amber-300 border-amber-500/30";
    icon = <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
    label = "⚠ SIMULATED DEMO";
  } else if (norm.includes("HISTORICAL")) {
    color = "bg-slate-700/30 text-slate-300 border-slate-700";
    icon = <History className="w-3.5 h-3.5 text-slate-400" />;
    label = "HISTORICAL";
  } else {
    color = "bg-amber-500/10 text-amber-300 border-amber-500/30";
    icon = <AlertCircle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />;
    label = norm.includes("STALE") ? "TELEMETRY STALE" : "WAITING FOR MQTT";
  }

  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs font-semibold";

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border ${color} ${px}`}>
      {icon}
      <span className="tracking-wide uppercase font-mono">{label}</span>
    </div>
  );
}
