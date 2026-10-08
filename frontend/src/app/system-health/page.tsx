"use client";

import React, { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { api } from "@/lib/api";
import { SystemHealthData } from "@/types/telemetry";
import {
  HeartPulse,
  Wifi,
  Server,
  Database,
  Bot,
  Cpu,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Clock,
  RefreshCw,
  Layers,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";

export default function SystemHealthPage() {
  const { system, refresh: refreshTelemetry } = useLiveTelemetry();
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastCheckTime, setLastCheckTime] = useState<string>("---");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadHealthData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await api.getSystemHealth();
      setHealth(data);
      setLastCheckTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn("Failed to fetch authoritative system health:", err);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealthData();
    const interval = setInterval(() => {
      loadHealthData();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadHealthData]);

  const handleManualRefresh = () => {
    refreshTelemetry();
    loadHealthData();
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toUpperCase()) {
      case "ONLINE":
      case "AVAILABLE":
      case "CONNECTED":
      case "LIVE":
      case "RECEIVING":
      case "HEALTHY":
      case "STREAMING":
      case "FULLY_OPERATIONAL":
        return {
          badge: "bg-green-50 text-green-700 border-green-200",
          dot: "bg-green-600",
          border: "border-[#E2E8F0]",
        };
      case "WAITING":
      case "WAITING_FOR_DEVICE":
      case "WAITING_FOR_HARDWARE":
      case "PARTIALLY_OPERATIONAL":
      case "RECENT":
      case "STALE":
      case "TELEMETRY_STALE":
      case "NO_RECENT_INGESTION":
      case "NOT_CONFIGURED":
        return {
          badge: "bg-amber-50 text-amber-700 border-amber-200",
          dot: "bg-amber-500",
          border: "border-[#E2E8F0]",
        };
      case "OFFLINE":
      case "DISCONNECTED":
      case "UNAVAILABLE":
      case "DEGRADED":
      case "SERVICE_DEGRADED":
      case "NOT_CONNECTED":
      case "NOT_RECEIVING":
      case "NO_DATA":
      case "NO LIVE DATA":
      case "SYSTEM_FAULT":
        return {
          badge: "bg-red-50 text-red-700 border-red-200",
          dot: "bg-red-600",
          border: "border-red-200",
        };
      default:
        return {
          badge: "bg-slate-100 text-[#64748B] border-slate-200",
          dot: "bg-slate-400",
          border: "border-[#E2E8F0]",
        };
    }
  };

  const overallStatus = health?.overall_status || "WAITING_FOR_HARDWARE";
  const overallTheme = getStatusColor(overallStatus);

  const watchdog = health?.hardware_watchdog;
  const watchdogActive = watchdog?.status === "ACTIVE" && watchdog?.reported;

  return (
    <AppShell
      title="INFRASTRUCTURE & SYSTEM HEALTH WATCHDOG"
      dataSource={system.data_source}
      onRefresh={handleManualRefresh}
    >
      <div className="space-y-6 font-mono text-xs">
        {/* ====================================================== */}
        {/* 1. OVERALL SYSTEM STATUS & WATCHDOG HEADER */}
        {/* ====================================================== */}
        <div className="bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3.5 rounded-xl border ${overallTheme.badge}`}>
              <HeartPulse className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[10px] text-[#64748B] uppercase tracking-wider block font-semibold">
                GRIDGUARD SYSTEM STATUS
              </span>
              <div className="text-2xl font-bold text-[#172033] mt-0.5 flex items-center gap-2">
                <span>{overallStatus.replace(/_/g, " ")}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${overallTheme.dot}`} />
              </div>
              <p className="text-xs text-[#64748B] mt-1 max-w-xl leading-relaxed">
                {health?.overall_message || "Authoritative health probe running against core services."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Real Hardware Watchdog */}
            <div className="flex flex-col bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <span className="text-[#64748B] text-[9px] uppercase font-semibold">HARDWARE WATCHDOG</span>
              <span
                className={`font-bold mt-0.5 ${
                  watchdogActive ? "text-emerald-700" : "text-[#64748B]"
                }`}
              >
                {watchdogActive
                  ? `● ACTIVE (${watchdog?.interval_ms} ms)`
                  : "○ NOT AVAILABLE"}
              </span>
              <span className="text-[9px] text-[#94A3B8] mt-0.5">
                {watchdogActive ? "Reported by ESP32" : "Awaiting device report"}
              </span>
            </div>

            {/* Last Health Probe */}
            <div className="flex flex-col bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <span className="text-[#64748B] text-[9px] uppercase font-semibold">LAST HEALTH PROBE</span>
              <span className="text-[#172033] font-bold tabular-nums mt-0.5">
                {lastCheckTime}
              </span>
              <span className="text-[9px] text-[#94A3B8] mt-0.5">
                Authoritative Backend Probes
              </span>
            </div>

            {/* Manual Refresh Button */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
              title="Execute immediate health probe"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="text-[11px]">PROBE NOW</span>
            </button>
          </div>
        </div>

        {/* ====================================================== */}
        {/* 2. END-TO-END DATA PIPELINE & FAILURE LOCALIZATION */}
        {/* ====================================================== */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-[#172033] uppercase text-[11px] tracking-wider">
                END-TO-END PIPELINE CONNECTIVITY &amp; FAILURE LOCALIZATION
              </span>
            </div>
            {health?.pipeline_failure_stage && (
              <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2.5 py-0.5 rounded border border-red-200 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>INTERRUPTION DETECTED</span>
              </span>
            )}
          </div>

          {health?.pipeline_failure_stage && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <div>
                <span className="font-bold">First Pipeline Interruption Point:</span>{" "}
                <span>{health.pipeline_failure_stage}</span>
              </div>
            </div>
          )}

          {/* 5-Stage Pipeline Chain */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
            {[
              { key: "esp32_to_mqtt", name: "1. ESP32 &rarr; MQTT" },
              { key: "mqtt_to_nodered", name: "2. MQTT &rarr; Node-RED" },
              { key: "nodered_to_fastapi", name: "3. Node-RED &rarr; FastAPI" },
              { key: "fastapi_to_postgresql", name: "4. FastAPI &rarr; Postgres" },
              { key: "fastapi_to_websocket", name: "5. FastAPI &rarr; SCADA WS" },
            ].map(({ key, name }) => {
              const stage = health?.pipeline?.[key];
              const theme = getStatusColor(stage?.status);

              return (
                <div
                  key={key}
                  className={`p-3.5 rounded-lg border bg-[#F8FAFC] flex flex-col justify-between space-y-2 ${theme.border}`}
                >
                  <div>
                    <span
                      className="text-[11px] font-bold text-[#172033] block"
                      dangerouslySetInnerHTML={{ __html: name }}
                    />
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${theme.badge}`}>
                        {stage?.status || "UNKNOWN"}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#64748B] leading-tight">
                    {stage?.details || "Awaiting stage status"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ====================================================== */}
        {/* 3. CORE SERVICE HEALTH CARDS (10 DIMENSIONS) */}
        {/* ====================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {health?.esp32 && (
            <ServiceCard
              name={health.esp32.name}
              icon={Cpu}
              status={health.esp32.status}
              details={health.esp32.details}
              latency={health.esp32.latency_ms}
              lastSuccessful={health.esp32.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.mqtt_broker && (
            <ServiceCard
              name={health.mqtt_broker.name}
              icon={Wifi}
              status={health.mqtt_broker.status}
              details={health.mqtt_broker.details}
              latency={health.mqtt_broker.latency_ms}
              lastSuccessful={health.mqtt_broker.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.mqtt_device_session && (
            <ServiceCard
              name={health.mqtt_device_session.name}
              icon={Wifi}
              status={health.mqtt_device_session.status}
              details={health.mqtt_device_session.details}
              latency={health.mqtt_device_session.latency_ms}
              lastSuccessful={health.mqtt_device_session.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.live_telemetry && (
            <ServiceCard
              name={health.live_telemetry.name}
              icon={ShieldCheck}
              status={health.live_telemetry.status}
              details={health.live_telemetry.details}
              latency={health.live_telemetry.latency_ms}
              lastSuccessful={health.live_telemetry.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.node_red && (
            <ServiceCard
              name={health.node_red.name}
              icon={Server}
              status={health.node_red.status}
              details={health.node_red.details}
              latency={health.node_red.latency_ms}
              lastSuccessful={health.node_red.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.node_red_mqtt && (
            <ServiceCard
              name={health.node_red_mqtt.name}
              icon={Wifi}
              status={health.node_red_mqtt.status}
              details={health.node_red_mqtt.details}
              latency={health.node_red_mqtt.latency_ms}
              lastSuccessful={health.node_red_mqtt.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.node_red_pipeline && (
            <ServiceCard
              name={health.node_red_pipeline.name}
              icon={Server}
              status={health.node_red_pipeline.status}
              details={health.node_red_pipeline.details}
              latency={health.node_red_pipeline.latency_ms}
              lastSuccessful={health.node_red_pipeline.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.backend_api && (
            <ServiceCard
              name={health.backend_api.name}
              icon={Server}
              status={health.backend_api.status}
              details={health.backend_api.details}
              latency={health.backend_api.latency_ms}
              lastSuccessful={health.backend_api.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.database && (
            <ServiceCard
              name={health.database.name}
              icon={Database}
              status={health.database.status}
              details={health.database.details}
              latency={health.database.latency_ms}
              lastSuccessful={health.database.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.websocket && (
            <ServiceCard
              name={health.websocket.name}
              icon={Wifi}
              status={health.websocket.status}
              details={health.websocket.details}
              latency={health.websocket.latency_ms}
              lastSuccessful={health.websocket.last_successful}
              getStatusColor={getStatusColor}
            />
          )}

          {health?.ai_service && (
            <ServiceCard
              name={health.ai_service.name}
              icon={Bot}
              status={health.ai_service.status}
              details={health.ai_service.details}
              latency={health.ai_service.latency_ms}
              lastSuccessful={health.ai_service.last_successful}
              getStatusColor={getStatusColor}
            />
          )}
        </div>

        {/* ====================================================== */}
        {/* 4. OPERATIONAL HEALTH TRANSITION LOG */}
        {/* ====================================================== */}
        <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#64748B]" />
              <span className="font-bold text-[#172033] uppercase text-[11px] tracking-wider">
                OBSERVED HEALTH TRANSITIONS &amp; AUDIT LOG
              </span>
            </div>
            <span className="text-[10px] text-[#64748B]">
              REAL OBSERVED EVENTS &bull; ZERO FABRICATION
            </span>
          </div>

          {health?.history && health.history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] text-[10px]">
                    <th className="py-2.5 px-3">TIME</th>
                    <th className="py-2.5 px-3">SERVICE / SUBSYSTEM</th>
                    <th className="py-2.5 px-3">STATUS TRANSITION</th>
                    <th className="py-2.5 px-3">TRANSITION DETAILS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {health.history.map((ev, i) => {
                    const theme = getStatusColor(ev.status);
                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-[#64748B] tabular-nums">{ev.timestamp}</td>
                        <td className="py-2.5 px-3 text-[#172033] font-bold">{ev.service}</td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${theme.badge}`}>
                            {ev.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#64748B]">{ev.details}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-6 text-center text-[#64748B] text-xs">
              No service state transitions observed since server startup.
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}

interface ServiceCardProps {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  status: string;
  details: string;
  latency?: number | null;
  lastSuccessful?: string | null;
  getStatusColor: (status?: string) => { badge: string; dot: string; border: string };
}

function ServiceCard({
  name,
  icon: Icon,
  status,
  details,
  latency,
  lastSuccessful,
  getStatusColor,
}: ServiceCardProps) {
  const theme = getStatusColor(status);

  return (
    <div
      className={`bg-white p-4.5 rounded-xl border shadow-xs flex flex-col justify-between space-y-3 ${theme.border}`}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Icon className="w-4 h-4" />
            </div>
            <span
              className="text-xs font-bold text-[#172033] font-mono leading-tight"
              dangerouslySetInnerHTML={{ __html: name }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${theme.dot}`} />
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${theme.badge}`}>
            {status}
          </span>
        </div>

        <p className="text-[11px] text-[#64748B] leading-relaxed font-mono">{details}</p>
      </div>

      <div className="pt-2.5 border-t border-[#E2E8F0] space-y-1 text-[10px] text-[#64748B] font-mono">
        <div className="flex items-center justify-between">
          <span>Latency:</span>
          <span className="font-bold tabular-nums text-[#172033]">
            {latency != null ? `${latency.toFixed(1)} ms` : "---"}
          </span>
        </div>
        {lastSuccessful && (
          <div className="flex items-center justify-between text-[9px] text-[#94A3B8]">
            <span>Last Healthy:</span>
            <span className="tabular-nums">
              {new Date(lastSuccessful).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
