"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { SystemTelemetry, ChannelData, SystemState } from "@/types/telemetry";
import { api } from "@/lib/api";

const INITIAL_SYSTEM: SystemTelemetry & { has_live_data?: boolean; packet_age_sec?: number | null } = {
  voltage: null,
  current: null,
  power: null,
  energy: null,
  frequency: null,
  power_factor: null,
  data_source: "NO LIVE DATA",
  has_live_data: false,
  packet_age_sec: null,
};

const INITIAL_CHANNELS: ChannelData[] = [1, 2, 3, 4].map((ch) => ({
  channel: ch,
  voltage: null,
  current: null,
  active_power: null,
  apparent_power: null,
  main_relay: null,
  aux_relay: null,
  relay_feedback_available: false,
  relay_feedback: "NOT AVAILABLE",
  fault_latched: false,
  last_update: null,
  load_active: null,
  status: "WAITING FOR LIVE MQTT TELEMETRY",
  fault: null,
  risk_index: null,
  data_source: "NO LIVE DATA",
  priority_level: (["CRITICAL", "IMPORTANT", "NORMAL", "NON-ESSENTIAL"] as const)[ch - 1],
  operating_hours: 0.0,
  trip_count: 0,
}));

export function useLiveTelemetry() {
  const [system, setSystem] = useState<SystemTelemetry & { has_live_data?: boolean; packet_age_sec?: number | null }>(INITIAL_SYSTEM);
  const [channels, setChannels] = useState<ChannelData[]>(INITIAL_CHANNELS);
  const [systemState, setSystemState] = useState<SystemState>("WAITING FOR LIVE MQTT TELEMETRY");
  const [loadSheddingActive, setLoadSheddingActive] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<"LIVE" | "RECONNECTING" | "OFFLINE">("LIVE");
  const [hasLiveData, setHasLiveData] = useState<boolean>(false);
  const [mqttConnected, setMqttConnected] = useState<boolean>(false);
  const [deviceOnline, setDeviceOnline] = useState<boolean>(false);
  const [apiConnected, setApiConnected] = useState<boolean>(false);
  const [websocketConnected, setWebsocketConnected] = useState<boolean>(false);
  const [hasSystemTelemetry, setHasSystemTelemetry] = useState<boolean>(false);
  const [hasChannelTelemetry, setHasChannelTelemetry] = useState<boolean>(false);
  const [esp32Status, setEsp32Status] = useState<"ONLINE" | "OFFLINE">("OFFLINE");
  const [lastHeartbeatAgeSec, setLastHeartbeatAgeSec] = useState<number | null>(null);
  const [systemConnectionStatus, setSystemConnectionStatus] = useState<string>("WAITING FOR LIVE MQTT TELEMETRY");
  const [protectionStatus, setProtectionStatus] = useState<string>("NORMAL");
  const [packetAgeSec, setPacketAgeSec] = useState<number | null>(null);
  const [activeScenario, setActiveScenario] = useState<string>("NORMAL");
  const [deviceMode, setDeviceMode] = useState<string>("SIMULATOR");
  const [hardwareType, setHardwareType] = useState<string>("ESP32-S3 SIMULATOR");
  const [deviceId, setDeviceId] = useState<string>("GRIDGUARD-ESP32-SIM-001");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Poll fallback
  const fetchPolling = useCallback(async () => {
    try {
      const [sysRes, chRes] = await Promise.all([
        api.getSystemStatus(),
        api.getChannels(),
      ]);
      setApiConnected(true);
      if (sysRes) {
        if (sysRes.telemetry) {
          setSystem(sysRes.telemetry);
          if (sysRes.telemetry.packet_age_sec !== undefined) {
            setPacketAgeSec(sysRes.telemetry.packet_age_sec);
          }
          const isLive = Boolean(sysRes.has_live_data || sysRes.telemetry.has_live_data);
          setHasLiveData(isLive);
          setHasSystemTelemetry(Boolean(sysRes.telemetry.voltage != null || isLive));
        }
        setSystemState(sysRes.system_state || "WAITING FOR LIVE MQTT TELEMETRY");
        setLoadSheddingActive(sysRes.load_shedding_active || false);
        setActiveScenario(sysRes.active_scenario || "NORMAL");
        setMqttConnected(Boolean(sysRes.mqtt_connected));
        const isPhysicalOnline = Boolean(sysRes.physical_esp32_online === true || (sysRes.device_mode === "PHYSICAL" && sysRes.esp32_online === true));
        setDeviceOnline(isPhysicalOnline);
        setEsp32Status(isPhysicalOnline ? "ONLINE" : "OFFLINE");
        if (sysRes.last_heartbeat_age_sec !== undefined) {
          setLastHeartbeatAgeSec(sysRes.last_heartbeat_age_sec);
        }
        if (sysRes.system_connection_status) {
          setSystemConnectionStatus(sysRes.system_connection_status);
        }
        if (sysRes.protection_status) {
          setProtectionStatus(sysRes.protection_status);
        }
        if (sysRes.device_mode) {
          setDeviceMode(sysRes.device_mode);
        }
        if (sysRes.hardware_type) {
          setHardwareType(sysRes.hardware_type);
        }
        if (sysRes.device_id) {
          setDeviceId(sysRes.device_id);
        }
      }
      if (Array.isArray(chRes)) {
        setChannels(chRes);
        const anyChLive = chRes.some((c: ChannelData) => c.voltage != null || c.has_live_data);
        setHasChannelTelemetry(anyChLive);
      }
      setConnectionStatus("LIVE");
    } catch {
      setApiConnected(false);
      setConnectionStatus("OFFLINE");
      setHasLiveData(false);
      setHasSystemTelemetry(false);
      setHasChannelTelemetry(false);
      setEsp32Status("OFFLINE");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    function connectWs() {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws/live";
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWebsocketConnected(true);
          setConnectionStatus("LIVE");
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);

            if (data.type === "COMMAND_STATUS" || data.type === "COMMAND_SENT") {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("gridguard_command_event", { detail: data }));
              }
            }

            if (data.system) {
              setSystem(data.system);
              if (data.system.packet_age_sec !== undefined) {
                setPacketAgeSec(data.system.packet_age_sec);
              }
              if (data.system.last_heartbeat_age_sec !== undefined) {
                setLastHeartbeatAgeSec(data.system.last_heartbeat_age_sec);
              }
              if (data.system.voltage != null) {
                setHasSystemTelemetry(true);
              }
            }

            const isPhysOnline = Boolean(
              data.physical_esp32_online === true ||
              (data.device_mode === "PHYSICAL" && data.esp32_online === true)
            );
            setEsp32Status(isPhysOnline ? "ONLINE" : "OFFLINE");
            setDeviceOnline(isPhysOnline);

            if (data.channels) {
              setChannels(data.channels);
              const anyChLive = data.channels.some((c: ChannelData) => c.voltage != null || c.has_live_data);
              setHasChannelTelemetry(anyChLive);
            }

            if (data.type === "CHANNEL_TELEMETRY" && data.channel) {
              setChannels((prev) =>
                prev.map((c) =>
                  c.channel === data.channel
                    ? {
                        ...c,
                        voltage: data.voltage ?? c.voltage,
                        current: data.current ?? c.current,
                        active_power: data.active_power ?? c.active_power,
                        apparent_power: data.apparent_power ?? c.apparent_power,
                        main_relay: data.main_relay ?? c.main_relay,
                        aux_relay: data.aux_relay ?? c.aux_relay,
                        status: data.status ?? c.status,
                        fault: data.fault ?? c.fault,
                        fault_latched: data.fault_latched ?? c.fault_latched,
                        has_live_data: true,
                      }
                    : c
                )
              );
              setHasChannelTelemetry(true);
            }

            if (data.has_live_data !== undefined) {
              setHasLiveData(Boolean(data.has_live_data));
            }
            if (data.mqtt_connected !== undefined) {
              setMqttConnected(Boolean(data.mqtt_connected));
            }
            if (data.load_shedding_active !== undefined) {
              setLoadSheddingActive(data.load_shedding_active);
            }
            if (data.scenario) {
              setActiveScenario(data.scenario);
            }
            if (data.system_connection_status) {
              setSystemConnectionStatus(data.system_connection_status);
            }
            if (data.protection_status) {
              setProtectionStatus(data.protection_status);
            }
            if (data.device_mode) {
              setDeviceMode(data.device_mode);
            }
            if (data.hardware_type) {
              setHardwareType(data.hardware_type);
            }
            if (data.device_id) {
              setDeviceId(data.device_id);
            }
            setConnectionStatus("LIVE");
          } catch (e) {
            console.warn("WebSocket parse error:", e);
          }
        };

        ws.onerror = () => {
          if (!isMounted) return;
          setWebsocketConnected(false);
          setConnectionStatus("RECONNECTING");
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWebsocketConnected(false);
          setConnectionStatus("RECONNECTING");
          reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
        };
      } catch {
        setWebsocketConnected(false);
        setConnectionStatus("OFFLINE");
      }
    }

    const init = async () => {
      await fetchPolling();
    };
    void init();
    connectWs();

    const pollInterval = setInterval(() => {
      void fetchPolling();
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchPolling]);

  return {
    system,
    channels,
    systemState,
    loadSheddingActive,
    connectionStatus,
    hasLiveData,
    mqttConnected,
    deviceOnline,
    esp32Status,
    lastHeartbeatAgeSec,
    systemConnectionStatus,
    protectionStatus,
    apiConnected,
    websocketConnected,
    hasSystemTelemetry,
    hasChannelTelemetry,
    packetAgeSec,
    activeScenario,
    deviceMode,
    hardwareType,
    deviceId,
    refresh: fetchPolling,
  };
}

