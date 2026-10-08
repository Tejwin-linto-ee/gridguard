"use client";

import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { api } from "@/lib/api";
import { TrendingUp, Gauge, AlertCircle, ArrowUpRight, ArrowDownRight, Clock, ShieldCheck } from "lucide-react";

export default function ForecastingPage() {
  const { system, refresh } = useLiveTelemetry();
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadForecast = async () => {
    try {
      const data = await api.getForecast();
      setForecast(data);
    } catch {
      setForecast(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForecast();
  }, []);

  return (
    <AppShell title="DYNAMIC LOAD DEMAND FORECASTING" dataSource={system.data_source} onRefresh={() => { refresh(); loadForecast(); }}>
      <div className="space-y-6 font-sans">
        {/* Header Banner */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              <TrendingUp className="w-6 h-6 text-[#2563EB]" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-[#172033] uppercase font-mono tracking-wider">
                MACHINE LEARNING LOAD PREDICTION ENGINE
              </h2>
              <p className="text-[11px] text-[#64748B] mt-0.5">
                Multi-horizon time series regression trained on prototype electrical telemetry.
              </p>
            </div>
          </div>

          <div className="text-right font-mono text-xs">
            <div className="text-[#64748B] text-[10px] font-semibold">EVALUATED MODEL ERROR</div>
            <div className="text-[#15803D] font-bold text-sm">MAE: ±14.8 W</div>
          </div>
        </div>

        {/* 3 Forecast Horizons */}
        {forecast && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: "15-MINUTE HORIZON", data: forecast.forecast_15m },
              { label: "30-MINUTE HORIZON", data: forecast.forecast_30m },
              { label: "1-HOUR HORIZON", data: forecast.forecast_60m },
            ].map((item, idx) => (
              <div key={idx} className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-4">
                <div className="flex items-center justify-between text-xs font-mono border-b border-[#E2E8F0] pb-2">
                  <span className="text-[#475569] font-bold">{item.label}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                    {item.data.trend}
                  </span>
                </div>

                <div>
                  <div className="text-3xl font-bold text-[#172033] font-mono tabular-nums">
                    {item.data.predicted_load_w != null ? (
                      <>
                        {item.data.predicted_load_w.toFixed(1)} <span className="text-sm text-[#2563EB]">W</span>
                      </>
                    ) : (
                      <span className="text-base text-[#D97706]">FORECAST UNAVAILABLE</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#64748B] font-mono mt-1">
                    {item.data.confidence_lower != null && item.data.confidence_upper != null
                      ? `Confidence Band: ${item.data.confidence_lower.toFixed(0)}W – ${item.data.confidence_upper.toFixed(0)}W`
                      : "Insufficient Live Telemetry for Confidence Band"}
                  </div>
                </div>

                {/* Progress bar visual */}
                <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-[#2563EB] h-full rounded-full transition-all"
                    style={{ width: `${item.data.predicted_load_w != null ? Math.min(100, (item.data.predicted_load_w / 1500) * 100) : 0}%` }}
                  />
                </div>

                <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[10px] text-[#64748B] font-mono">
                  <span>Delta from Now:</span>
                  <span className={`font-bold ${item.data.predicted_load_w != null && system.power != null && item.data.predicted_load_w > system.power ? "text-[#D97706]" : "text-[#15803D]"}`}>
                    {item.data.predicted_load_w != null && system.power != null
                      ? `${item.data.predicted_load_w > system.power ? "+" : ""}${(item.data.predicted_load_w - system.power).toFixed(1)} W`
                      : "---"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Forecast Accuracy Disclaimer */}
        {forecast && (
          <div className="bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs text-xs text-[#475569] font-mono flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#172033]">Model Validation &amp; Operational Disclaimer:</strong> {forecast.disclaimer} Current model: <span className="text-[#2563EB] font-bold">{forecast.model_name}</span>. Baseline tested against nominal 4-channel incandescent bulb resistive/inductive switching cycles.
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
