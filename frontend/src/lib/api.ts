const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`API call failed for ${endpoint}:`, err);
    throw err;
  }
}

export const api = {
  getSystemStatus: () => fetchApi<any>("/system/status"),
  getChannels: () => fetchApi<any[]>("/channels"),
  getChannelDetail: (id: number) => fetchApi<any>(`/channels/${id}`),
  getChannelHistory: (id: number) => fetchApi<any[]>(`/channels/${id}/measurements`),
  getFaults: (status?: string) => fetchApi<any[]>(status ? `/faults?status_filter=${status}` : "/faults"),
  getActiveFaults: () => fetchApi<any[]>("/faults/active"),
  acknowledgeFault: (id: string, notes?: string) => fetchApi<any>(`/faults/${id}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  }),
  resolveFault: (id: string, notes: string) => fetchApi<any>(`/faults/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  }),
  commandRelay: (channel: number, relay_type: string, action: string) => fetchApi<any>("/relays/command", {
    method: "POST",
    body: JSON.stringify({ channel, relay_type, action }),
  }),
  resetFaceAuth: (channel: number, identity: string, confidence = 0.98) => fetchApi<any>("/relays/reset-face-auth", {
    method: "POST",
    body: JSON.stringify({
      channel,
      reset_request: true,
      authentication_result: true,
      authorized_identity: identity,
      face_confidence: confidence,
      client_timestamp: new Date().toISOString(),
    }),
  }),
  getForecast: () => fetchApi<any>("/predictions"),
  getRiskScores: () => fetchApi<any[]>("/risk"),
  askAI: (query: string) => fetchApi<any>("/ai/analyze", {
    method: "POST",
    body: JSON.stringify({ query }),
  }),
  getLoadSheddingConfig: () => fetchApi<any>("/load-management/config"),
  updateLoadSheddingConfig: (config: any) => fetchApi<any>("/load-management/config", {
    method: "POST",
    body: JSON.stringify(config),
  }),
  resetLoadShedding: () => fetchApi<any>("/load-management/reset", {
    method: "POST",
  }),
  getLoadSheddingEvents: () => fetchApi<any[]>("/load-management/events"),
  getMaintenance: () => fetchApi<any[]>("/maintenance"),
  createMaintenance: (record: any) => fetchApi<any>("/maintenance", {
    method: "POST",
    body: JSON.stringify(record),
  }),
  getNotifications: () => fetchApi<any[]>("/notifications"),
  markNotificationRead: (id: number) => fetchApi<any>(`/notifications/${id}/read`, { method: "POST" }),
  getSystemHealth: () => fetchApi<any>("/system-health"),
  getSettings: () => fetchApi<any>("/settings"),
  updateSettings: (settings: any) => fetchApi<any>("/settings", {
    method: "POST",
    body: JSON.stringify(settings),
  }),
  getAuditLogs: () => fetchApi<any[]>("/audit-logs"),
  setDemoScenario: (scenario: string, channel = 2) => fetchApi<any>("/demo/scenario", {
    method: "POST",
    body: JSON.stringify({ scenario, channel }),
  }),
  getDemoStatus: () => fetchApi<any>("/demo/status"),
  getEventTimeline: (limit = 50) => fetchApi<any[]>(`/events/timeline?limit=${limit}`),
  tripChannel: (
    channel: number,
    optionsOrAuth?: string | { command?: string; channel?: number; authorized_by?: string; authorization_id?: string; correlation_id?: string },
    authorization_id = "TRIP-001",
    correlation_id?: string
  ) => {
    let authBy = "WEBSITE_OPERATOR";
    let authId = authorization_id;
    let corrId = correlation_id;
    if (typeof optionsOrAuth === "object" && optionsOrAuth !== null) {
      authBy = optionsOrAuth.authorized_by || authBy;
      authId = optionsOrAuth.authorization_id || authId;
      corrId = optionsOrAuth.correlation_id || corrId;
    } else if (typeof optionsOrAuth === "string") {
      authBy = optionsOrAuth;
    }
    const finalCorr = corrId || `CH${channel}-TRIP-${Date.now().toString().slice(-4)}`;
    return fetchApi<any>(`/channels/${channel}/trip`, {
      method: "POST",
      body: JSON.stringify({
        command: "TRIP_CHANNEL",
        channel,
        authorized_by: authBy,
        authorization_id: authId,
        correlation_id: finalCorr,
      }),
    });
  },
  resetChannelCommand: (channel: number, authorized_by = "WEBSITE_OPERATOR", authorization_id = "AUTH-001", correlation_id?: string) => {
    const corrId = correlation_id || `CH${channel}-RESET-${Date.now().toString().slice(-4)}`;
    return fetchApi<any>(`/channels/${channel}/reset`, {
      method: "POST",
      body: JSON.stringify({
        command: "RESET",
        channel,
        authorized_by,
        authorization_id,
        correlation_id: corrId
      }),
    });
  },
  getCommandStatus: (correlation_id: string) => fetchApi<any>(`/commands/status/${correlation_id}`),

  // Biometric Face Authentication & Authorized Reset/Trip (Sections 15-22, 40)
  startFaceVerification: (channel_id?: number, fault_id?: string, requested_by?: string, channel_ids?: number[], action_type?: string) => {
    const ids = channel_ids && channel_ids.length > 0 ? channel_ids : (channel_id ? [channel_id] : [1]);
    return fetchApi<any>("/face/verification/start", {
      method: "POST",
      body: JSON.stringify({
        channel_id: ids[0],
        channel_ids: ids,
        action_type: action_type || "RESET",
        fault_id: fault_id || "FLT-CURRENT-LATCHED",
        requested_by: requested_by || "Lead Operator"
      }),
    });
  },
  verifyFaceFrame: (frame_base64: string) =>
    fetchApi<any>("/face/verification/verify-frame", {
      method: "POST",
      body: JSON.stringify({ frame_base64 }),
    }),
  completeFaceVerification: (request_id: string, frames_base64: string[], client_session_id?: string) =>
    fetchApi<any>("/face/verification/complete", {
      method: "POST",
      body: JSON.stringify({ request_id, frames_base64, client_session_id }),
    }),
  authorizeReset: (reset_authorization_token: string, channel_id?: number, fault_id?: string, channel_ids?: number[]) => {
    const ids = channel_ids && channel_ids.length > 0 ? channel_ids : (channel_id ? [channel_id] : [1]);
    return fetchApi<any>("/reset/authorize", {
      method: "POST",
      body: JSON.stringify({
        reset_authorization_token,
        channel_id: ids[0],
        channel_ids: ids,
        fault_id
      }),
    });
  },
  executeReset: (reset_authorization_token: string, channel_id?: number, channel_ids?: number[]) => {
    const ids = channel_ids && channel_ids.length > 0 ? channel_ids : (channel_id ? [channel_id] : [1]);
    return fetchApi<any>("/reset/execute", {
      method: "POST",
      body: JSON.stringify({
        reset_authorization_token,
        channel_id: ids[0],
        channel_ids: ids
      }),
    });
  },
  authorizeTrip: (authorization_token: string, channel_ids: number[], reason = "SCHEDULED_MAINTENANCE") => {
    return fetchApi<any>("/trip/authorize", {
      method: "POST",
      body: JSON.stringify({
        authorization_token,
        channel_id: channel_ids[0],
        channel_ids,
        reason
      }),
    });
  },
  executeTrip: (authorization_token: string, channel_ids: number[], reason = "SCHEDULED_MAINTENANCE") => {
    return fetchApi<any>("/trip/execute", {
      method: "POST",
      body: JSON.stringify({
        authorization_token,
        channel_id: channel_ids[0],
        channel_ids,
        reason
      }),
    });
  },
  getBiometricUsers: () => fetchApi<any[]>("/face/users"),
  enrollBiometricUser: (data: { user_id: string; display_name: string; role: string; frames_base64: string[] }) =>
    fetchApi<any>("/face/enrollment/verify", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  disableBiometricUser: (user_id: string) =>
    fetchApi<any>(`/face/users/${user_id}/disable`, { method: "POST" }),
  getBiometricAudit: (limit = 50) => fetchApi<any[]>(`/face/audit?limit=${limit}`),
  getBiometricMetrics: () => fetchApi<any>("/face/metrics"),
  getThreshold: () => fetchApi<any>("/face/threshold"),
  updateThreshold: (threshold: number, reason: string) =>
    fetchApi<any>("/face/threshold", {
      method: "POST",
      body: JSON.stringify({ threshold, reason }),
    }),
  startEnrollmentSession: (user_id: string, display_name: string, role: string) =>
    fetchApi<any>("/face/enrollment/session/start", {
      method: "POST",
      body: JSON.stringify({ user_id, display_name, role }),
    }),
  validateEnrollmentSample: (params: {
    frame_base64?: string;
    frames_base64?: string[];
    sample_step: number;
    session_id?: string;
  } | string, sample_step?: number) => {
    const body = typeof params === "string"
      ? { frame_base64: params, sample_step: sample_step || 1 }
      : params;
    return fetchApi<any>("/face/enrollment/validate-sample", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  evaluateAntiSpoof: (frames_base64: string[], claimed_type: string) =>
    fetchApi<any>("/face/anti-spoof/evaluate", {
      method: "POST",
      body: JSON.stringify({ frames_base64, claimed_type }),
    }),
  submitEnrollment: (data: {
    user_id: string;
    display_name: string;
    role: string;
    samples_base64: string[];
    session_id?: string;
  }) =>
    fetchApi<any>("/face/enrollment/verify", {
      method: "POST",
      body: JSON.stringify({
        user_id: data.user_id,
        display_name: data.display_name,
        role: data.role,
        frames_base64: data.samples_base64,
        session_id: data.session_id,
      }),
    }),
  testAntiSpoof: (data: { frame_base64: string; claimed_type: string }) =>
    fetchApi<any>("/face/anti-spoof/evaluate", {
      method: "POST",
      body: JSON.stringify({
        frames_base64: [data.frame_base64],
        claimed_type: data.claimed_type,
      }),
    }),
  getForensicTimeline: (correlation_id: string) => fetchApi<any>(`/face/forensics/${correlation_id}`),

  // Admin User Management (Sections 1-20)
  getUsers: () => fetchApi<any[]>("/users"),
  getUserDetail: (id: string) => fetchApi<any>(`/users/${id}`),
  createUser: (data: { user_id: string; display_name: string; role: string }) =>
    fetchApi<any>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateUser: (id: string, data: { display_name?: string; role?: string; status?: string }) =>
    fetchApi<any>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteUser: (id: string) =>
    fetchApi<any>(`/users/${id}`, {
      method: "DELETE",
    }),
  enableUser: (id: string) =>
    fetchApi<any>(`/users/${id}/enable`, {
      method: "POST",
    }),
  disableUser: (id: string) =>
    fetchApi<any>(`/users/${id}/disable`, {
      method: "POST",
    }),
  reenrollUser: (id: string) =>
    fetchApi<any>(`/users/${id}/reenroll`, {
      method: "POST",
    }),

  // Exhibition Demo Mode APIs (Sections 8-19)
  injectDemoAction: (action: string, channel: number | number[] = 2) => {
    const payload = Array.isArray(channel)
      ? { action, channel: channel[0], channel_ids: channel, channels: channel }
      : { action, channel, channel_ids: [channel], channels: [channel] };
    return fetchApi<any>("/demo/action", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  executeDemoReset: (operator_name = "Authorized Operator", channel_ids?: number[] | number) => {
    const ids = Array.isArray(channel_ids) ? channel_ids : (channel_ids ? [channel_ids] : undefined);
    return fetchApi<any>("/demo/reset", {
      method: "POST",
      body: JSON.stringify({ operator_name, channel_ids: ids }),
    });
  },
  executeDemoTrip: (channel_ids: number[] | number, operator_name = "Authorized Operator") => {
    const ids = Array.isArray(channel_ids) ? channel_ids : [channel_ids];
    return fetchApi<any>("/demo/trip", {
      method: "POST",
      body: JSON.stringify({ operator_name, channel_ids: ids }),
    });
  },

  // ESP32 Hardware Simulator & Device Validation APIs (Sections 2-4, 16-17, 34, 38)
  getSimulatorStatus: () => fetchApi<any>("/simulator/status"),
  startSimulator: () => fetchApi<any>("/simulator/start", { method: "POST" }),
  stopSimulator: () => fetchApi<any>("/simulator/stop", { method: "POST" }),
  setSimulatorOffline: () => fetchApi<any>("/simulator/offline", { method: "POST" }),
  setSimulatorOnline: () => fetchApi<any>("/simulator/online", { method: "POST" }),
  setSimulatorScenario: (scenario: string) => fetchApi<any>("/simulator/scenario", {
    method: "POST",
    body: JSON.stringify({ scenario }),
  }),
  setSimulatorChannelPower: (channel: number, active_power: number) => fetchApi<any>("/simulator/channel-power", {
    method: "POST",
    body: JSON.stringify({ channel, active_power }),
  }),
  setDeviceMode: (mode: string) => fetchApi<any>(`/device/mode?mode=${encodeURIComponent(mode)}`, {
    method: "POST",
  }),

  // Hardware Commissioning Workflow (20 Steps)
  getCommissioningStatus: () => fetchApi<any>("/commissioning/status"),
  startCommissioning: () => fetchApi<any>("/commissioning/start", { method: "POST" }),
  executeCommissioningStep: (stepId: number, passed?: boolean, notes = "") =>
    fetchApi<any>(`/commissioning/step/${stepId}/execute?${passed !== undefined ? `passed=${passed}&` : ""}notes=${encodeURIComponent(notes)}`, { method: "POST" }),
  validateCommissioningPower: (channel: number, referencePower: number) =>
    fetchApi<any>(`/commissioning/power-validation?channel=${channel}&reference_power=${referencePower}`, { method: "POST" }),
  testCommissioningRelay: (channel: number, relayType: "MAIN" | "AUX", action: "ON" | "OFF", operatorConfirmed: boolean) =>
    fetchApi<any>(`/commissioning/relay-test?channel=${channel}&relay_type=${relayType}&action=${action}&operator_confirmed=${operatorConfirmed}`, { method: "POST" }),
  completeCommissioning: () => fetchApi<any>("/commissioning/complete", { method: "POST" }),
};




