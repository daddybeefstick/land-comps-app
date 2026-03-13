from config import (
    HOLDING_COST_RATE,
    INFRA_COST_PER_LOT,
    MAX_ESTIMATED_LOTS,
    MIN_ESTIMATED_LOTS,
    PERMITS_FLAT,
    SURVEY_COST_PER_LOT,
)


def estimated_lots(acres: float) -> int:
    lots = int(acres // 5)
    if lots < MIN_ESTIMATED_LOTS:
        return 0
    return min(lots, MAX_ESTIMATED_LOTS)


def calculate_profit(price: float, acres: float, county_median_ppa: float) -> dict:
    lots = estimated_lots(acres)
    if not lots:
        return {
            "estimated_lots": 0,
            "gross_revenue": 0.0,
            "estimated_costs": 0.0,
            "net_profit": 0.0,
            "roi_pct": 0.0,
            "commission": 0.0,
        }
    median_lot_value = county_median_ppa * 5 if county_median_ppa else 0.0
    gross_revenue = lots * median_lot_value
    estimated_costs = (SURVEY_COST_PER_LOT + INFRA_COST_PER_LOT) * lots + PERMITS_FLAT + (price * HOLDING_COST_RATE)
    net_profit = gross_revenue - price - estimated_costs
    roi_pct = (net_profit / price * 100) if price else 0.0
    commission = net_profit * 0.05
    return {
        "estimated_lots": lots,
        "gross_revenue": round(gross_revenue, 2),
        "estimated_costs": round(estimated_costs, 2),
        "net_profit": round(net_profit, 2),
        "roi_pct": round(roi_pct, 2),
        "commission": round(commission, 2),
    }
