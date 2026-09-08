"""GET /ai/provider — what the AI Insights workspace is allowed to claim.

The workspace leads with "Everest AI" and puts the exact provider and model in
a secondary tooltip. That tooltip must never be hardcoded in the frontend: the
model in `services/gemini.py` is pinned and has already been re-pinned once
(the 2.x generation was retired), so a duplicated string would sooner or later
assert a model that is not the one answering.

`configured` exists so the workspace can render its missing-key state BEFORE a
run, instead of showing the user a 503 they could have been warned about.

Run: .venv/bin/python -m pytest test_ai_provider.py -q
"""
import pytest

from routers import ai
from services import gemini


def test_provider_reports_the_pinned_model_not_a_copy_of_it():
    """The endpoint must read gemini.MODEL_NAME, not restate it."""
    import asyncio

    payload = asyncio.run(ai.provider(user={"_id": "u"}))

    assert payload["model"] == gemini.MODEL_NAME
    assert payload["provider"] == "Google Gemini"
    assert payload["label"] == "Everest AI"


@pytest.mark.parametrize("key,expected", [("", False), (None, False), ("abc123", True)])
def test_configured_tracks_the_api_key(monkeypatch, key, expected):
    import asyncio

    monkeypatch.setattr(ai, "GEMINI_API_KEY", key)

    assert asyncio.run(ai.provider(user={"_id": "u"}))["configured"] is expected


def test_provider_payload_carries_no_secret(monkeypatch):
    """`configured` is a boolean. The key itself must never leave the server."""
    import asyncio

    monkeypatch.setattr(ai, "GEMINI_API_KEY", "super-secret-value")

    body = str(asyncio.run(ai.provider(user={"_id": "u"})))

    assert "super-secret-value" not in body
