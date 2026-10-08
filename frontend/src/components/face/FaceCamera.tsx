"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Camera, AlertOctagon, CheckCircle2, ShieldAlert,
  RefreshCw, Scan, UserCheck, Eye, Sparkles, Activity
} from "lucide-react";

interface FaceCameraProps {
  active?: boolean;
  isActive?: boolean;
  onFrameCapture?: (frameBase64: string) => void;
  onFrame?: (frameBase64: string, feedback?: any) => void;
  captureIntervalMs?: number;
  continuousFeedback?: boolean;
  onFeedbackUpdate?: (feedback: any) => void;
  statusBadge?: string;
  guidanceText?: string;
  qualityScore?: number;
  livenessHint?: string;
  faceCount?: number;
  bbox?: [number, number, number, number] | null;
  onManualCaptureReady?: (captureFn: () => string | null) => void;
}

export function FaceCamera({
  active,
  isActive,
  onFrameCapture,
  onFrame,
  captureIntervalMs = 600,
  continuousFeedback = true,
  onFeedbackUpdate,
  statusBadge,
  guidanceText,
  qualityScore = 0.0,
  livenessHint = "WAITING",
  faceCount = 0,
  bbox = null,
  onManualCaptureReady,
}: FaceCameraProps) {
  const isCameraActive = active ?? isActive ?? true;
  const emitFrame = onFrameCapture || onFrame;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Initialize camera stream
  const startCamera = async () => {
    setErrorMessage(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMessage("Browser Camera API (getUserMedia) not supported on this device.");
        setHasPermission(false);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;
      setHasPermission(true);
      setIsStreaming(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => {
          console.warn("Error playing video stream:", err);
        });
      }
    } catch (err: any) {
      console.warn("Camera access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMessage("CAMERA ACCESS DENIED: Please grant camera permission in your browser.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setErrorMessage("CAMERA UNAVAILABLE: No functional video camera hardware found.");
      } else {
        setErrorMessage(`Camera initialization error: ${err.message || "Failed to access webcam."}`);
      }
      setHasPermission(false);
      setIsStreaming(false);
    }
  };

  // Safe camera track shutdown
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    if (isCameraActive) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isCameraActive, stopCamera]);

  // Frame grab function for on-demand capture
  const captureCurrentFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  useEffect(() => {
    if (onManualCaptureReady) {
      onManualCaptureReady(captureCurrentFrame);
    }
  }, [onManualCaptureReady, captureCurrentFrame]);

  // Frame grabber loop for continuous real-time feedback
  useEffect(() => {
    if (!isCameraActive || !isStreaming || !continuousFeedback) return;

    const interval = setInterval(() => {
      const frameBase64 = captureCurrentFrame();
      if (frameBase64 && emitFrame) {
        emitFrame(frameBase64);
      }
    }, captureIntervalMs);

    return () => clearInterval(interval);
  }, [isCameraActive, isStreaming, continuousFeedback, emitFrame, captureIntervalMs, captureCurrentFrame]);


  return (
    <div className="relative w-full max-w-lg mx-auto rounded-xl overflow-hidden bg-black border border-[#CBD5E1] shadow-xs">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Main Video Display */}
      <div className="relative aspect-[4/3] w-full flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${
            isStreaming ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Loading / Error States */}
        {!isStreaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-black/90">
            {errorMessage ? (
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center mx-auto">
                  <AlertOctagon className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold text-red-400 uppercase tracking-wide">
                  Camera Error
                </div>
                <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Retry Permission
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
                <div className="text-xs text-slate-300">
                  Initializing in-browser video camera...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Industrial Engineering Camera Guide Overlay */}
        {isStreaming && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-20">
            {/* Top Telemetry Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-[#172033]/90 px-3 py-1 rounded-full border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-red-600" />
                <span className="text-[10px] text-white font-bold uppercase tracking-wider">
                  LIVE SENSOR FEED
                </span>
              </div>

              {faceCount > 1 ? (
                <div className="px-2.5 py-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  MULTIPLE FACES (PAUSED)
                </div>
              ) : faceCount === 1 ? (
                <div className="px-2.5 py-1 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" />
                  1 FACE ACQUIRED
                </div>
              ) : (
                <div className="px-2.5 py-1 rounded-full bg-[#172033]/80 text-slate-300 text-[10px]">
                  SEARCHING FOR FACE...
                </div>
              )}
            </div>

            {/* Central Clean Alignment Guide Reticle */}
            <div className="relative self-center w-52 h-64 border-2 border-dashed border-blue-500/70 rounded-[50%] flex items-center justify-center">
              {/* Corner brackets */}
              <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-blue-500" />
              <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-blue-500" />
              <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-blue-500" />
              <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-blue-500" />

              {/* Eye guide indicators */}
              <div className="absolute top-20 flex justify-between w-28 text-blue-200/80">
                <span className="text-[9px] font-bold">+ L_EYE</span>
                <span className="text-[9px] font-bold">R_EYE +</span>
              </div>
            </div>

            {/* Bottom Feedback Bar */}
            <div className="space-y-2">
              {/* Real-Time Actionable Guidance Banner */}
              {guidanceText && (
                <div className="text-center py-1.5 px-3 rounded-lg bg-[#172033]/90 text-xs font-bold text-white shadow-md">
                  {guidanceText}
                </div>
              )}

              {/* Quality & Liveness Score Pills */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#172033]/90 text-white border border-slate-700">
                  <span className="text-slate-300">QUALITY:</span>
                  <span
                    className={`font-bold ${
                      qualityScore >= 0.70
                        ? "text-green-400"
                        : qualityScore >= 0.50
                        ? "text-amber-400"
                        : "text-slate-300"
                    }`}
                  >
                    {qualityScore > 0 ? `${Math.round(qualityScore * 100)}%` : "EVALUATING"}
                  </span>
                </div>

                <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#172033]/90 text-white border border-slate-700">
                  <span className="text-slate-300">LIVENESS:</span>
                  <span
                    className={`font-bold ${
                      livenessHint.includes("VERIFIED")
                        ? "text-green-400"
                        : livenessHint.includes("SPOOF")
                        ? "text-red-400"
                        : "text-blue-400"
                    }`}
                  >
                    {livenessHint}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
