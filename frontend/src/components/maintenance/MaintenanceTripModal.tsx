"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ShieldAlert, AlertTriangle, CheckCircle2, X, RefreshCw,
  Camera, Lock, ShieldCheck, PowerOff, ArrowRight
} from "lucide-react";
import { api } from "@/lib/api";
import { FaceCamera } from "@/components/face/FaceCamera";

interface MaintenanceTripModalProps {
  selectedChannels: number[];
  allChannels?: number[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type TripStep =
  | "CONFIRMATION"
  | "CAMERA_ACTIVE"
  | "ANALYZING"
  | "AUTHORIZED"
  | "TRIPPING"
  | "RESULT"
  | "ERROR";

export function MaintenanceTripModal({
  selectedChannels,
  allChannels = [1, 2, 3, 4],
  isOpen,
  onClose,
  onSuccess,
}: MaintenanceTripModalProps) {
  const [step, setStep] = useState<TripStep>("CONFIRMATION");
  const [requestId, setRequestId] = useState<string | null>(null);

  // Unaffected channels calculation
  const unaffectedChannels = allChannels.filter((c) => !selectedChannels.includes(c));

  // Biometric state
  const [qualityScore, setQualityScore] = useState<number>(0.0);
  const [guidance, setGuidance] = useState<string>("Align face inside the reticle");
  const [livenessHint, setLivenessHint] = useState<string>("WAITING");
  const [faceCount, setFaceCount] = useState<number>(0);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Frames buffer
  const frameBufferRef = useRef<string[]>([]);
  const isAnalyzingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setStep("CONFIRMATION");
      setRequestId(null);
      setVerificationResult(null);
      setExecutionResult(null);
      setErrorMessage(null);
      frameBufferRef.current = [];
      isAnalyzingRef.current = false;
    }
  }, [isOpen]);

  // Step 1 -> Step 2: User confirms and continues to Face Authentication
  const handleProceedToFaceAuth = async () => {
    try {
      setStep("CAMERA_ACTIVE");
      frameBufferRef.current = [];
      const res = await api.startFaceVerification(
        selectedChannels[0],
        "MAINTENANCE-TRIP",
        "Lead Operator",
        selectedChannels,
        "TRIP"
      );
      setRequestId(res.request_id);
    } catch (err: any) {
      setStep("ERROR");
      setErrorMessage(err.message || "Failed to initialize biometric authorization session.");
    }
  };

  // Process live frames for feedback & buffer accumulation
  const handleFrameCapture = async (frameBase64: string) => {
    if (step !== "CAMERA_ACTIVE" && step !== "ANALYZING") return;

    if (frameBufferRef.current.length < 5) {
      frameBufferRef.current.push(frameBase64);
    }

    try {
      const fb = await api.verifyFaceFrame(frameBase64);
      if (fb) {
        setQualityScore(fb.quality_score || 0.0);
        setGuidance(fb.guidance || "Hold steady");
        setLivenessHint(fb.liveness_hint || "VERIFYING");
        setFaceCount(fb.face_count || 0);

        // Auto-complete verification if quality is solid and 5 frames buffered
        if (
          fb.face_detected &&
          fb.quality_score >= 0.70 &&
          frameBufferRef.current.length >= 4 &&
          !isAnalyzingRef.current &&
          requestId
        ) {
          triggerCompleteVerification();
        }
      }
    } catch (err) {
      // Non-blocking real-time feedback error
    }
  };

  // Complete face verification with server
  const triggerCompleteVerification = async () => {
    if (!requestId || isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    setStep("ANALYZING");

    try {
      const frames = frameBufferRef.current.length > 0 ? frameBufferRef.current : ["mock-frame"];
      const res = await api.completeFaceVerification(requestId, frames, "scada-maintenance-client");

      if (res.authorized && res.reset_authorization_token) {
        setVerificationResult(res);
        setStep("AUTHORIZED");
      } else {
        setStep("ERROR");
        setErrorMessage(res.message || res.failure_reason || "Biometric identity verification denied.");
      }
    } catch (err: any) {
      setStep("ERROR");
      setErrorMessage(err.message || "Face recognition server verification failed.");
    } finally {
      isAnalyzingRef.current = false;
    }
  };

  // Step 4 -> Step 5: Execute maintenance trip with validated token
  const handleExecuteTrip = async () => {
    if (!verificationResult || !verificationResult.reset_authorization_token) return;
    setStep("TRIPPING");

    try {
      // 1. Authorize trip pre-check
      const authRes = await api.authorizeTrip(
        verificationResult.reset_authorization_token,
        selectedChannels,
        "SCHEDULED_MAINTENANCE"
      );

      if (!authRes.trip_permitted) {
        setStep("ERROR");
        setErrorMessage(authRes.message || "Pre-trip safety check blocked the operation.");
        return;
      }

      // 2. Execute trip command
      const execRes = await api.executeTrip(
        verificationResult.reset_authorization_token,
        selectedChannels,
        "SCHEDULED_MAINTENANCE"
      );

      setExecutionResult(execRes);
      setStep("RESULT");
      onSuccess();
    } catch (err: any) {
      setStep("ERROR");
      setErrorMessage(err.message || "Maintenance trip execution failed on backend.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150 font-mono">
      <div className="relative w-full max-w-xl rounded-xl bg-white border border-[#E2E8F0] shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
              <PowerOff className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-[#172033] uppercase tracking-wider block">
                MAINTENANCE TRIP AUTHORIZATION
              </span>
              <span className="text-[10px] text-[#64748B]">
                Multi-Channel Relay De-energization (Main + Aux Pair)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#64748B] hover:text-[#172033] hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* STEP 1: PRE-OPERATION CONFIRMATION (Part 2) */}
          {step === "CONFIRMATION" && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 space-y-2">
                <div className="font-bold text-sm text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>SAFETY WARNING — PROCEED WITH CAUTION</span>
                </div>
                <p className="text-[11px] text-red-700">
                  You are about to initiate a controlled maintenance trip. This action will immediately de-energize the selected channels.
                </p>
              </div>

              {/* Selected Channels Affected */}
              <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <span className="text-[#64748B] uppercase text-[10px] font-bold block">
                  You are about to trip:
                </span>
                <ul className="space-y-1 pl-2">
                  {selectedChannels.map((ch) => (
                    <li key={ch} className="text-[#172033] font-bold flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                      <span>Channel {ch}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Specific Hardware Relay Pairs De-energized */}
              <div className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                <span className="text-[#64748B] uppercase text-[10px] font-bold block">
                  This will de-energize:
                </span>
                <ul className="space-y-1 pl-2 text-[#172033]">
                  {selectedChannels.map((ch) => (
                    <li key={ch} className="flex items-center gap-2">
                      <span className="text-red-700 font-bold">CH{ch}</span>
                      <span>Main Relay (OPEN) + Auxiliary Relay (OPEN)</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Unaffected Channels Clarification */}
              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] text-[#64748B]">
                {unaffectedChannels.length > 0 ? (
                  <div className="flex items-center gap-2 text-green-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Channel {unaffectedChannels.join(", ")} will <strong>NOT</strong> be affected.
                    </span>
                  </div>
                ) : (
                  <span className="text-amber-700 font-semibold">All 4 channels will be de-energized.</span>
                )}
              </div>

              {/* Confirmation Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#172033] text-xs font-semibold transition-colors cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={handleProceedToFaceAuth}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <span>CONTINUE TO FACE AUTHENTICATION</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CAMERA BIOMETRIC VERIFICATION (Part 3) */}
          {(step === "CAMERA_ACTIVE" || step === "ANALYZING") && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[11px] text-[#64748B] border-b border-[#E2E8F0] pb-2">
                <span>AUTHORIZING MAINTENANCE TRIP FOR:</span>
                <span className="font-bold text-[#172033]">
                  Channels [{selectedChannels.join(", ")}]
                </span>
              </div>

              {/* Camera Component */}
              <div className="rounded-lg overflow-hidden border border-[#E2E8F0] bg-slate-900">
                <FaceCamera
                  isActive={true}
                  onFrameCapture={handleFrameCapture}
                  captureIntervalMs={500}
                  qualityScore={qualityScore}
                  livenessHint={livenessHint}
                  guidanceText={guidance}
                  faceCount={faceCount}
                  statusBadge={step === "ANALYZING" ? "ANALYZING EMBEDDINGS..." : "VERIFYING IDENTITY"}
                />
              </div>

              {/* Manual Trigger Option */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] text-[#64748B]">
                  {guidance} • Quality: {(qualityScore * 100).toFixed(0)}%
                </span>
                <button
                  type="button"
                  onClick={triggerCompleteVerification}
                  disabled={step === "ANALYZING"}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  {step === "ANALYZING" ? "ANALYZING..." : "CONFIRM BIOMETRICS"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: AUTHORIZATION GRANTED — PROCEED TO RELAY TRIP */}
          {step === "AUTHORIZED" && verificationResult && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-900 space-y-2">
                <div className="font-bold text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-700" />
                  <span>BIOMETRIC IDENTITY CONFIRMED</span>
                </div>
                <div className="text-[11px] text-[#172033] space-y-1 pl-6">
                  <div>Operator: <strong>{verificationResult.display_name}</strong> ({verificationResult.role})</div>
                  <div>Face Match Score: <strong>{(verificationResult.similarity_score * 100).toFixed(1)}%</strong></div>
                  <div>Scope: <strong>Channel(s) [{selectedChannels.join(", ")}] Strictly Bound</strong></div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] text-[#64748B]">
                Cryptographic one-time token issued (60s TTL). Ready to de-energize Main and Aux relays for Channel(s) {selectedChannels.join(", ")}.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#172033] text-xs font-semibold cursor-pointer"
                >
                  ABORT
                </button>
                <button
                  type="button"
                  onClick={handleExecuteTrip}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <PowerOff className="w-3.5 h-3.5" />
                  <span>EXECUTE TRIP ON RELAYS</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: TRIPPING IN PROGRESS */}
          {step === "TRIPPING" && (
            <div className="p-8 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-red-600 animate-spin mx-auto" />
              <div className="font-bold text-[#172033] text-sm">DE-ENERGIZING CHANNELS...</div>
              <p className="text-[11px] text-[#64748B]">
                Executing controlled relay transition for Channel(s) [{selectedChannels.join(", ")}].
              </p>
            </div>
          )}

          {/* STEP 5: RESULT VIEW (Part 4) */}
          {step === "RESULT" && executionResult && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border ${executionResult.success ? "bg-green-50 border-green-200 text-green-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
                <div className="font-bold text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-700" />
                  <span>MAINTENANCE TRIP COMPLETED</span>
                </div>
                <p className="text-[11px] text-[#172033] mt-1">
                  {executionResult.message}
                </p>
              </div>

              {/* Per-Channel Results Matrix */}
              <div className="space-y-2">
                <span className="text-[10px] text-[#64748B] uppercase font-bold">Execution Breakdown:</span>
                <div className="space-y-1.5">
                  {(executionResult.results || []).map((res: any) => (
                    <div
                      key={res.channel_id}
                      className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${res.success ? "bg-green-600" : "bg-red-600"}`} />
                        <span className="font-bold text-[#172033]">Channel {res.channel_id}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${res.success ? "bg-green-100 text-green-800 border border-green-200" : "bg-red-100 text-red-800 border border-red-200"}`}>
                          {res.success ? "SUCCESS: RELAYS OPEN" : `FAILED: ${res.status}`}
                        </span>
                        <div className="text-[10px] text-[#64748B] mt-0.5">{res.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
                >
                  DISMISS &amp; CLOSE
                </button>
              </div>
            </div>
          )}

          {/* ERROR STATE */}
          {step === "ERROR" && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 space-y-2">
                <div className="font-bold text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>AUTHORIZATION / EXECUTION REJECTED</span>
                </div>
                <p className="text-[11px] text-red-700">
                  {errorMessage || "An unexpected safety error occurred."}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#172033] text-xs font-semibold cursor-pointer"
                >
                  CLOSE
                </button>
                <button
                  type="button"
                  onClick={() => setStep("CONFIRMATION")}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer"
                >
                  RETRY
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
