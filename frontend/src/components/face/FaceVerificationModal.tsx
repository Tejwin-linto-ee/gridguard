"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ShieldCheck, Lock, Unlock, CheckCircle2, AlertOctagon,
  X, RefreshCw, UserCheck, ShieldAlert, Sparkles, Activity, AlertTriangle, Cpu
} from "lucide-react";
import { api } from "@/lib/api";
import { FaceCamera } from "./FaceCamera";

interface FaceVerificationModalProps {
  channel?: number;
  channels?: number[];
  faultType?: string;
  measuredCurrent?: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type VerificationStep =
  | "STANDBY"
  | "CAMERA_ACTIVE"
  | "ANALYZING"
  | "AUTHORIZED"
  | "CONFIRMATION"
  | "SAFETY_CHECK_PASSED"
  | "SAFETY_CHECK_BLOCKED"
  | "DENIED"
  | "RESETTING"
  | "COMPLETED";

export function FaceVerificationModal({
  channel: initialChannel,
  channels: initialChannels,
  faultType = "OVERCURRENT",
  measuredCurrent = 3.45,
  isOpen,
  onClose,
  onSuccess,
}: FaceVerificationModalProps) {
  // Support selective multi-channel reset
  const [selectedChannels, setSelectedChannels] = useState<number[]>(() => {
    if (initialChannels && initialChannels.length > 0) return initialChannels;
    if (initialChannel) return [initialChannel];
    return [1];
  });
  const [step, setStep] = useState<VerificationStep>("STANDBY");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Live HUD state from real-time feedback
  const [qualityScore, setQualityScore] = useState<number>(0.0);
  const [guidance, setGuidance] = useState<string>("Align face inside the reticle");
  const [livenessHint, setLivenessHint] = useState<string>("WAITING");
  const [faceCount, setFaceCount] = useState<number>(0);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [diagMetrics, setDiagMetrics] = useState<any>({
    raw_detections: 0,
    post_nms_detections: 0,
    post_duplicate_detections: 0,
    stable_tracks_count: 0,
    tracking_stability: 0.0,
    detector_name: "OpenCV-Haar-v4.14.0-NMS-Tracked",
  });

  // Verification results
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);
  const [channelEvaluations, setChannelEvaluations] = useState<any[]>([]);
  const [resetResults, setResetResults] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Frame buffer for multi-frame temporal analysis
  const frameBufferRef = useRef<string[]>([]);
  const isAnalyzingRef = useRef<boolean>(false);
  const [bufferedCount, setBufferedCount] = useState<number>(0);

  useEffect(() => {
    if (initialChannels && initialChannels.length > 0) {
      setSelectedChannels(initialChannels);
    } else if (initialChannel) {
      setSelectedChannels([initialChannel]);
    }
  }, [initialChannel, initialChannels]);

  const toggleChannelSelection = (ch: number) => {
    if (step !== "STANDBY") return;
    setSelectedChannels((prev) => {
      if (prev.includes(ch)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter((c) => c !== ch);
      } else {
        return [...prev, ch].sort((a, b) => a - b);
      }
    });
  };

  useEffect(() => {
    if (!isOpen) {
      setStep("STANDBY");
      setSessionId(null);
      setVerificationResult(null);
      setSafetyMessage(null);
      setErrorMessage(null);
      frameBufferRef.current = [];
      setBufferedCount(0);
      isAnalyzingRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Step 1: Initialize reset session with selected channels
  const handleStartVerification = async () => {
    setErrorMessage(null);
    try {
      const res = await api.startFaceVerification(selectedChannels[0], faultType, "Lead Operator", selectedChannels);
      setSessionId(res.request_id);
      frameBufferRef.current = [];
      setBufferedCount(0);
      isAnalyzingRef.current = false;
      setStep("CAMERA_ACTIVE");
    } catch (err: any) {
      setErrorMessage(`Session initialization failed: ${err.message || "Network error."}`);
    }
  };

  // Step 2: Handle incoming camera frames
  const handleFrameCapture = async (frameBase64: string) => {
    if (step !== "CAMERA_ACTIVE" || isAnalyzingRef.current) return;

    // Buffer temporal frames
    frameBufferRef.current.push(frameBase64);
    if (frameBufferRef.current.length > 5) {
      frameBufferRef.current.shift();
    }
    setBufferedCount(frameBufferRef.current.length);

    // Fast HUD feedback
    try {
      const fb = await api.verifyFaceFrame(frameBase64);
      setFaceCount(fb.face_count);
      setQualityScore(fb.quality_score);
      setGuidance(fb.guidance);
      setLivenessHint(fb.liveness_hint);
      setDiagMetrics({
        raw_detections: fb.raw_detections ?? 0,
        post_nms_detections: fb.post_nms_detections ?? 0,
        post_duplicate_detections: fb.post_duplicate_detections ?? 0,
        stable_tracks_count: fb.stable_tracks_count ?? 0,
        tracking_stability: fb.tracking_stability ?? 0.0,
        detector_name: fb.detector_name ?? "OpenCV-Haar-v4.14.0-NMS-Tracked",
      });

      // Once we have at least 3 quality frames and face is aligned, trigger complete verification!
      if (
        fb.face_detected &&
        fb.face_count === 1 &&
        fb.quality_score >= 0.65 &&
        frameBufferRef.current.length >= 3 &&
        !isAnalyzingRef.current
      ) {
        triggerCompleteVerification();
      }
    } catch (err) {
      // transient frame processing error
    }
  };

  // Step 3: Trigger multi-frame server-authoritative verification
  const triggerCompleteVerification = async () => {
    if (!sessionId || isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    setStep("ANALYZING");

    try {
      const payloadFrames = [...frameBufferRef.current];
      const res = await api.completeFaceVerification(sessionId, payloadFrames);
      setVerificationResult(res);

      if (res.authorized && res.reset_authorization_token) {
        // Person is verified! Transition to confirmation popup step first
        setStep("CONFIRMATION");
      } else {
        setStep("DENIED");
        setErrorMessage(res.failure_reason || "Verification rejected.");
      }
    } catch (err: any) {
      setStep("DENIED");
      setErrorMessage(`Biometric verification failed: ${err.message || "Server error."}`);
    } finally {
      isAnalyzingRef.current = false;
    }
  };

  // Step 4: After operator confirms in popup, perform pre-closure electrical safety checks
  const handleProceedAfterConfirmation = async () => {
    if (!verificationResult || !verificationResult.reset_authorization_token) return;

    try {
      const safetyRes = await api.authorizeReset(
        verificationResult.reset_authorization_token,
        selectedChannels[0],
        faultType,
        selectedChannels
      );

      setChannelEvaluations(safetyRes.channel_evaluations || []);
      setSafetyMessage(safetyRes.message);

      if (safetyRes.safety_passed) {
        setStep("SAFETY_CHECK_PASSED");
      } else {
        setStep("SAFETY_CHECK_BLOCKED");
      }
    } catch (err: any) {
      setStep("DENIED");
      setErrorMessage(`Pre-closure safety validation failed: ${err.message || "Network error."}`);
    }
  };

  // Step 5: Execute final reset and automated Main+Aux restoration
  const handleExecuteReset = async () => {
    if (!verificationResult || !verificationResult.reset_authorization_token) return;

    setStep("RESETTING");
    try {
      const res = await api.executeReset(
        verificationResult.reset_authorization_token,
        selectedChannels[0],
        selectedChannels
      );

      setResetResults(res.results || []);

      if (res.success) {
        setStep("COMPLETED");
        onSuccess();
        setTimeout(() => {
          onClose();
        }, 2500);
      } else {
        setStep("SAFETY_CHECK_BLOCKED");
        setErrorMessage(res.message || "Some channels could not be safely reset.");
      }
    } catch (err: any) {
      setStep("DENIED");
      setErrorMessage(`Reset execution failed: ${err.message || "Unable to close relays."}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-xl bg-white border border-[#E2E8F0] shadow-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                  BIOMETRIC RESET AUTHORIZATION GATE
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  SECTION 25 COMPLIANT
                </span>
              </div>
              <p className="text-xs text-[#64748B]">
                Authoritative in-website facial verification & safety reset gate
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#64748B] hover:text-[#172033] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Fault Summary Card with Multi-Channel Selection */}
          <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#64748B] uppercase font-bold">SELECT CHANNELS TO RESET</span>
                <div className="text-xs font-bold text-[#172033] mt-0.5">
                  {selectedChannels.length === 1 ? `Channel ${selectedChannels[0]}` : `Channels: ${selectedChannels.join(", ")}`}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#64748B] uppercase font-bold">FAULT EVENT</span>
                <div className="text-xs font-bold text-red-700 mt-0.5">{faultType}</div>
              </div>
            </div>

            {/* Interactive Channel Selection Pills */}
            <div className="flex items-center gap-2 pt-2 border-t border-[#E2E8F0]">
              <span className="text-[11px] text-[#475569] font-medium">Target Channels:</span>
              {[1, 2, 3, 4].map((ch) => {
                const isSelected = selectedChannels.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannelSelection(ch)}
                    disabled={step !== "STANDBY"}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all border cursor-pointer ${
                      isSelected
                        ? "bg-blue-50 text-blue-700 border-blue-300"
                        : "bg-white text-[#64748B] border-[#CBD5E1] hover:border-slate-400"
                    }`}
                  >
                    CH {ch} {isSelected ? "✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* STANDBY STEP: Authorization Required Callout */}
          {step === "STANDBY" && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-600">
                <Lock className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-sm font-bold text-[#172033] uppercase">
                  Biometric Face Authorization Required
                </h3>
                <p className="text-xs text-[#475569] leading-relaxed">
                  Electrical safety policies prohibit manual relay re-closure while a fault is latched.
                  Position your face in the camera frame to verify operator authorization for selected channel(s).
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs text-left font-medium">
                  {errorMessage}
                </div>
              )}

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartVerification}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  Start In-Website Face Verification
                </button>
              </div>
            </div>
          )}

          {/* ACTIVE CAMERA STEP: Live Camera */}
          {(step === "CAMERA_ACTIVE" || step === "ANALYZING") && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-[#E2E8F0]">
                <FaceCamera
                  active={step === "CAMERA_ACTIVE" || step === "ANALYZING"}
                  onFrameCapture={handleFrameCapture}
                  qualityScore={qualityScore}
                  guidanceText={
                    step === "ANALYZING"
                      ? "ANALYZING EMBEDDINGS & LIVENESS..."
                      : guidance
                  }
                  livenessHint={
                    step === "ANALYZING" ? "EVALUATING" : livenessHint
                  }
                  faceCount={faceCount}
                />
              </div>

              {/* Dev Diagnostics Toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="text-[11px] text-[#64748B] hover:text-blue-600 flex items-center gap-1.5 transition-colors cursor-pointer font-medium"
                >
                  <Cpu className="w-3.5 h-3.5 text-blue-600" />
                  <span>{showDiagnostics ? "HIDE BIOMETRIC ENGINE DIAGNOSTICS [-]" : "SHOW BIOMETRIC ENGINE DIAGNOSTICS [+]"}</span>
                </button>

                {showDiagnostics && (
                  <div className="mt-2 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[10px] text-[#475569] space-y-2">
                    <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-1.5 font-bold">
                      <span className="text-blue-700 uppercase">BIOMETRIC ENGINE DIAGNOSTICS</span>
                      <span className="text-[9px] text-green-800 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">ACTIVE</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <span className="text-[#64748B] block">Detector</span>
                        <span className="text-[#172033] font-bold truncate block">{diagMetrics.detector_name}</span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">Raw Detections</span>
                        <span className="text-[#172033] font-bold">{diagMetrics.raw_detections}</span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">After NMS</span>
                        <span className="text-blue-700 font-bold">{diagMetrics.post_nms_detections}</span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">After Dup Suppress</span>
                        <span className="text-green-700 font-bold">{diagMetrics.post_duplicate_detections}</span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">Stable Tracks</span>
                        <span className={diagMetrics.stable_tracks_count === 1 ? "text-green-700 font-bold" : "text-amber-700 font-bold"}>
                          {diagMetrics.stable_tracks_count}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">Tracking Stability</span>
                        <span className={diagMetrics.tracking_stability >= 0.70 ? "text-green-700 font-bold" : "text-amber-700 font-bold"}>
                          {(diagMetrics.tracking_stability * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">Quality</span>
                        <span className={qualityScore >= 0.65 ? "text-green-700 font-bold" : "text-amber-700 font-bold"}>
                          {(qualityScore * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block">Liveness</span>
                        <span className={livenessHint === "FACE_ACQUIRED" ? "text-green-700 font-bold" : "text-blue-700 font-bold"}>
                          {livenessHint}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-[#E2E8F0] flex items-center justify-between text-[9px] text-[#64748B]">
                      <div>
                        <span>State: </span>
                        <span className="font-bold text-[#172033]">{step}</span>
                      </div>
                      <span>Privacy Guard: Zero Raw Images Retained</span>
                    </div>
                  </div>
                )}
              </div>

              {step === "ANALYZING" && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center gap-2 text-xs text-blue-800 font-medium">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  <span>
                    Executing 512-D FaceNet embedding extraction & temporal anti-spoof analysis...
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep("STANDBY")}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel Scan
                </button>
                <button
                  type="button"
                  onClick={triggerCompleteVerification}
                  disabled={bufferedCount < 2 || step === "ANALYZING"}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Verify Face Now
                </button>
              </div>
            </div>
          )}

          {/* CONFIRMATION STEP: Identity Verified, Operator Confirmation Popup */}
          {step === "CONFIRMATION" && verificationResult && (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-600">
                <UserCheck className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#172033] uppercase">
                  Operator Identity Verified
                </h3>
                <p className="text-xs text-blue-700 font-semibold mt-0.5">
                  Operator: <strong>{verificationResult.display_name}</strong> ({verificationResult.user_id}) • Role: {verificationResult.role}
                </p>
              </div>

              {/* Confirmation Prompt Card */}
              <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 text-xs text-left">
                <div className="flex items-center gap-2 text-amber-800 font-bold uppercase text-[11px]">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>RESET CONFIRMATION REQUIRED</span>
                </div>
                <p className="text-[#172033] leading-relaxed">
                  Are you sure you want to reset the protection relays for Channel(s) <strong className="font-bold">{selectedChannels.join(", ")}</strong>?
                </p>
                <p className="text-[11px] text-[#64748B]">
                  Upon confirmation, the system will perform electrical safety re-checks. If safe, Main Relay followed automatically by Auxiliary Relay will be energized.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProceedAfterConfirmation}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  OK, Proceed with Safety Check
                </button>
              </div>
            </div>
          )}

          {/* SUCCESS STEP: Safety Check Passed */}
          {step === "SAFETY_CHECK_PASSED" && verificationResult && (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto text-green-600">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#172033] uppercase">
                  Biometric Authorization &amp; Safety Approved
                </h3>
                <p className="text-xs text-green-700 font-semibold mt-0.5">
                  Target: <strong>Channels {selectedChannels.join(", ")}</strong> • Operator: <strong>{verificationResult.display_name}</strong>
                </p>
              </div>

              {/* Per-Channel Safety Evaluations */}
              <div className="bg-[#F8FAFC] rounded-lg p-3.5 border border-[#E2E8F0] space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-1.5">
                  <span className="text-[#64748B] font-bold uppercase text-[10px]">
                    ELECTRICAL PRE-CLOSURE SAFETY MATRIX
                  </span>
                  <span className="text-[10px] text-green-800 font-bold bg-green-50 px-2 py-0.5 rounded border border-green-200">
                    SAFE TO RESTORE
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] text-left">
                  {selectedChannels.map((ch) => {
                    const evalItem = channelEvaluations.find((e) => e.channel_id === ch);
                    const passed = evalItem ? evalItem.safety_passed : true;
                    return (
                      <div key={ch} className="flex items-center justify-between p-2 rounded-md bg-white border border-[#E2E8F0]">
                        <span className="text-[#172033] font-semibold">Channel {ch} (Main + Aux Relay Pair):</span>
                        <span className={passed ? "text-green-700 font-bold" : "text-red-700 font-bold"}>
                          {passed ? "✓ VOLTAGE NOMINAL & SAFE" : "✗ SAFETY FAILED"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteReset}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  Restore Main + Aux Relays &amp; Unlatch
                </button>
              </div>
            </div>
          )}

          {/* SAFETY BLOCKED STEP: Identity Verified, but Safety Conditions Unsafe */}
          {step === "SAFETY_CHECK_BLOCKED" && (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                <AlertTriangle className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-amber-800 uppercase">
                  SAFETY CONDITION ACTIVE
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Identity Verified // Electrical Safety FAILED → RESET BLOCKED
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs text-left space-y-1.5 font-medium">
                <div className="font-bold">{safetyMessage}</div>
                <p className="text-[11px] text-amber-800">
                  To prevent equipment destruction or fire hazard, biometric identity cannot override active electrical violations. Line conditions must be stabilized first.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-[#475569] hover:bg-slate-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Acknowledge &amp; Maintain Latch
              </button>
            </div>
          )}

          {/* DENIED STEP */}
          {step === "DENIED" && (
            <div className="space-y-4 text-center py-2">
              <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto text-red-600">
                <AlertOctagon className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-red-700 uppercase">
                  {errorMessage?.includes("SPOOF")
                    ? "SPOOF DETECTED"
                    : errorMessage?.includes("ACCOUNT_DISABLED")
                    ? "DISABLED USER MATCHED"
                    : "UNKNOWN PERSON"}
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {errorMessage?.includes("SPOOF")
                    ? "Face Detected // Liveness Failed → RESET BLOCKED"
                    : errorMessage?.includes("ACCOUNT_DISABLED")
                    ? "Identity Matched // Account Disabled → RESET BLOCKED"
                    : "Face Detected // Liveness Passed // Identity Failed → RESET BLOCKED"}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs text-left font-medium">
                {errorMessage || "Face does not match any enrolled authorized operator, or spoof was detected."}
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setStep("STANDBY")}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* RESETTING STEP */}
          {step === "RESETTING" && (
            <div className="py-8 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <div className="text-sm font-bold text-[#172033]">
                Dispatching Authorized Reset via MQTT...
              </div>
              <p className="text-xs text-[#64748B]">
                ESP32 executing automated Main Relay then Auxiliary Relay closure sequence for Channel(s) {selectedChannels.join(", ")}.
              </p>
            </div>
          )}

          {/* COMPLETED STEP */}
          {step === "COMPLETED" && (
            <div className="py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 border border-green-200 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-green-700">
                Channels [{selectedChannels.join(", ")}] Reset Successful
              </div>
              <p className="text-xs text-[#64748B]">
                Main and Auxiliary relay pairs restored. Fault latches cleared. Telemetry awaiting live confirmation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
