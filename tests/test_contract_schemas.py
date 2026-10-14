"""Contract test between FastAPI OpenAPI schema and frontend types / API models.

Ensures that the API surface exposed by server.py matches the expectations of the
Next.js frontend TypeScript types (backtest, reliability, instruments).
"""

import pytest
from server import app


def test_fastapi_openapi_contract():
    """Verify that FastAPI generated OpenAPI schema matches all required frontend contract keys."""
    openapi_schema = app.openapi()
    assert openapi_schema is not None
    assert "paths" in openapi_schema
    paths = openapi_schema["paths"]

    # 1. Instrument Validation Contract (Part 1)
    assert "/api/v1/instruments/validate" in paths
    val_op = paths["/api/v1/instruments/validate"]["get"]
    param_names = [p["name"] for p in val_op.get("parameters", [])]
    assert "symbol" in param_names

    # 2. Quote Contract (Part 1, 2)
    assert "/api/v1/instruments/{symbol}/quote" in paths

    # 3. Backtest Metrics Contract (Part 2)
    assert "/api/v1/backtests" in paths
    assert "/api/v1/backtests/{backtest_id}" in paths
    assert "components" in openapi_schema and "schemas" in openapi_schema["components"]
    schemas = openapi_schema["components"]["schemas"]
    
    assert "BacktestResultResponse" in schemas
    bt_props = schemas["BacktestResultResponse"]["properties"]
    assert "metrics" in bt_props
    assert "is_stats" in bt_props
    assert "oos_stats" in bt_props
    assert "bench_stats" in bt_props

    # 4. Reliability Endpoints Contract (Part 3)
    assert "/api/v1/reliability/summary" in paths
    rel_op = paths["/api/v1/reliability/summary"]["get"]
    rel_param_names = [p["name"] for p in rel_op.get("parameters", [])]
    assert "mode" in rel_param_names

    assert "/api/v1/signals" in paths
    assert "/api/v1/signals/{signal_id}" in paths
    assert "/api/v1/reliability/stability-check" in paths
    assert "/api/v1/replay/estimate" in paths
    assert "/api/v1/replay" in paths
    assert "/api/v1/replay/{replay_id}/events" in paths

    # 5. Paper Trading Endpoints Contract
    assert "/api/v1/paper/account" in paths
    assert "/api/v1/paper/positions" in paths
    assert "/api/v1/paper/orders" in paths
    assert "/api/v1/paper/trades" in paths
    assert "/api/v1/paper/stats" in paths
    assert "/api/v1/paper/auto-trading" in paths
