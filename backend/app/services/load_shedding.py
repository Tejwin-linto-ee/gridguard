import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from backend.app.core.config import settings

class LoadSheddingService:
    def __init__(self):
        self.demand_limit_w: float = settings.LOAD_SHEDDING_DEMAND_LIMIT_W
        self.hysteresis_margin_w: float = 150.0
        self.priorities: Dict[int, str] = {
            1: "CRITICAL",
            2: "IMPORTANT",
            3: "NORMAL",
            4: "NON-ESSENTIAL"
        }
        # Priority ordering: lowest number = highest priority
        self.priority_rank = {
            "CRITICAL": 1,
            "IMPORTANT": 2,
            "NORMAL": 3,
            "NON-ESSENTIAL": 4
        }
        self.is_active: bool = False
        self.shed_channels: List[int] = []
        self.last_shed_time: float = 0.0
        self.cooldown_sec: float = 3.0

    def evaluate_demand(
        self, total_power_w: float, active_channels: Dict[int, bool]
    ) -> Tuple[bool, Optional[int], Optional[str]]:
        """
        Evaluates system power demand against configured threshold.
        Returns: (action_taken, affected_channel, reason)
        """
        now = time.time()
        if (now - self.last_shed_time) < self.cooldown_sec:
            return False, None, None

        # Case 1: Overdemand -> Shed lowest priority active channel
        if total_power_w > self.demand_limit_w:
            # Sort active channels by lowest priority first (highest rank number)
            candidate_channels = [
                ch for ch, is_active in active_channels.items()
                if is_active and ch not in self.shed_channels
            ]
            if not candidate_channels:
                return False, None, None

            # Sort candidate by priority_rank descending (rank 4 -> rank 3 -> rank 2 -> rank 1)
            candidate_channels.sort(
                key=lambda ch: self.priority_rank.get(self.priorities.get(ch, "NORMAL"), 3),
                reverse=True
            )

            target_ch = candidate_channels[0]
            self.shed_channels.append(target_ch)
            self.is_active = True
            self.last_shed_time = now
            priority_label = self.priorities.get(target_ch, "NORMAL")
            return True, target_ch, f"Demand {total_power_w:.1f}W exceeded limit {self.demand_limit_w:.1f}W. Shedding lowest-priority channel ({priority_label})."

        # Case 2: Demand safely below limit minus hysteresis -> Candidate for restoration
        if self.shed_channels and total_power_w < (self.demand_limit_w - self.hysteresis_margin_w):
            # Restore highest priority among shed channels (lowest rank number)
            self.shed_channels.sort(
                key=lambda ch: self.priority_rank.get(self.priorities.get(ch, "NORMAL"), 3)
            )
            target_ch = self.shed_channels.pop(0)
            if not self.shed_channels:
                self.is_active = False
            self.last_shed_time = now
            priority_label = self.priorities.get(target_ch, "NORMAL")
            return True, target_ch, f"Demand normalized to {total_power_w:.1f}W. Restoring shed channel ({priority_label})."

        return False, None, None

load_shedding_service = LoadSheddingService()
