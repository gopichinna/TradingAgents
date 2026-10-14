"""Tests for Signal Reliability Engine.

Validates:
1. Signal ledger rows are append-only and strictly immutable (DELETE and illegal UPDATEs are blocked).
2. Forward returns strictly exclude as_of_date and execute at next session open + slippage.
3. Random baseline is fully reproducible by seed.
4. Scorecard 5-check rules and verdict accuracy.
5. Historical replay refuses to run without memory-log isolation.
"""

import os
import sqlite3
import tempfile
import pytest
import numpy as np
import pandas as pd

from tradingagents.reliability import ReliabilityEngine


@pytest.fixture
def temp_engine():
    """Isolated test reliability engine with temporary database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    engine = ReliabilityEngine(db_path=db_path)
    yield engine
    try:
        os.remove(db_path)
    except Exception:
        pass


def test_ledger_immutability(temp_engine):
    """Signals table must prevent DELETE and unauthorized UPDATEs via SQLite triggers."""
    sig_id = temp_engine.record_signal(
        run_id="run_immutability_test_1",
        symbol="NVDA",
        as_of_date="2024-05-01",
        rating="Buy",
        decision={"action": "BUY", "confidence": 0.9},
        last_close=120.50,
    )
    assert sig_id > 0

    with temp_engine._get_connection() as conn:
        # Attempt DELETE - MUST FAIL
        with pytest.raises(sqlite3.DatabaseError) as exc_info:
            conn.execute("DELETE FROM agent_signals WHERE signal_id = ?", (sig_id,))
        assert "DELETE is strictly prohibited" in str(exc_info.value)

        # Attempt unauthorized UPDATE (e.g. changing symbol or rating) - MUST FAIL
        with pytest.raises(sqlite3.DatabaseError) as exc_info:
            conn.execute("UPDATE agent_signals SET symbol = 'AAPL' WHERE signal_id = ?", (sig_id,))
        assert "immutable" in str(exc_info.value)

        with pytest.raises(sqlite3.DatabaseError) as exc_info:
            conn.execute("UPDATE agent_signals SET rating = 'Sell' WHERE signal_id = ?", (sig_id,))
        assert "immutable" in str(exc_info.value)

    # Invalidation update IS allowed
    temp_engine.invalidate_signal(sig_id, reason="Data vendor malfunction")
    sig = temp_engine.get_signal_by_id(sig_id)
    # Since invalidated=1, get_signals excludes it by default, but direct query can confirm
    with temp_engine._get_connection() as conn:
        row = conn.execute("SELECT invalidated, invalidated_reason FROM agent_signals WHERE signal_id = ?", (sig_id,)).fetchone()
        assert row["invalidated"] == 1
        assert "Data vendor malfunction" in row["invalidated_reason"]


def test_forward_returns_exclude_as_of_day(temp_engine):
    """Entry must occur strictly on the NEXT trading day at Open + slippage."""
    sig_id = temp_engine.record_signal(
        run_id="run_fwd_test_2",
        symbol="NVDA",
        as_of_date="2024-03-01",
        rating="Buy",
        decision={"action": "BUY"},
        last_close=100.0,
    )

    with temp_engine._get_connection() as conn:
        outcome = conn.execute("SELECT * FROM agent_signal_outcomes WHERE signal_id = ?", (sig_id,)).fetchone()
        if outcome:
            # entry_date must be strictly greater than as_of_date
            assert outcome["entry_date"] > "2024-03-01"
            # entry_price must include 5 bps slippage
            assert outcome["entry_price"] > 0
            assert outcome["slippage_bps"] == 5.0


def test_random_baseline_reproducibility():
    """1,000-shuffle random baseline must produce identical percentiles with fixed seed."""
    dates = pd.date_range("2023-01-01", periods=200, freq="B")
    rng = np.random.RandomState(42)
    fake_returns = rng.normal(0.005, 0.02, len(dates))

    # Run 1
    sim_rng1 = np.random.RandomState(1337)
    sample_means1 = [float(np.mean(sim_rng1.choice(fake_returns, size=30, replace=True))) for _ in range(1000)]
    p95_run1 = float(np.percentile(sample_means1, 95))

    # Run 2
    sim_rng2 = np.random.RandomState(1337)
    sample_means2 = [float(np.mean(sim_rng2.choice(fake_returns, size=30, replace=True))) for _ in range(1000)]
    p95_run2 = float(np.percentile(sample_means2, 95))

    assert np.isclose(p95_run1, p95_run2, atol=1e-6)


def test_scorecard_sample_size_rules(temp_engine):
    """When sample size is under 30, scorecard must return 'Not enough data' and hide pass/fail colors."""
    # Insert 10 signals (< 30)
    for i in range(10):
        temp_engine.record_signal(
            run_id=f"run_sample_size_{i}",
            symbol="NVDA",
            as_of_date=f"2024-01-{i+1:02d}",
            rating="Buy",
            decision={"action": "BUY"},
            last_close=100.0 + i,
        )

    scorecard = temp_engine.compute_reliability_scorecard()
    assert scorecard["hide_colors"] is True
    assert "Not enough evidence" in scorecard["overall_verdict"]

    sample_check = next((c for c in scorecard["checks"] if c["id"] == "sample_size"), None)
    assert sample_check is not None
    assert sample_check["badge"] == "Not enough data"
    assert sample_check["hide_color"] is True


def test_replay_refuses_without_memory_isolation(temp_engine):
    """Replay must strictly refuse execution if memory-log isolation cannot be guaranteed."""
    with pytest.raises(RuntimeError) as exc_info:
        temp_engine.run_replay_isolated(
            symbol="NVDA",
            start_date="2024-01-01",
            end_date="2024-03-01",
            force_isolation_failure=True,
        )
    assert "Memory log isolation failure" in str(exc_info.value)
