import React from "react";
import { Zap, Activity, Gauge, BatteryCharging, Radio, Compass } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: number | string;
  unit: string;
  iconName: "voltage" | "current" | "power" | "energy" | "frequency" | "power_factor";
  subtext?: string;
  status?: "normal" | "warning" | "critical";
  nominalRange?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  iconName,
  subtext = "System / Overall PZEM-004T",
  status = "normal",
  nominalRange,
}: MetricCardProps) {
  const getIcon = () => {
    switch (iconName) {
      case "voltage":
        return <Zap className="w-4 h-4 text-amber-600" />;
      case "current":
        return <Activity className="w-4 h-4 text-blue-600" />;
      case "power":
        return <Gauge className="w-4 h-4 text-emerald-600" />;
      case "energy":
        return <BatteryCharging className="w-4 h-4 text-indigo-600" />;
      case "frequency":
        return <Radio className="w-4 h-4 text-sky-600" />;
      case "power_factor":
        return <Compass className="w-4 h-4 text-slate-700" />;
      default:
        return <Zap className="w-4 h-4 text-blue-600" />;
    }
  };

  const statusBorder = {
    normal: "border-[#E2E8F0] hover:border-slate-300",
    warning: "border-amber-300 bg-amber-50/20",
    critical: "border-red-300 bg-red-50/20",
  }[status];

  return (
    <div
      className={`scada-panel p-4 flex flex-col justify-between ${statusBorder} font-mono relative bg-white shadow-2xs rounded-xl`}
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
            {label}
          </span>
          <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200">
            {getIcon()}
          </div>
        </div>

        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-2xl font-bold tracking-tight text-[#172033] font-mono tabular-nums">
            {value}
          </span>
          <span className="text-xs font-bold text-blue-600 font-mono">{unit}</span>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span className="text-slate-500 truncate">{subtext}</span>
        {nominalRange && (
          <span className="text-slate-400 font-mono text-[10px]">Nom: {nominalRange}</span>
        )}
      </div>
    </div>
  );
}
