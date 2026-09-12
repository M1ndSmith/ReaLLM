from __future__ import annotations

import json
from pathlib import Path


def test_top_tier_targets_are_structured_and_measurable():
    path = Path(__file__).resolve().parent.parent / "roadmap" / "top_tier_targets.json"
    data = json.loads(path.read_text(encoding="utf-8"))

    assert data["north_star"]
    assert data["kind"] == "targets"
    assert data["measured"] is False
    horizons = data["horizons"]
    assert [item["day"] for item in horizons] == [30, 90, 180]

    for horizon in horizons:
        assert horizon["focus"]
        kpis = horizon["kpis"]
        assert kpis
        for kpi in kpis:
            assert kpi["name"]
            assert isinstance(kpi["target"], int | float)
            assert kpi["unit"]
