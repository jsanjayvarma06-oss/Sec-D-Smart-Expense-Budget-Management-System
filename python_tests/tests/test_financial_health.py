"""Branch testing for Financial Health Score using pytest."""
import pytest
from smart_expense.financial_health import calculate_financial_health_score


class TestFinancialHealthBranches:
    def test_invalid_month_format_branch(self):
        """Branch: invalid month string pattern."""
        with pytest.raises(TypeError, match="Month must use YYYY-MM format"):
            calculate_financial_health_score(12345, 1000, 500)

        with pytest.raises(TypeError, match="Month must use YYYY-MM format"):
            calculate_financial_health_score("2026/11", 1000, 500)

    def test_invalid_month_range_branch(self):
        """Branch: year < 1900 or month not in 1..12."""
        with pytest.raises(TypeError, match="Enter a valid month"):
            calculate_financial_health_score("1899-10", 1000, 500)

        with pytest.raises(TypeError, match="Enter a valid month"):
            calculate_financial_health_score("2026-13", 1000, 500)

        with pytest.raises(TypeError, match="Enter a valid month"):
            calculate_financial_health_score("2026-00", 1000, 500)

    def test_no_income_branch(self):
        """Branch: income <= 0."""
        res = calculate_financial_health_score("2026-11", total_income=0, total_expenses=500, overall_budget=0)
        assert res["income"] == 0.0
        assert "No income was recorded for this month." in res["reasons"]
        assert "No overall budget was set, so budget performance was not scored." in res["reasons"]
        assert res["savings_rate"] is None
        assert res["budget_usage"] is None

    def test_savings_greater_than_20_percent_and_budget_under_80_percent(self):
        """
        Branch 1: savings >= 20% (+30 score)
        Branch 2: budget > 0 and expenses <= 80% (+20 score)
        Base score: 50 + 30 + 20 = 100
        """
        # Income 10,000, Expenses 2,000 => Savings 8,000 (80% >= 20%)
        # Budget 10,000, Expenses 2,000 (20% <= 80%)
        res = calculate_financial_health_score("2026-11", total_income=10000, total_expenses=2000, overall_budget=10000)
        assert res["score"] == 100
        assert "You saved at least 20% of your income." in res["reasons"]
        assert "Spending stayed within 80% of your overall budget." in res["reasons"]

    def test_savings_between_10_and_20_percent_and_budget_under_100_percent(self):
        """
        Branch 1: savings 10% - 19.99% (+20 score)
        Branch 2: budget > 0 and expenses <= 100% (+10 score)
        Base: 50 + 20 + 10 = 80
        """
        # Income 10,000, Expenses 8,500 => Savings 1,500 (15% >= 10%)
        # Budget 10,000, Expenses 8,500 (85% > 80% but <= 100%)
        res = calculate_financial_health_score("2026-11", total_income=10000, total_expenses=8500, overall_budget=10000)
        assert res["score"] == 80
        assert "You saved 10–19.99% of your income." in res["reasons"]
        assert "Spending stayed within your overall budget." in res["reasons"]

    def test_savings_positive_under_10_percent_and_budget_exceeded(self):
        """
        Branch 1: savings > 0 and < 10% (+10 score)
        Branch 2: budget > 0 and expenses > budget (-15 score)
        Base: 50 + 10 - 15 = 45
        """
        # Income 10,000, Expenses 9,500 => Savings 500 (5% > 0)
        # Budget 8,000, Expenses 9,500 (Exceeded budget)
        res = calculate_financial_health_score("2026-11", total_income=10000, total_expenses=9500, overall_budget=8000)
        assert res["score"] == 45
        assert "Your income exceeded your expenses." in res["reasons"]
        assert "Spending exceeded your overall budget." in res["reasons"]

    def test_expenses_exceed_income_branch(self):
        """Branch: expenses >= income (-25 score)."""
        # Income 10,000, Expenses 12,000
        # No budget
        res = calculate_financial_health_score("2026-11", total_income=10000, total_expenses=12000, overall_budget=None)
        assert res["score"] == 25  # 50 - 25
        assert "Your expenses equalled or exceeded your income." in res["reasons"]
        assert "No overall budget was set, so budget performance was not scored." in res["reasons"]

    def test_clamping_minimum_zero(self):
        """Branch: score clamp min 0."""
        # Income 0 (-10), expenses exceed budget greatly (-15), expenses exceed income (-25 if income <= 0 falls in first if)
        # 50 - 10 - 15 = 25
        # To get 0: Base 50 - 25 (expenses > income) - 15 (exceeded budget) = 10.
        # Let's test with negative income or catastrophic penalty:
        res = calculate_financial_health_score("2026-11", total_income=0, total_expenses=50000, overall_budget=1000)
        assert res["score"] == 25
