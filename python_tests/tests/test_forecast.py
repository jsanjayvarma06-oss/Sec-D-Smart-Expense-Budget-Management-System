"""Branch testing for Forecast calculation using pytest."""
import pytest
from smart_expense.forecast import calculate_monthly_forecast


class TestForecastBranches:
    def test_insufficient_history_branch(self):
        """Branch: len(monthly_history) < MINIMUM_MONTHS."""
        history = [
            {"month": "2026-08", "total_spent": 5000},
            {"month": "2026-09", "total_spent": 6000},
        ]
        res = calculate_monthly_forecast(history)
        assert res["available"] is False
        assert res["forecast"] is None
        assert res["months_of_history"] == 2
        assert res["reason"] == "At least 3 months of spending history are required"

    def test_sufficient_history_branch(self):
        """Branch: len(monthly_history) >= MINIMUM_MONTHS."""
        history = [
            {"month": "2026-08", "total_spent": 8000},
            {"month": "2026-09", "total_spent": 8500},
            {"month": "2026-10", "total_spent": 9000},
        ]
        res = calculate_monthly_forecast(history)
        assert res["available"] is True
        assert res["reason"] is None
        assert res["months_of_history"] == 3
        assert res["forecast"] == 8500.0
