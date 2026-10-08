"use client";

import React, { useState, useRef } from "react";
import {
  ShieldPlus, UserCheck, X, Camera, CheckCircle2, AlertOctagon,
  RefreshCw, Lock, Sparkles, Layers, ShieldCheck
} from "lucide-react";
import { api } from "@/lib/api";
import { FaceCamera } from "./FaceCamera";

interface FaceEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type EnrollmentStep = "INFO" | "CAMERA" | "PROCESSING" | "SUCCESS" | "FAILED";

export function FaceEnrollmentModal({
  isOpen,
  onClose,
  onSuccess,
}: FaceEnrollmentModalProps) {
  const [step, setStep] = useState<EnrollmentStep>("INFO");
  const [userId, setUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [role, setRole] = useState<string>("OPERATOR");
  
  // Multi-frame capture buffer
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const targetFrameCount = 5;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enrollmentResult, setEnrollmentResult] = useState<any>(null);

  // HUD guidance state
  const [qualityScore, setQualityScore] = useState<number>(0.0);
  const [guidance, setGuidance] = useState<string>("Position face in center of reticle");

  const resetState = () => {
    setStep("INFO");
    setUserId("");
    setDisplayName("");
    setRole("OPERATOR");
    setCapturedFrames([]);
    setErrorMessage(null);
    setEnrollmentResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleStartCamera = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !displayName.trim()) {
      setErrorMessage("User ID and Display Name are strictly required.");
      return;
    }
    setErrorMessage(null);
    setCapturedFrames([]);
    setStep("CAMERA");
  };

  // Callback from FaceCamera when a frame is evaluated
  const handleFrameCaptured = async (frameBase64: string, feedback: any) => {
    if (step !== "CAMERA") return;

    if (feedback) {
      setQualityScore(feedback.quality_score || 0.0);
      setGuidance(feedback.guidance || "Hold steady");
      
      // Auto-collect frame only if high quality and single face
      if (feedback.single_face && feedback.quality_passed && feedback.quality_score >= 0.70) {
        setCapturedFrames((prev) => {
          if (prev.length < targetFrameCount) {
            const next = [...prev, frameBase64];
            if (next.length === targetFrameCount) {
              // Trigger final enrollment submission
              setTimeout(() => commitEnrollment(next), 300);
            }
            return next;
          }
          return prev;
        });
      }
    }
  };

  const commitEnrollment = async (frames: string[]) => {
    setStep("PROCESSING");
    try {
      const res = await api.enrollBiometricUser({
        user_id: userId.trim(),
        display_name: displayName.trim(),
        role: role,
        frames_base64: frames,
      });

      if (res && res.status === "ACTIVE") {
        setEnrollmentResult(res);
        setStep("SUCCESS");
      } else {
        setErrorMessage(res?.message || "Biometric enrollment rejected by validation engine.");
        setStep("FAILED");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Network error connecting to biometric enrollment authority.");
      setStep("FAILED");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white border border-[#E2E8F0] rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#F8FAFC] border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 border border-blue-200 rounded text-blue-600">
              <ShieldPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#172033] tracking-wider uppercase">
                BIOMETRIC IDENTITY ENROLLMENT
              </h2>
              <p className="text-[10px] text-[#64748B]">
                ADMIN AUTHORIZED // 512-D EMBEDDING CENTROID GENERATOR
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-[#64748B] hover:text-[#172033] rounded hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* STEP 1: USER INFO FORM */}
          {step === "INFO" && (
            <form onSubmit={handleStartCamera} className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-xs flex items-start gap-2.5">
                <Lock className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
                <div>
                  <span className="font-bold">ADMINISTRATIVE ENROLLMENT POLICY:</span>
                  <p className="text-[11px] text-[#475569] mt-1">
                    Enrolling an authorized operator requires real-time camera capture of 5 consecutive
                    high-quality frames with live human anti-spoof validation. Static photo uploads are forbidden.
                  </p>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-center gap-2 font-medium">
                  <AlertOctagon className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-[#475569] uppercase font-bold mb-1">
                    Operator ID (Badge / Identifier)
                  </label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="e.g. OP-CH-02"
                    required
                    className="w-full bg-white border border-[#CBD5E1] rounded px-3 py-2 text-[#172033] text-xs focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#475569] uppercase font-bold mb-1">
                    Full Legal / Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Dr. Sarah Jenkins"
                    required
                    className="w-full bg-white border border-[#CBD5E1] rounded px-3 py-2 text-[#172033] text-xs focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#475569] uppercase font-bold mb-1">
                    SCADA Role & Reset Authority Scope
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-white border border-[#CBD5E1] rounded px-3 py-2 text-[#172033] text-xs focus:outline-none focus:border-blue-600"
                  >
                    <option value="OPERATOR">OPERATOR (Telemetry, Acknowledge & Fault Reset)</option>
                    <option value="ADMIN">ADMIN (Full System Config, Thresholds & Biometrics)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] rounded text-xs transition-colors cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  INITIALIZE CAMERA FOR ENROLLMENT
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: IN-WEBSITE CAMERA CAPTURE */}
          {step === "CAMERA" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B] font-bold uppercase">
                  OPERATOR: <span className="text-[#172033]">{displayName}</span> ({userId})
                </span>
                <span className="text-blue-700 font-bold">
                  SAMPLES: {capturedFrames.length} / {targetFrameCount}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-[#E2E8F0] rounded-full h-2 overflow-hidden border border-[#CBD5E1]">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${(capturedFrames.length / targetFrameCount) * 100}%` }}
                />
              </div>

              {/* In-browser Camera */}
              <div className="rounded-lg overflow-hidden border border-[#E2E8F0]">
                <FaceCamera
                  isActive={true}
                  onFrame={handleFrameCaptured}
                  captureIntervalMs={400}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] bg-[#F8FAFC] p-2.5 rounded border border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${qualityScore >= 0.70 ? "bg-green-600" : "bg-amber-500"}`} />
                  <span className="text-[#475569]">
                    Quality: <span className="font-bold text-[#172033]">{(qualityScore * 100).toFixed(0)}%</span>
                  </span>
                </div>
                <span className="text-amber-700 font-bold tracking-wider">{guidance}</span>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setStep("INFO")}
                  className="px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] rounded text-xs cursor-pointer"
                >
                  BACK
                </button>
                <button
                  onClick={handleClose}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold cursor-pointer"
                >
                  ABORT ENROLLMENT
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PROCESSING CENTROID */}
          {step === "PROCESSING" && (
            <div className="py-12 text-center space-y-4">
              <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[#172033] uppercase tracking-wider">
                  GENERATING 512-D CENTROID EMBEDDING
                </h3>
                <p className="text-xs text-[#64748B]">
                  Synthesizing facial vector manifold and performing anti-spoof spectral validation...
                </p>
              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS */}
          {step === "SUCCESS" && enrollmentResult && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 bg-green-50 border border-green-200 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-green-700 uppercase tracking-wider">
                  ENROLLMENT COMMITTED SUCCESSFULLY
                </h3>
                <p className="text-xs text-[#64748B] mt-1">
                  Biometric operator credential active in GridGuard authorization database.
                </p>
              </div>

              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-3 text-left space-y-2 text-xs">
                <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                  <span className="text-[#64748B]">Operator ID</span>
                  <span className="text-[#172033] font-bold">{enrollmentResult.user_id}</span>
                </div>
                <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                  <span className="text-[#64748B]">Display Name</span>
                  <span className="text-[#172033] font-bold">{enrollmentResult.display_name}</span>
                </div>
                <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                  <span className="text-[#64748B]">Assigned Role</span>
                  <span className="text-blue-700 font-bold">{enrollmentResult.role}</span>
                </div>
                <div className="flex justify-between border-b border-[#E2E8F0] pb-1.5">
                  <span className="text-[#64748B]">Embedding Model</span>
                  <span className="text-[#172033] font-mono">{enrollmentResult.model_version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Vector Samples</span>
                  <span className="text-green-700 font-bold">{enrollmentResult.samples_captured} Frames Normalized</span>
                </div>
              </div>

              <button
                onClick={() => {
                  onSuccess();
                  handleClose();
                }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-xs transition-colors cursor-pointer shadow-xs"
              >
                RETURN TO OPERATOR MANAGEMENT
              </button>
            </div>
          )}

          {/* STEP 5: FAILED */}
          {step === "FAILED" && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 bg-red-50 border border-red-200 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertOctagon className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-red-700 uppercase tracking-wider">
                  ENROLLMENT REJECTED
                </h3>
                <p className="text-xs text-[#64748B] mt-1">
                  {errorMessage || "Biometric validation failed. Samples did not meet quality/liveness thresholds."}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleClose}
                  className="flex-1 py-2 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[#475569] rounded text-xs cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => {
                    setStep("INFO");
                    setCapturedFrames([]);
                    setErrorMessage(null);
                  }}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs cursor-pointer shadow-xs"
                >
                  TRY AGAIN
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
