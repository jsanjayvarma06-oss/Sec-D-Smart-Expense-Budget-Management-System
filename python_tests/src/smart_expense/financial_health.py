"""Financial Health Score Calculator matching backend/src/services/financialHealthService.js."""
import re


def to_paise(amount):
    """Convert amount to whole paise to avoid floating point inaccuracies."""
    return round(float(amount) * 100)


def calculate_financial_health_score(month, total_income, total_expenses, overall_budget=0):
    """
    Computes financial health score (0-100) and rationales based on income,
    expense, and budget metrics for a given YYYY-MM month.
    """
    if not isinstance(month, str) or not re.match(r"^\d{4}-\d{2}$", month):
        raise TypeError("Month must use YYYY-MM format")

    year, month_num = map(int, month.split("-"))
    if year < 1900 or month_num < 1 or month_num > 12:
        raise TypeError("Enter a valid month")

    income_paise = to_paise(total_income)
    expenses_paise = to_paise(total_expenses)
    budget_paise = to_paise(overall_budget) if overall_budget is not None else 0
    savings_paise = income_paise - expenses_paise

    savings = savings_paise / 100.0
    savings_rate = (savings_paise / income_paise) if income_paise > 0 else None
    budget_usage = (expenses_paise / budget_paise) if budget_paise > 0 else None

    score = 50
    reasons = []

    # Savings / Income branches
    if income_paise <= 0:
        score -= 10
        reasons.append("No income was recorded for this month.")
    elif savings_paise * 100 >= 20 * income_paise:
        score += 30
        reasons.append("You saved at least 20% of your income.")
    elif savings_paise * 100 >= 10 * income_paise:
        score += 20
        reasons.append("You saved 10–19.99% of your income.")
    elif savings_paise > 0:
        score += 10
        reasons.append("Your income exceeded your expenses.")
    else:
        score -= 25
        reasons.append("Your expenses equalled or exceeded your income.")

    # Budget branches
    if budget_paise > 0 and expenses_paise * 100 <= 80 * budget_paise:
        score += 20
        reasons.append("Spending stayed within 80% of your overall budget.")
    elif budget_paise > 0 and expenses_paise <= budget_paise:
        score += 10
        reasons.append("Spending stayed within your overall budget.")
    elif budget_paise > 0:
        score -= 15
        reasons.append("Spending exceeded your overall budget.")
    else:
        reasons.append("No overall budget was set, so budget performance was not scored.")

    # Score clamping between 0 and 100
    score = max(0, min(100, score))

    return {
        "score": score,
        "month": month,
        "income": round(income_paise / 100.0, 2),
        "expenses": round(expenses_paise / 100.0, 2),
        "savings": round(savings, 2),
        "savings_rate": round(savings_rate, 4) if savings_rate is not None else None,
        "overall_budget": round(budget_paise / 100.0, 2) if budget_paise > 0 else None,
        "budget_usage": round(budget_usage, 4) if budget_usage is not None else None,
        "reasons": reasons,
    }
