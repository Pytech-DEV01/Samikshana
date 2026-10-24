import pandas as pd


def analyze_tenders(tenders):
    required = {"tender_id", "bidder_id", "bid_amount"}

    if tenders is None or tenders.empty:
        return [{
            "detector": "tender",
            "status": "insufficient_data",
            "reasons": ["Tender dataset is missing or empty"],
            "evidence": {},
        }]

    if not required.issubset(tenders.columns):
        return [{
            "detector": "tender",
            "status": "insufficient_data",
            "reasons": [
                f"Required columns: {sorted(required)}"
            ],
            "evidence": {},
        }]

    df = tenders.copy()
    df["bid_amount"] = pd.to_numeric(
        df["bid_amount"], errors="coerce"
    )
    df = df.dropna(
        subset=["tender_id", "bidder_id", "bid_amount"]
    )

    results = []

    # Repeated participation is a review signal, not evidence of fraud.
    for bidder, group in df.groupby("bidder_id"):
        count = group["tender_id"].nunique()

        if count >= 2:
            results.append({
                "detector": "tender",
                "status": "review",
                "risk_score": 20,
                "reasons": [
                    "Bidder participated in multiple tenders"
                ],
                "evidence": {
                    "bidder_id": str(bidder),
                    "tender_count": int(count),
                },
            })

    # Multiple bidders with the same recorded parent in one tender.
    if "parent_company_id" in df.columns:
        linked = df.dropna(subset=["parent_company_id"])

        for (tender_id, parent_id), group in linked.groupby(
            ["tender_id", "parent_company_id"]
        ):
            bidders = group["bidder_id"].astype(str).unique().tolist()

            if len(bidders) > 1:
                results.append({
                    "detector": "tender",
                    "status": "flagged",
                    "risk_score": 45,
                    "reasons": [
                        "Multiple bidders share a recorded parent-company ID"
                    ],
                    "evidence": {
                        "tender_id": str(tender_id),
                        "parent_company_id": str(parent_id),
                        "bidder_ids": bidders,
                    },
                    "limitations": [
                        "Verify corporate records and applicable tender rules."
                    ],
                })

    # Flag very close lowest bids for review.
    for tender_id, group in df.groupby("tender_id"):
        bids = sorted(group["bid_amount"].tolist())

        if len(bids) >= 2 and bids[0] > 0:
            gap_pct = (bids[1] - bids[0]) / bids[0] * 100

            if gap_pct <= 1:
                results.append({
                    "detector": "tender",
                    "status": "review",
                    "risk_score": 25,
                    "reasons": [
                        "Two lowest bids are within 1% of each other"
                    ],
                    "evidence": {
                        "tender_id": str(tender_id),
                        "lowest_bid_gap_pct": round(gap_pct, 3),
                    },
                })

    return results or [{
        "detector": "tender",
        "status": "clear",
        "risk_score": 0,
        "reasons": ["No configured tender review signals found"],
        "evidence": {"bid_rows_checked": len(df)},
    }]