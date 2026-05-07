"""
Dataset Routes — Admin only
- GET  /dataset           : paginated verified dataset table (phishing + legit)
- GET  /dataset/export    : download as CSV for ML retraining
- GET  /dataset/stats     : label distribution and feature coverage stats

⚠️  MODEL CHANGE POINT:
    When preparing retraining data:
    - Use GET /dataset/export?format=csv to download labeled dataset
    - The features column contains the ML feature vectors snapshot
    - Join with raw_input for full text retraining
"""
import csv
import io
import json
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.auth.dependencies import require_admin, require_moderator
from app.schemas.auth import UserProfile
from app.db.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/")
async def get_dataset(
    page: int = 1,
    limit: int = 50,
    label: str = None,         # filter by 'phishing' | 'legitimate'
    input_type: str = None,
    admin: UserProfile = Depends(require_moderator),
):
    """
    Paginated view of the verified dataset.
    Shows all admin-approved labeled samples.
    """
    supabase = get_supabase_admin()
    offset = (page - 1) * limit

    query = (
        supabase.table("verified_dataset")
        .select("id, input_type, raw_input, true_label, approved_at, approved_by, feedback_id")
        .order("approved_at", desc=True)
    )

    if label:
        query = query.eq("true_label", label)
    if input_type:
        query = query.eq("input_type", input_type)

    resp = query.range(offset, offset + limit - 1).execute()

    # Get total counts
    phishing_count = (
        supabase.table("verified_dataset")
        .select("id", count="exact")
        .eq("true_label", "phishing")
        .execute()
    ).count or 0

    legit_count = (
        supabase.table("verified_dataset")
        .select("id", count="exact")
        .eq("true_label", "legitimate")
        .execute()
    ).count or 0

    return {
        "data": resp.data or [],
        "page": page,
        "limit": limit,
        "stats": {
            "total": phishing_count + legit_count,
            "phishing": phishing_count,
            "legitimate": legit_count,
        },
    }


@router.get("/export")
async def export_dataset(
    label: str = None,
    input_type: str = None,
    admin: UserProfile = Depends(require_admin),
):
    """
    Export verified dataset as CSV.
    Use this to prepare training data for ML models.

    ⚠️  MODEL CHANGE POINT:
        Columns in export: id, input_type, raw_input, true_label, features (JSON), approved_at
        The 'features' column contains extracted feature vectors from the original analysis.
        When retraining, you can use either raw_input (for transformer models)
        or the pre-extracted features (for XGBoost/BiLSTM).
    """
    supabase = get_supabase_admin()

    query = (
        supabase.table("verified_dataset")
        .select("id, input_type, raw_input, true_label, features, approved_at")
        .order("approved_at", desc=True)
    )
    if label:
        query = query.eq("true_label", label)
    if input_type:
        query = query.eq("input_type", input_type)

    resp = query.execute()
    rows = resp.data or []

    # Stream CSV
    def generate_csv():
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=["id", "input_type", "raw_input", "true_label", "features", "approved_at"],
        )
        writer.writeheader()
        yield output.getvalue()
        output.truncate(0)
        output.seek(0)

        for row in rows:
            row["features"] = json.dumps(row.get("features", {}))
            writer.writerow(row)
            yield output.getvalue()
            output.truncate(0)
            output.seek(0)

    filename = f"phishguard_dataset_{label or 'all'}_{input_type or 'all'}.csv"
    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/stats")
async def dataset_stats(admin: UserProfile = Depends(require_moderator)):
    """Label distribution and input type breakdown for dataset health monitoring."""
    supabase = get_supabase_admin()

    all_rows = (
        supabase.table("verified_dataset")
        .select("input_type, true_label")
        .execute()
    )

    stats = {}
    for row in (all_rows.data or []):
        key = f"{row['input_type']}_{row['true_label']}"
        stats[key] = stats.get(key, 0) + 1

    return {"breakdown": stats, "total": len(all_rows.data or [])}
