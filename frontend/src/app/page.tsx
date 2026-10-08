"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useLiveTelemetry } from "@/hooks/useLiveTelemetry";
import { api } from "@/lib/api";
import { SystemHealthData } from "@/types/telemetry";

// Overview Modular Components
import { LiveTelemetryBanner } from "@/components/overview/LiveTelemetryBanner";
import { SystemOverviewCard } from "@/components/overview/SystemOverviewCard";
import { PzemTelemetryGrid } from "@/components/overview/PzemTelemetryGrid";
import { ChannelStatusGrid } from "@/components/overview/ChannelStatusGrid";
import { DigitalTwinPreviewCard } from "@/components/overview/DigitalTwinPreviewCard";
import { SystemHealthOverviewCard } from "@/components/overview/SystemHealthOverviewCard";
import { ActiveAlertsCard } from "@/components/overview/ActiveAlertsCard";
import { RecentEventsCard } from "@/components/overview/RecentEventsCard";
import { LoadManagementSummaryCard } from "@/components/overview/LoadManagementSummaryCard";
import { AIAdvisoryCard } from "@/components/overview/AIAdvisoryCard";

// Modals & Diagnostic View
import { FaceResetModal } from "@/components/faults/FaceResetModal";
import { MaintenanceTripModal } from "@/components/maintenance/MaintenanceTripModal";
import { EngineeringModeView } from "@/components/common/EngineeringModeView";
import { HardwareValidationPanel } from "@/components/common/HardwareValidationPanel";

export default function OverviewPage() {
  const {
    system,
    channels,
    systemState,
    loadSheddingActive,
    hasLiveData,
    packetAgeSec,
    esp32Status,
    lastHeartbeatAgeSec,
    systemConnectionStatus,
    protectionStatus,
    mqttConnected,
    deviceMode,
    hardwareType,
    deviceId,
    refresh,
  } = useLiveTelemetry();

  // Multi-Channel Selection state (immutable Set<number>)
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set());
  const [isTripModalOpen, setIsTripModalOpen] = useState<boolean>(false);
  const [resetModalChannels, setResetModalChannels] = useState<number[] | null>(null);
  const [showEngineeringMode, setShowEngineeringMode] = useState<boolean>(false);
  const [showValidationPanel, setShowValidationPanel] = useState<boolean>(false);

  // Health and Events supplementary data
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [riskScores, setRiskScores] = useState<Record<number, number>>({});

  const loadSupplementaryData = useCallback(async () => {
    try {
      const [health, events, risks] = await Promise.allSettled([
        api.getSystemHealth(),
        api.getEventTimeline(6),
        api.getRiskScores(),
      ]);

      if (health.status === "fulfilled") setHealthData(health.value);
      if (events.status === "fulfilled" && Array.isArray(events.value)) {
        setRecentEvents(events.value);
      }
      if (risks.status === "fulfilled" && Array.isArray(risks.value)) {
        const rMap: Record<number, number> = {};
        risks.value.forEach((r: any) => {
          if (r.channel) rMap[r.channel] = r.risk_score;
        });
        setRiskScores(rMap);
      }
    } catch (err) {
      console.warn("Supplementary overview data fetch error:", err);
    }
  }, []);

  useEffect(() => {
    loadSupplementaryData();
    const interval = setInterval(loadSupplementaryData, 4000);
    return () => clearInterval(interval);
  }, [loadSupplementaryData]);

  // Channel Selection helpers
  const toggleChannelSelection = (chId: number) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(chId)) next.delete(chId);
      else next.add(chId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedChannels(new Set(channels.map((c) => c.channel)));
  };

  const handleClearSelection = () => {
    setSelectedChannels(new Set());
  };

  // Check if any channels are currently latched or tripped
  const latchedChannels = channels.filter(
    (c) => c.status === "FAULT LATCHED" || c.status === "TRIPPED"
  );

  const selectedList = Array.from(selectedChannels).sort((a, b) => a - b);

  // Refresh handler
  const handleFullRefresh = () => {
    refresh();
    loadSupplementaryData();
  };

  return (
    <AppShell
      title="SYSTEM OVERVIEW"
      dataSource={hasLiveData ? "LIVE MQTT" : "WAITING FOR MQTT"}
      onRefresh={handleFullRefresh}
      hasActiveFault={latchedChannels.length > 0}
    >
      <div className="space-y-4 font-sans pb-8">
        {/* 1. Live Telemetry Status Banner */}
        <LiveTelemetryBanner
          hasLiveData={hasLiveData}
          packetAgeSec={packetAgeSec}
          latencyMs={healthData?.esp32?.latency_ms}
          esp32Status={esp32Status}
          lastHeartbeatAgeSec={lastHeartbeatAgeSec}
          mqttConnected={mqttConnected}
          deviceMode={deviceMode}
          hardwareType={hardwareType}
          connectionStatus={systemConnectionStatus}
        />

        {/* 2. System Overview Status Card */}
        <SystemOverviewCard
          systemState={healthData?.overall_status || systemState}
          hasLiveData={hasLiveData}
          onToggleDiagnostics={() => setShowEngineeringMode(!showEngineeringMode)}
          showDiagnostics={showEngineeringMode}
          onToggleValidation={() => setShowValidationPanel(!showValidationPanel)}
          showValidation={showValidationPanel}
          deviceMode={deviceMode}
          hardwareType={hardwareType}
        />

        {/* Hardware Validation / ESP32 Simulator Test Panel */}
        {showValidationPanel && (
          <HardwareValidationPanel
            deviceMode={deviceMode}
            hardwareType={hardwareType}
            esp32Status={esp32Status}
            onRequestTrip={(chId) => {
              setSelectedChannels(new Set([chId]));
              setIsTripModalOpen(true);
            }}
            onRequestReset={(chId) => {
              setResetModalChannels([chId]);
            }}
            onRefresh={handleFullRefresh}
          />
        )}

        {/* Engineering Diagnostic Console (collapsible) */}
        {showEngineeringMode && (
          <EngineeringModeView
            system={system}
            channels={channels}
            systemState={systemState}
          />
        )}

        {/* 3. PZEM Overall System Electrical Telemetry (6 KPI cards) */}
        <PzemTelemetryGrid
          system={system}
          hasLiveData={hasLiveData}
          packetAgeSec={packetAgeSec}
        />

        {/* 4. Prototype Load Channel Status Grid (CH1 – CH4) */}
        <ChannelStatusGrid
          channels={channels}
          hasLiveData={hasLiveData}
          esp32Status={esp32Status}
          selectedChannels={selectedChannels}
          onToggleSelect={toggleChannelSelection}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onRequestTrip={(chId?: number) => {
            if (chId) {
              setSelectedChannels(new Set([chId]));
            }
            setIsTripModalOpen(true);
          }}
          onRequestReset={(chId?: number) => setResetModalChannels(chId ? [chId] : selectedList.length > 0 ? selectedList : [1])}
          riskScores={riskScores}
        />

        {/* 5. 2-Column Row 1: Digital Twin Preview & System Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DigitalTwinPreviewCard
            system={system}
            channels={channels}
            hasLiveData={hasLiveData}
            deviceMode={deviceMode}
            hardwareType={hardwareType}
          />
          <SystemHealthOverviewCard
            health={healthData}
            hasLiveData={hasLiveData}
          />
        </div>

        {/* 6. 2-Column Row 2: Active Alerts & Recent Events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActiveAlertsCard
            channels={channels}
            onAuthorizeReset={(chId) => setResetModalChannels([chId])}
          />
          <RecentEventsCard events={recentEvents} />
        </div>

        {/* 7. 2-Column Row 3: Load Management & AI Advisory */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LoadManagementSummaryCard
            channels={channels}
            hasLiveData={hasLiveData}
            loadSheddingActive={loadSheddingActive}
          />
          <AIAdvisoryCard hasLiveData={hasLiveData} />
        </div>

        {/* Maintenance Trip Modal */}
        <MaintenanceTripModal
          selectedChannels={selectedList}
          isOpen={isTripModalOpen}
          onClose={() => setIsTripModalOpen(false)}
          onSuccess={() => {
            setIsTripModalOpen(false);
            handleFullRefresh();
          }}
        />

        {/* Multi-Channel Face Reset Modal */}
        {resetModalChannels !== null && (
          <FaceResetModal
            channels={resetModalChannels}
            channel={resetModalChannels[0]}
            isOpen={true}
            onClose={() => setResetModalChannels(null)}
            onSuccess={() => {
              setResetModalChannels(null);
              handleFullRefresh();
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
