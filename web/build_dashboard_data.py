"""Build the static dashboard data asset from the supplied MPLADS exports."""

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def integer(value):
    return int(number(value))


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        yield from csv.DictReader(source)


def key_text(value):
    return re.sub(r"\s+", " ", (value or "").strip()).casefold()


def add_unique(values, value):
    value = (value or "").strip()
    if value and value not in values:
        values.add(value)


def build_data(source_dir):
    source_dir = Path(source_dir)
    mp_rows = []
    for row in read_csv(source_dir / "mplads_mp_summary_2026-10-24.csv"):
        mp_rows.append(
            {
                "name": row["MP Name"],
                "seat": row["Constituency"],
                "state": row["State"],
                "house": row["House"],
                "allocated": number(row["Allocated Amount (₹)"]),
                "recommended": number(row["Amount Recommended (₹)"]),
                "spent": number(row["Total Expenditure (₹)"]),
                "utilization": number(row["Utilization %"]),
                "completed": integer(row["Completed Works"]),
                "recommendedWorks": integer(row["Recommended Works"]),
                "completionRate": number(row["Completion Rate %"]),
                "vendorBalance": number(row["Balance Not Yet Paid to Vendors (₹)"]),
                "transactions": integer(row["Transaction Count"]),
                "successfulPayments": integer(row["Successful Payments"]),
                "pendingPayments": integer(row["Pending Payments"]),
                "rating": row["Average Rating"],
            }
        )

    contractors = {}
    expenditure_months = defaultdict(lambda: [0, 0.0, 0, 0])
    states = {}
    expenditure_count = 0
    expenditure_total = 0.0

    for row in read_csv(source_dir / "mplads_expenditures_2026-10-24.csv"):
        expenditure_count += 1
        amount = number(row["Expenditure Amount (₹)"])
        expenditure_total += amount
        vendor_name = re.sub(r"\s+", " ", row["Vendor"].strip())
        vendor_key = key_text(vendor_name)
        vendor = contractors.setdefault(
            vendor_key,
            {
                "name": vendor_name,
                "count": 0,
                "amount": 0.0,
                "success": 0,
                "inProgress": 0,
                "states": set(),
                "seats": set(),
                "mps": set(),
                "idas": set(),
            },
        )
        vendor["count"] += 1
        vendor["amount"] += amount
        if row["Payment Status"] == "Payment Success":
            vendor["success"] += 1
        else:
            vendor["inProgress"] += 1
        add_unique(vendor["states"], row["State"])
        add_unique(vendor["seats"], row["Constituency"])
        add_unique(vendor["mps"], row["MP Name"])
        add_unique(vendor["idas"], row["IDA"])

        month = (row["Expenditure Date"] or "")[:7]
        if month:
            stats = expenditure_months[month]
            stats[0] += 1
            stats[1] += amount
            if row["Payment Status"] == "Payment Success":
                stats[2] += 1
            else:
                stats[3] += 1

        state = row["State"]
        state_summary = states.setdefault(
            state,
            {"state": state, "expenditureRows": 0, "expenditure": 0.0},
        )
        state_summary["expenditureRows"] += 1
        state_summary["expenditure"] += amount

    for vendor in contractors.values():
        for field in ("states", "seats", "mps", "idas"):
            vendor[field] = sorted(vendor[field])

    completed_count = 0
    completed_total = 0.0
    completed_months = defaultdict(lambda: [0, 0.0])
    completed_states = Counter()
    for row in read_csv(source_dir / "mplads_completed_works_2026-10-24.csv"):
        completed_count += 1
        amount = number(row["Final Amount (₹)"])
        completed_total += amount
        month = (row["Completed Date"] or "")[:7]
        if month:
            completed_months[month][0] += 1
            completed_months[month][1] += amount
        state = row["State"]
        completed_states[state] += 1
        states.setdefault(state, {"state": state})["completedWorks"] = (
            states.get(state, {}).get("completedWorks", 0) + 1
        )

    recommended_count = 0
    recommended_total = 0.0
    recommended_months = defaultdict(lambda: [0, 0.0])
    recommended_states = Counter()
    for row in read_csv(source_dir / "mplads_recommended_works_2026-10-24.csv"):
        recommended_count += 1
        amount = number(row["Recommended Amount (₹)"])
        recommended_total += amount
        month = (row["Recommendation Date"] or "")[:7]
        if month:
            recommended_months[month][0] += 1
            recommended_months[month][1] += amount
        state = row["State"]
        recommended_states[state] += 1
        state_summary = states.setdefault(state, {"state": state})
        state_summary["recommendedWorks"] = (
            state_summary.get("recommendedWorks", 0) + 1
        )

    for row in mp_rows:
        state_summary = states.setdefault(row["state"], {"state": row["state"]})
        state_summary["mps"] = state_summary.get("mps", 0) + 1
        state_summary["allocated"] = state_summary.get("allocated", 0.0) + row["allocated"]
        state_summary["mpRecommended"] = (
            state_summary.get("mpRecommended", 0.0) + row["recommended"]
        )
        state_summary["mpExpenditure"] = (
            state_summary.get("mpExpenditure", 0.0) + row["spent"]
        )

    months = sorted(
        set(expenditure_months) | set(completed_months) | set(recommended_months)
    )
    trend = [
        {
            "month": month,
            "expenditureCount": expenditure_months[month][0],
            "expenditure": round(expenditure_months[month][1], 2),
            "successfulPayments": expenditure_months[month][2],
            "inProgressPayments": expenditure_months[month][3],
            "completedCount": completed_months[month][0],
            "completedValue": round(completed_months[month][1], 2),
            "recommendedCount": recommended_months[month][0],
            "recommendedValue": round(recommended_months[month][1], 2),
        }
        for month in months
    ]

    return {
        "asOf": "2026-10-24",
        "sourceFiles": [
            "mplads_mp_summary_2026-10-24.csv",
            "mplads_completed_works_2026-10-24.csv",
            "mplads_expenditures_2026-10-24.csv",
            "mplads_recommended_works_2026-10-24.csv",
        ],
        "totals": {
            "mps": len(mp_rows),
            "completedWorks": completed_count,
            "recommendedWorks": recommended_count,
            "expenditureTransactions": expenditure_count,
            "allocated": round(sum(row["allocated"] for row in mp_rows), 2),
            "mpRecommended": round(sum(row["recommended"] for row in mp_rows), 2),
            "mpExpenditure": round(sum(row["spent"] for row in mp_rows), 2),
            "expenditure": round(expenditure_total, 2),
            "completedValue": round(completed_total, 2),
            "recommendedValue": round(recommended_total, 2),
            "contractors": len(contractors),
            "paymentInProgress": sum(row["inProgress"] for row in contractors.values()),
            "paymentSuccess": sum(row["success"] for row in contractors.values()),
        },
        "mps": mp_rows,
        "contractors": sorted(
            contractors.values(),
            key=lambda vendor: (-vendor["amount"], vendor["name"].casefold()),
        ),
        "states": sorted(states.values(), key=lambda state: state["state"]),
        "trend": trend,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    data = build_data(args.source_dir)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "window.SahayogData = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(
        f"Built dashboard data: {len(data['mps'])} MPs, "
        f"{len(data['contractors'])} contractors, "
        f"{len(data['states'])} states"
    )
    print(f"Output size: {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
