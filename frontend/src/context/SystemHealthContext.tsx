"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { SystemHealthData } from "@/types/telemetry";

export type DeviceConnectionState = "WAITING_FOR_DEVICE" | "ONLINE" | "STALE" | "OFFLINE";

export interface AuthoritativeDeviceState {
  state: DeviceConnectionState;
  displayStatus: "NOT CONNECTED" | "ONLINE" | "STALE" | "OFFLINE";
  packetAgeSec: number | null;
  lastHeartbeatAgeSec: number | null;
  lastPacketAt: string | null;
  isLive: boolean; // Strictly true ONLY when (state === "ONLINE" && hasLiveData)
}

export type MqttState = "CONNECTED" | "DISCONNECTED" | "CONNECTING" | "ERROR" | "UNKNOWN";
export type TelemetrySource = "ESP32_MQTT" | "PHYSICAL_ESP32" | "SIMULATOR_MQTT" | "NONE" | "STALE_DEVICE_DATA";
export type DataProvenance = "LIVE_ESP32_MQTT" | "SIMULATOR_MQTT" | "STALE_DEVICE_DATA" | "NO_LIVE_MQTT" | "NO_DATA";

export interface AuthoritativePhysicalEsp32State {
  state: DeviceConnectionState;
  displayStatus: "NOT CONNECTED" | "ONLINE" | "STALE" | "OFFLINE";
  packetAgeSec: number | null;
  lastHeartbeatAgeSec: number | null;
  lastPacketAt: string | null;
  isOnline: boolean;
  isLive: boolean;
}

export interface AuthoritativeSimulatorState {
  state: "ONLINE" | "OFFLINE";
  displayStatus: "ONLINE" | "OFFLINE";
  processStatus: "ONLINE" | "OFFLINE";
  mqttStatus: "CONNECTED" | "DISCONNECTED";
  telemetryStatus: "LIVE" | "WAITING" | "OFFLINE";
  packetAgeSec: number | null;
  lastHeartbeatAgeSec: number | null;
  isRunning: boolean;
  isLive: boolean;
}

export interface AuthoritativeSystemHealth {
  device: {
    state: DeviceConnectionState;
    displayStatus: string;
    packetAgeSec: number | null;
    lastHeartbeatAgeSec: number | null;
    lastPacketAt: string | null;
    isLive: boolean;
  };
  physicalEsp32: AuthoritativePhysicalEsp32State;
  simulator: AuthoritativeSimulatorState;
  deviceMode: string;
  hardwareType: string;
  deviceId: string;
  mqtt: {
    state: MqttState;
    brokerHost: string;
    brokerPort: number;
    brokerReachable: boolean;
    sessionStatus: string;
  };
  nodeRed: {
    state: "ONLINE" | "OFFLINE";
    service: {
      status: "ONLINE" | "OFFLINE";
    };
    mqtt: {
      status: "CONNECTED" | "DISCONNECTED" | "RECEIVING" | "IDLE" | "OFFLINE";
    };
    pipeline: {
      status: "LIVE" | "RECEIVING" | "IDLE" | "NO_RECENT_INGESTION" | "NOT_RECEIVING";
      source: string;
    };
    pipelineStatus: "RECEIVING" | "NO_RECENT_INGESTION" | "NOT_RECEIVING" | "LIVE" | "IDLE";
    details: string;
  };
  fastApi: {
    state: "ONLINE" | "OFFLINE";
  };
  postgres: {
    state: "CONNECTED" | "DISCONNECTED";
  };
  websocket: {
    state: "ESTABLISHED" | "DISCONNECTED";
  };
  telemetrySource: TelemetrySource;
  dataProvenance: DataProvenance;
  dataProvenanceDisplay: string;
  globalBadge: {
    text: string;
    subtext: string;
    color: "green" | "amber" | "red" | "slate";
    isLive: boolean;
  };
  rawHealthData: SystemHealthData | null;
  refresh: () => Promise<void>;
}

const defaultAuthoritativeState: AuthoritativeSystemHealth = {
  device: {
    state: "WAITING_FOR_DEVICE",
    displayStatus: "NOT CONNECTED",
    packetAgeSec: null,
    lastHeartbeatAgeSec: null,
    lastPacketAt: null,
    isLive: false,
  },
  physicalEsp32: {
    state: "WAITING_FOR_DEVICE",
    displayStatus: "NOT CONNECTED",
    packetAgeSec: null,
    lastHeartbeatAgeSec: null,
    lastPacketAt: null,
    isOnline: false,
    isLive: false,
  },
  simulator: {
    state: "OFFLINE",
    displayStatus: "OFFLINE",
    processStatus: "OFFLINE",
    mqttStatus: "DISCONNECTED",
    telemetryStatus: "OFFLINE",
    packetAgeSec: null,
    lastHeartbeatAgeSec: null,
    isRunning: false,
    isLive: false,
  },
  deviceMode: "SIMULATOR",
  hardwareType: "ESP32-S3 SIMULATOR",
  deviceId: "GRIDGUARD-ESP32-SIM-001",
  mqtt: {
    state: "DISCONNECTED",
    brokerHost: "HiveMQ Cloud TLS",
    brokerPort: 8883,
    brokerReachable: false,
    sessionStatus: "DISCONNECTED",
  },
  nodeRed: {
    state: "OFFLINE",
    service: {
      status: "OFFLINE",
    },
    mqtt: {
      status: "DISCONNECTED",
    },
    pipeline: {
      status: "NOT_RECEIVING",
      source: "NONE",
    },
    pipelineStatus: "NOT_RECEIVING",
    details: "Awaiting gateway telemetry stream probe",
  },
  fastApi: {
    state: "ONLINE",
  },
  postgres: {
    state: "CONNECTED",
  },
  websocket: {
    state: "DISCONNECTED",
  },
  telemetrySource: "NONE",
  dataProvenance: "NO_DATA",
  dataProvenanceDisplay: "○ NO LIVE DATA",
  globalBadge: {
    text: "○ WAITING FOR ESP32",
    subtext: "Hardware Standby",
    color: "slate",
    isLive: false,
  },
  rawHealthData: null,
  refresh: async () => {},
};

const SystemHealthContext = createContext<AuthoritativeSystemHealth>(defaultAuthoritativeState);

export function SystemHealthProvider({ children }: { children: React.ReactNode }) {
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [apiOnline, setApiOnline] = useState<boolean>(true);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchStatusAndHealth = useCallback(async () => {
    try {
      const [statusRes, healthRes] = await Promise.allSettled([
        api.getSystemStatus(),
        api.getSystemHealth(),
      ]);

      if (statusRes.status === "fulfilled" && statusRes.value) {
        setSystemStatus(statusRes.value);
        setApiOnline(true);
      } else {
        setApiOnline(false);
      }

      if (healthRes.status === "fulfilled" && healthRes.value) {
        setHealthData(healthRes.value);
      }
    } catch {
      setApiOnline(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Initial fetch
    void fetchStatusAndHealth();

    // Polling interval (4 seconds)
    const interval = setInterval(() => {
      if (isMounted) void fetchStatusAndHealth();
    }, 4000);

    // WebSocket connection
    const connectWs = () => {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws/live";
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.system) {
              setSystemStatus((prev: any) => ({
                ...(prev || {}),
                telemetry: data.system,
                has_live_data: Boolean(data.has_live_data),
                mqtt_connected: Boolean(data.mqtt_connected),
                physical_esp32_online: Boolean(data.physical_esp32_online),
                physical_esp32_status: data.physical_esp32_status || "NOT_CONNECTED",
                simulator_online: Boolean(data.simulator_online),
                simulator_status: data.simulator_status || (data.simulator_online ? "ONLINE" : "OFFLINE"),
                esp32_online: Boolean(data.physical_esp32_online),
                esp32_status: data.physical_esp32_status || "NOT_CONNECTED",
                packet_age_sec: data.system.packet_age_sec,
                last_heartbeat_age_sec: data.system.last_heartbeat_age_sec,
                connection_status: data.system.connection_status,
                device_mode: data.device_mode || data.system.device_mode,
                hardware_type: data.hardware_type || data.system.hardware_type,
                telemetry_source: data.telemetry_source || data.system.telemetry_source,
                data_provenance: data.data_provenance || data.system.data_provenance,
              }));
            }
          } catch (e) {
            console.warn("WebSocket parse error in SystemHealthContext:", e);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          if (!isMounted) return;
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchStatusAndHealth]);

  // Authoritative State Derivation Engine
  const authoritativeState: AuthoritativeSystemHealth = useMemo(() => {
    // 1. ESP32 Hardware Telemetry Health
    // Primary authority: packet_age_sec and last_heartbeat_age_sec
    const pktAge = systemStatus?.telemetry?.packet_age_sec ?? systemStatus?.packet_age_sec ?? null;
    const hbAge = systemStatus?.telemetry?.last_heartbeat_age_sec ?? systemStatus?.last_heartbeat_age_sec ?? null;
    const hasLiveTelemetry = Boolean(systemStatus?.has_live_data || systemStatus?.telemetry?.has_live_data);

    let minAge: number | null = null;
    if (pktAge != null && hbAge != null) minAge = Math.min(pktAge, hbAge);
    else if (pktAge != null) minAge = pktAge;
    else if (hbAge != null) minAge = hbAge;

    // Authoritative Device Mode & Provenance
    const devMode =
      systemStatus?.device_mode ||
      systemStatus?.telemetry?.device_mode ||
      healthData?.device_mode ||
      "SIMULATOR";

    const hwType =
      systemStatus?.hardware_type ||
      systemStatus?.telemetry?.hardware_type ||
      (devMode === "SIMULATOR" ? "ESP32-S3 SIMULATOR" : "ESP32-S3 N16R8");

    const devId =
      systemStatus?.device_id ||
      systemStatus?.telemetry?.device_id ||
      (devMode === "SIMULATOR" ? "GRIDGUARD-ESP32-SIM-001" : "GRIDGUARD-ESP32-001");

    // ZERO-FABRICATION RULE: Physical ESP32 is ONLINE strictly and only when
    // physical ESP32 heartbeat/packet is verified by backend!
    const isPhysicalEsp32Online = Boolean(
      systemStatus?.physical_esp32_online === true ||
      (systemStatus?.esp32_online === true && devMode === "PHYSICAL") ||
      (healthData?.physical_esp32?.status === "ONLINE")
    );

    const isSimulatorOnline = Boolean(
      systemStatus?.simulator_online === true ||
      devMode === "SIMULATOR" ||
      hwType.includes("SIMULATOR") ||
      healthData?.simulator?.status === "ONLINE"
    );

    // Physical Hardware State
    let physicalState: DeviceConnectionState = "WAITING_FOR_DEVICE";
    let physicalDisplayStatus: "NOT CONNECTED" | "ONLINE" | "STALE" | "OFFLINE" = "NOT CONNECTED";
    if (isPhysicalEsp32Online) {
      if (minAge != null && minAge > 30.0) {
        physicalState = "OFFLINE";
        physicalDisplayStatus = "OFFLINE";
      } else if (minAge != null && minAge > 15.0) {
        physicalState = "STALE";
        physicalDisplayStatus = "STALE";
      } else {
        physicalState = "ONLINE";
        physicalDisplayStatus = "ONLINE";
      }
    } else {
      physicalState = "WAITING_FOR_DEVICE";
      physicalDisplayStatus = "NOT CONNECTED";
    }
    const physicalIsLive = isPhysicalEsp32Online && hasLiveTelemetry;

    // Simulator State
    const simulatorRunning = isSimulatorOnline;
    const simulatorState: "ONLINE" | "OFFLINE" = simulatorRunning ? "ONLINE" : "OFFLINE";
    const simulatorDisplayStatus: "ONLINE" | "OFFLINE" = simulatorRunning ? "ONLINE" : "OFFLINE";
    const simulatorIsLive = simulatorRunning && hasLiveTelemetry;

    // 2. MQTT State (Requirements 1, 2, 3)
    // Reflects actual connection state of the backend/device pipeline
    const backendMqttStateRaw = systemStatus?.mqtt_state || (systemStatus?.mqtt_connected ? "MQTT_CONNECTED" : "MQTT_DISCONNECTED");
    const isSimMqttConnected = Boolean(
      systemStatus?.simulator_mqtt_connected ||
      healthData?.simulator_mqtt?.status === "CONNECTED" ||
      (devMode === "SIMULATOR" && isSimulatorOnline)
    );
    const isNodeRedMqttActive = Boolean(
      healthData?.node_red_mqtt?.status === "LIVE" ||
      healthData?.node_red_mqtt?.status === "CONNECTED"
    );
    const mqttBrokerStatus = healthData?.mqtt_broker?.status === "AVAILABLE";

    let resolvedMqttState: MqttState = "DISCONNECTED";
    if (backendMqttStateRaw === "MQTT_CONNECTED" || backendMqttStateRaw === "CONNECTED" || (isSimMqttConnected && mqttBrokerStatus)) {
      resolvedMqttState = "CONNECTED";
    } else if (backendMqttStateRaw === "MQTT_CONNECTING" || backendMqttStateRaw === "CONNECTING") {
      resolvedMqttState = "CONNECTING";
    } else if (backendMqttStateRaw === "MQTT_ERROR" || backendMqttStateRaw === "ERROR") {
      resolvedMqttState = "ERROR";
    } else {
      resolvedMqttState = "DISCONNECTED";
    }
    const isMqttConnected = resolvedMqttState === "CONNECTED";
    const devMqttSessionStatus = healthData?.mqtt_device_session?.status || (isMqttConnected && (physicalIsLive || simulatorIsLive) ? "CONNECTED" : "DISCONNECTED");

    // 3. Node-RED State: Service Health vs MQTT Input vs Pipeline
    const nodeRedStatus = healthData?.node_red?.status?.toUpperCase();
    const isNodeRedOnline = nodeRedStatus === "ONLINE";
    const nrMqttStatusRaw = healthData?.node_red_mqtt?.status?.toUpperCase();
    const nrMqttStatus: "CONNECTED" | "DISCONNECTED" | "RECEIVING" | "IDLE" | "OFFLINE" =
      nrMqttStatusRaw === "LIVE" ? "RECEIVING" :
      (nrMqttStatusRaw === "CONNECTED" || (isNodeRedOnline && isMqttConnected) ? "CONNECTED" :
      (isNodeRedOnline ? "IDLE" : "OFFLINE"));

    const nodeRedPipeStatusRaw = healthData?.node_red_pipeline?.status?.toUpperCase();
    let nodeRedPipelineStatus: "RECEIVING" | "NO_RECENT_INGESTION" | "NOT_RECEIVING" | "LIVE" | "IDLE" = "NOT_RECEIVING";
    if (nodeRedPipeStatusRaw === "RECEIVING" || nodeRedPipeStatusRaw?.includes("LIVE")) {
      nodeRedPipelineStatus = "RECEIVING";
    } else if (isNodeRedOnline) {
      nodeRedPipelineStatus = "NO_RECENT_INGESTION";
    } else {
      nodeRedPipelineStatus = "NOT_RECEIVING";
    }

    // 4. FastAPI State (Requirement 5)
    const isFastApiOnline = apiOnline;

    // 5. PostgreSQL State (Requirement 6)
    const dbStatus = healthData?.database?.status?.toUpperCase();
    const isDbConnected = dbStatus === "ONLINE" || dbStatus === "CONNECTED";

    // 6. WebSocket State (Requirement 7)
    const isWsEstablished = wsConnected;

    // 7. Telemetry Source & Data Provenance (Requirements 4, 7, 8, 17)
    let telemetrySource: TelemetrySource = "NONE";
    let dataProvenance: DataProvenance = "NO_DATA";
    let dataProvenanceDisplay = "○ NO LIVE DATA";

    if (physicalIsLive) {
      telemetrySource = "PHYSICAL_ESP32";
      dataProvenance = isMqttConnected ? "LIVE_ESP32_MQTT" : "NO_LIVE_MQTT";
      dataProvenanceDisplay = isMqttConnected ? "● LIVE ESP32 MQTT" : "○ NO LIVE MQTT";
    } else if (simulatorIsLive) {
      telemetrySource = "SIMULATOR_MQTT";
      dataProvenance = "SIMULATOR_MQTT";
      dataProvenanceDisplay = "● SIMULATOR MQTT";
    } else if (isPhysicalEsp32Online && physicalState === "STALE") {
      telemetrySource = "STALE_DEVICE_DATA";
      dataProvenance = "STALE_DEVICE_DATA";
      dataProvenanceDisplay = "⚠ STALE DATA";
    } else {
      telemetrySource = "NONE";
      dataProvenance = "NO_DATA";
      dataProvenanceDisplay = "○ NO LIVE DATA";
    }

    // 8. Global Badge Logic (Section 9 of Requirements)
    // Strictly derived from actual hardware connectivity and truthful MQTT state
    let badgeText = "○ WAITING FOR DEVICE";
    let badgeSubtext = "Hardware Standby";
    let badgeColor: "green" | "amber" | "red" | "slate" = "slate";
    let globalIsLive = false;

    if (physicalIsLive) {
      badgeText = "● LIVE SYSTEM";
      badgeSubtext = "PHYSICAL ESP32";
      badgeColor = "green";
      globalIsLive = true;
    } else if (simulatorIsLive) {
      badgeText = "● SIMULATOR LIVE";
      badgeSubtext = isMqttConnected ? "MQTT Connected" : "Local Telemetry";
      badgeColor = "green";
      globalIsLive = true;
    } else if (isMqttConnected) {
      badgeText = "○ WAITING FOR DEVICE";
      badgeSubtext = "Broker Connected";
      badgeColor = "slate";
      globalIsLive = false;
    } else {
      badgeText = "○ WAITING FOR DEVICE";
      badgeSubtext = "Hardware Standby";
      badgeColor = "slate";
      globalIsLive = false;
    }

    return {
      device: {
        state: physicalState,
        displayStatus: physicalDisplayStatus,
        packetAgeSec: isPhysicalEsp32Online ? pktAge : null,
        lastHeartbeatAgeSec: isPhysicalEsp32Online ? hbAge : null,
        lastPacketAt: isPhysicalEsp32Online ? (systemStatus?.telemetry?.last_update || null) : null,
        isLive: physicalIsLive,
      },
      physicalEsp32: {
        state: physicalState,
        displayStatus: physicalDisplayStatus,
        packetAgeSec: isPhysicalEsp32Online ? pktAge : null,
        lastHeartbeatAgeSec: isPhysicalEsp32Online ? hbAge : null,
        lastPacketAt: isPhysicalEsp32Online ? (systemStatus?.telemetry?.last_update || null) : null,
        isOnline: isPhysicalEsp32Online,
        isLive: physicalIsLive,
      },
      simulator: {
        state: simulatorState,
        displayStatus: simulatorDisplayStatus,
        processStatus: simulatorRunning ? "ONLINE" : "OFFLINE",
        mqttStatus: (simulatorRunning && isMqttConnected) ? "CONNECTED" : "DISCONNECTED",
        telemetryStatus: simulatorIsLive ? "LIVE" : (simulatorRunning ? "WAITING" : "OFFLINE"),
        packetAgeSec: simulatorRunning ? pktAge : null,
        lastHeartbeatAgeSec: simulatorRunning ? hbAge : null,
        isRunning: simulatorRunning,
        isLive: simulatorIsLive,
      },
      deviceMode: devMode,
      hardwareType: hwType,
      deviceId: devId,
      mqtt: {
        state: resolvedMqttState,
        brokerHost: "HiveMQ Cloud TLS",
        brokerPort: 8883,
        brokerReachable: mqttBrokerStatus,
        sessionStatus: devMqttSessionStatus,
      },
      nodeRed: {
        state: isNodeRedOnline ? "ONLINE" : "OFFLINE",
        service: {
          status: isNodeRedOnline ? "ONLINE" : "OFFLINE",
        },
        mqtt: {
          status: nrMqttStatus,
        },
        pipeline: {
          status: (nodeRedPipelineStatus === "RECEIVING" && simulatorIsLive) ? "LIVE" : (isNodeRedOnline ? "IDLE" : "NOT_RECEIVING"),
          source: devMode,
        },
        pipelineStatus: nodeRedPipelineStatus,
        details: healthData?.node_red?.details || "Node-RED service probe status",
      },
      fastApi: {
        state: isFastApiOnline ? "ONLINE" : "OFFLINE",
      },
      postgres: {
        state: isDbConnected ? "CONNECTED" : "DISCONNECTED",
      },
      websocket: {
        state: isWsEstablished ? "ESTABLISHED" : "DISCONNECTED",
      },
      telemetrySource,
      dataProvenance,
      dataProvenanceDisplay,
      globalBadge: {
        text: badgeText,
        subtext: badgeSubtext,
        color: badgeColor,
        isLive: globalIsLive,
      },
      rawHealthData: healthData,
      refresh: fetchStatusAndHealth,
    };
  }, [systemStatus, healthData, wsConnected, apiOnline, fetchStatusAndHealth]);

  return (
    <SystemHealthContext.Provider value={authoritativeState}>
      {children}
    </SystemHealthContext.Provider>
  );
}

export function useSystemHealth(): AuthoritativeSystemHealth {
  return useContext(SystemHealthContext);
}
