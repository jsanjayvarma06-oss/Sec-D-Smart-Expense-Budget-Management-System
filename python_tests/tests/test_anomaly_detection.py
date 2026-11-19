"""Branch testing for anomaly detection algorithm using pytest."""
import pytest
from smart_expense.anomaly_detection import evaluate_unusual_spending, to_paise


class TestAnomalyDetectionBranches:
    def test_to_paise_conversion(self):
        """Branch check: float vs integer roundings."""
        assert to_paise(10.50) == 1050
        assert to_paise("25.99") == 2599

    def test_insufficient_history_branch(self):
        """Branch: len(history) < MINIMUM_HISTORY (returns False, explains history count)."""
        history = [100, 200, 150, 180]  # only 4 transactions (< 5)
        res = evaluate_unusual_spending(amount=1000, history_amounts=history)
        assert res["is_unusual"] is False
        assert res["reason"] == "Not enough transaction history"
        assert res["history_count"] == 4

    def test_normal_spending_branch(self):
        """Branch: amount <= 3 x average (is_unusual is False, reason is None)."""
        history = [100, 120, 110, 90, 100]  # avg = 104, 3x avg = 312
        res = evaluate_unusual_spending(amount=250, history_amounts=history)
        assert res["is_unusual"] is False
        assert res["reason"] is None
        assert res["average_amount"] == 104.0
        assert res["threshold_amount"] == 312.0
        assert res["history_count"] == 5

    def test_exact_threshold_boundary_branch(self):
        """Boundary: amount exactly equals 3x average (is_unusual should be False because condition is strictly >)."""
        history = [100, 100, 100, 100, 100]  # avg = 100, threshold = 300
        res = evaluate_unusual_spending(amount=300, history_amounts=history)
        assert res["is_unusual"] is False
        assert res["reason"] is None

    def test_unusual_spending_branch(self):
        """Branch: amount > 3 x average (is_unusual is True, reason is set)."""
        history = [100, 100, 100, 100, 100]  # avg = 100, threshold = 300
        res = evaluate_unusual_spending(amount=301, history_amounts=history)
        assert res["is_unusual"] is True
        assert res["reason"] == "Amount is significantly higher than your recent spending in this category"
        assert res["threshold_amount"] == 300.0
