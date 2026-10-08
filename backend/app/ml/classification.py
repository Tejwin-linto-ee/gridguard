"""
GRIDGUARD Fault Classification ML Module (Step 23)
=================================================
Deterministic electrical telemetry classifier using Random Forest / Logistic Regression.
Strictly zero temperature.
Fails honest: Returns "MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA" when data is inadequate.
Fabrication of synthetic training telemetry is strictly prohibited.
"""

from typing import Dict, Any, List, Optional
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

ELECTRICAL_FEATURES = ["voltage", "current", "apparent_power", "frequency", "power_factor"]
MINIMUM_TRAINING_SAMPLES = 50

class FaultClassifierPipeline:
    def __init__(self):
        self.model: Optional[RandomForestClassifier] = None
        self.scaler: Optional[StandardScaler] = None
        self.classes_: List[str] = []
        self.metrics_: Dict[str, Any] = {
            "status": "MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA",
            "model_name": "RandomForest-FaultClassifier-v1",
            "accuracy": None,
            "precision": None,
            "recall": None,
            "f1_score": None,
            "confusion_matrix": None,
            "classes": [],
            "training_samples": 0,
            "features_used": ELECTRICAL_FEATURES,
            "disclaimer": "MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA. Live operational fault telemetry required."
        }

    def train_on_telemetry(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Trains the classifier on validated historical electrical records.
        Records must contain electrical features and a valid fault label.
        Zero temperature features allowed.
        """
        valid_records = []
        for r in records:
            # Strictly zero temperature rejection
            for k in r.keys():
                if "temp" in k.lower() or "thermal" in k.lower():
                    raise ValueError(f"Prohibited temperature field '{k}' detected in classification training data.")

            v = r.get("voltage")
            i = r.get("current")
            va = r.get("apparent_power")
            hz = r.get("frequency", 50.0)
            pf = r.get("power_factor", 0.95)
            label = r.get("fault_type") or r.get("fault") or r.get("label")

            if v is not None and i is not None and label is not None:
                if va is None:
                    va = round(float(v) * float(i), 2)
                valid_records.append([float(v), float(i), float(va), float(hz), float(pf), str(label)])

        if len(valid_records) < MINIMUM_TRAINING_SAMPLES:
            self.model = None
            self.scaler = None
            self.metrics_ = {
                "status": "MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA",
                "model_name": "RandomForest-FaultClassifier-v1",
                "accuracy": None,
                "precision": None,
                "recall": None,
                "f1_score": None,
                "confusion_matrix": None,
                "classes": [],
                "training_samples": len(valid_records),
                "features_used": ELECTRICAL_FEATURES,
                "disclaimer": f"MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA (Found {len(valid_records)} samples, minimum {MINIMUM_TRAINING_SAMPLES} required). Synthetic training data prohibited."
            }
            return self.metrics_

        data = np.array(valid_records, dtype=object)
        X = data[:, :5].astype(float)
        y = data[:, 5].astype(str)

        unique_classes = np.unique(y)
        if len(unique_classes) < 2:
            self.metrics_ = {
                "status": "MODEL UNAVAILABLE — INSUFFICIENT TRAINING DATA",
                "model_name": "RandomForest-FaultClassifier-v1",
                "accuracy": None,
                "precision": None,
                "recall": None,
                "f1_score": None,
                "confusion_matrix": None,
                "classes": list(unique_classes),
                "training_samples": len(valid_records),
                "features_used": ELECTRICAL_FEATURES,
                "disclaimer": "MODEL UNAVAILABLE — INSUFFICIENT CLASS DIVERSITY (At least 2 distinct classes required)."
            }
            return self.metrics_

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=42, stratify=y
        )

        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        rf = RandomForestClassifier(n_estimators=50, max_depth=6, random_state=42)
        rf.fit(X_train_scaled, y_train)

        y_pred = rf.predict(X_test_scaled)
        acc = float(accuracy_score(y_test, y_pred))
        prec = float(precision_score(y_test, y_pred, average="weighted", zero_division=0))
        rec = float(recall_score(y_test, y_pred, average="weighted", zero_division=0))
        f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))
        cm = confusion_matrix(y_test, y_pred, labels=rf.classes_).tolist()

        self.model = rf
        self.scaler = scaler
        self.classes_ = list(rf.classes_)

        self.metrics_ = {
            "status": "AVAILABLE",
            "model_name": "RandomForest-FaultClassifier-v1",
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1_score": round(f1, 4),
            "confusion_matrix": cm,
            "classes": self.classes_,
            "training_samples": len(valid_records),
            "features_used": ELECTRICAL_FEATURES,
            "disclaimer": "Validated on historical physical telemetry. Strictly zero temperature."
        }
        return self.metrics_

    def get_metrics(self) -> Dict[str, Any]:
        return self.metrics_

    def predict(self, voltage: Optional[float], current: Optional[float],
                apparent_power: Optional[float] = None, frequency: float = 50.0,
                power_factor: float = 0.95) -> Optional[Dict[str, Any]]:
        """
        Classifies electrical telemetry. Returns None if model is unavailable or telemetry is null.
        """
        if self.model is None or self.scaler is None:
            return None

        if voltage is None or current is None:
            return None

        if apparent_power is None:
            apparent_power = round(voltage * current, 2)

        feat = np.array([[voltage, current, apparent_power, frequency, power_factor]], dtype=float)
        feat_scaled = self.scaler.transform(feat)

        pred = self.model.predict(feat_scaled)[0]
        probs = self.model.predict_proba(feat_scaled)[0]

        prob_dict = {cls_name: round(float(p), 4) for cls_name, p in zip(self.classes_, probs)}
        confidence = float(np.max(probs))

        return {
            "predicted_class": str(pred),
            "confidence": round(confidence, 4),
            "probabilities": prob_dict,
            "is_fault": str(pred).upper() != "NORMAL",
            "status": "CLASSIFICATION_COMPLETE"
        }

fault_classifier = FaultClassifierPipeline()
