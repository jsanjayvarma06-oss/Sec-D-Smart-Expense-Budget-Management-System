"""Anomaly Detection Service implementation for Smart Expense & Budget Management."""

MINIMUM_HISTORY = 5
UNUSUAL_AMOUNT_MULTIPLIER = 3


def to_paise(amount):
    """Convert amount to whole paise to avoid floating point issues."""
    return round(float(amount) * 100)


def evaluate_unusual_spending(amount, history_amounts):
    """
    Pure algorithmic decision function for anomaly detection.
    Matches backend/src/services/anomalyDetectionService.js.

    Args:
        amount (float|int): The expense amount being evaluated.
        history_amounts (list): List of previous unflagged amounts in the category.

    Returns:
        dict: Evaluation outcome including is_unusual flag and explanation.
    """
    history_paise = [to_paise(a) for a in history_amounts]

    if len(history_paise) < MINIMUM_HISTORY:
        return {
            "is_unusual": False,
            "reason": "Not enough transaction history",
            "history_count": len(history_paise),
        }

    total_paise = sum(history_paise)
    average = (total_paise / len(history_paise)) / 100
    threshold = average * UNUSUAL_AMOUNT_MULTIPLIER

    # amount > 3 x average, without dividing: amount x count > 3 x total
    is_unusual = to_paise(amount) * len(history_paise) > UNUSUAL_AMOUNT_MULTIPLIER * total_paise

    return {
        "is_unusual": is_unusual,
        "reason": (
            "Amount is significantly higher than your recent spending in this category"
            if is_unusual
            else None
        ),
        "average_amount": round(average, 2),
        "threshold_amount": round(threshold, 2),
        "history_count": len(history_paise),
    }
