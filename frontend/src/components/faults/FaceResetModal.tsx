"use client";

import React from "react";
import { FaceVerificationModal } from "@/components/face/FaceVerificationModal";

interface FaceResetModalProps {
  channel?: number;
  channels?: number[];
  faultType?: string;
  measuredCurrent?: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Production-grade Biometric Reset Modal.
 * Wraps FaceVerificationModal with fail-closed security, real-time in-browser camera feed,
 * liveness verification, quality scoring, cryptographic reset token issuance, pre-closure safety check,
 * and automated Main+Aux sequential relay closure.
 */
export function FaceResetModal(props: FaceResetModalProps) {
  return <FaceVerificationModal {...props} />;
}
