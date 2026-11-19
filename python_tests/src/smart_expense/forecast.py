"""Monthly Spending Forecast matching backend/src/services/forecastService.js."""

MINIMUM_MONTHS = 3


def calculate_monthly_forecast(monthly_history):
    """
    Computes projected expenditure based on preceding 3-month history.
    """
    if len(monthly_history) < MINIMUM_MONTHS:
        return {
            "available": False,
            "reason": "At least 3 months of spending history are required",
            "months_of_history": len(monthly_history),
            "forecast": None,
            "monthly_totals": monthly_history,
        }

    total_spent = sum(item["total_spent"] for item in monthly_history)
    average = total_spent / len(monthly_history)

    return {
        "available": True,
        "reason": None,
        "months_of_history": len(monthly_history),
        "forecast": round(average, 2),
        "monthly_totals": monthly_history,
    }
