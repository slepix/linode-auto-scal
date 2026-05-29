from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from ..db.base import get_db
from ..middleware.auth import require_permission
from ..schemas.group import GroupCreate, GroupUpdate, GroupResponse, MetricScalingConfig
from ..services.group_service import create_group, get_groups, get_group, update_group, delete_group, group_to_response

router = APIRouter(prefix="/v1/groups", tags=["Groups"])


@router.post("", response_model=GroupResponse, status_code=201)
def create_group_endpoint(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("groups:write")),
):
    group = create_group(db, payload)
    return group_to_response(group)


@router.get("", response_model=List[GroupResponse])
def list_groups_endpoint(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("status:read")),
):
    groups = get_groups(db, skip, limit)
    return [group_to_response(g) for g in groups]


@router.get("/{group_id}", response_model=GroupResponse)
def get_group_endpoint(
    group_id: str,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("status:read")),
):
    group = get_group(db, group_id)
    return group_to_response(group)


@router.patch("/{group_id}", response_model=GroupResponse)
def update_group_endpoint(
    group_id: str,
    payload: GroupUpdate,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("groups:write")),
):
    group = update_group(db, group_id, payload)
    return group_to_response(group)


@router.delete("/{group_id}")
def delete_group_endpoint(
    group_id: str,
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
    _key=Depends(require_permission("groups:delete")),
):
    return delete_group(db, group_id, force)


class TestMetricRequest(BaseModel):
    metric_scaling: MetricScalingConfig


class TestMetricResponse(BaseModel):
    success: bool
    value: Optional[float] = None
    error: Optional[str] = None
    raw_response: Optional[str] = None


@router.post("/{group_id}/test-metric", response_model=TestMetricResponse)
async def test_metric_endpoint(
    group_id: str,
    payload: TestMetricRequest,
    db: Session = Depends(get_db),
    _key=Depends(require_permission("groups:write")),
):
    from ..services.metric_test_service import fetch_metric_value
    get_group(db, group_id)
    return await fetch_metric_value(payload.metric_scaling)
