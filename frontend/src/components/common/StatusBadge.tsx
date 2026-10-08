import React from "react";
import { CheckCircle2, AlertTriangle, AlertOctagon, Lock, PowerOff, ShieldCheck } from "lucide-react";
import { SystemState, ChannelStatus } from "@/types/telemetry";

interface StatusBadgeProps {
  status: SystemState | ChannelStatus | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StatusBadge({ status, size = "md", className = "" }: StatusBadgeProps) {
  const norm = (status || "NORMAL").toUpperCase();

  let bg = "bg-green-50 text-green-700 border-green-200";
  let icon = <CheckCircle2 className="w-3.5 h-3.5" />;
  const label = norm;

  if (norm === "NORMAL") {
    bg = "bg-green-50 text-green-700 border-green-200";
    icon = <ShieldCheck className="w-3.5 h-3.5" />;
  } else if (norm === "WARNING") {
    bg = "bg-amber-50 text-amber-800 border-amber-200";
    icon = <AlertTriangle className="w-3.5 h-3.5" />;
  } else if (norm === "HIGH LOAD") {
    bg = "bg-orange-50 text-orange-800 border-orange-200";
    icon = <AlertTriangle className="w-3.5 h-3.5" />;
  } else if (norm === "CRITICAL") {
    bg = "bg-red-50 text-red-700 border-red-200";
    icon = <AlertOctagon className="w-3.5 h-3.5" />;
  } else if (norm === "TRIPPED") {
    bg = "bg-red-50 text-red-700 border-red-200";
    icon = <PowerOff className="w-3.5 h-3.5" />;
  } else if (norm === "FAULT LATCHED") {
    bg = "bg-purple-50 text-purple-700 border-purple-200";
    icon = <Lock className="w-3.5 h-3.5" />;
  } else if (norm === "MAINTENANCE") {
    bg = "bg-blue-50 text-blue-700 border-blue-200";
    icon = <PowerOff className="w-3.5 h-3.5" />;
  } else if (norm === "OFFLINE" || norm === "NO LIVE DATA") {
    bg = "bg-slate-100 text-slate-700 border-slate-200";
    icon = <PowerOff className="w-3.5 h-3.5" />;
  } else if (norm.includes("WAITING") || norm.includes("NO LIVE")) {
    bg = "bg-amber-50 text-amber-800 border-amber-200";
    icon = <AlertTriangle className="w-3.5 h-3.5" />;
  }


  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-2.5 py-1 text-xs font-medium gap-1.5",
    lg: "px-3.5 py-1.5 text-sm font-semibold gap-2",
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full border ${sizeClasses} ${bg} ${className}`}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}
