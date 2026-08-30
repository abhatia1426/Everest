"""Gemini (gemini-3.6-flash) helpers returning structured JSON.

Every tool asks the model for JSON via response_mime_type and validates the
shape before it reaches the frontend, so the UI never has to parse prose.
"""
import asyncio
import json
import logging
from typing import Any, Optional

import google.generativeai as genai
from fastapi import HTTPException

from config import GEMINI_API_KEY

log = logging.getLogger(__name__)

# PINNED, and pinned deliberately to a CURRENT model.
#
# The 2.x generation is retired: gemini-2.0-flash, and as of this change
# gemini-2.5-flash / -flash-lite / -pro too, all return
#   404 "This model is no longer available to new users"
# even though list_models() still reports them, so the model listing cannot be
# used to check availability — only an actual generateContent call can.
#
# `gemini-flash-latest` would track the current flash tier automatically, but an
# alias that silently changes model behaviour is a poor fit here: every tool in
# this file depends on the model honouring a response_schema, and a shift in
# conformance would surface as malformed-JSON errors with no deploy to blame.
# Pinning trades a scheduled update for predictable output.
MODEL_NAME = "gemini-3.6-flash"

_configured = False


def _model(schema: Optional[dict] = None):
    global _configured
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured. Add it to backend/.env to use AI tools.",
        )
    if not _configured:
        genai.configure(api_key=GEMINI_API_KEY)
        _configured = True

    generation_config: dict[str, Any] = {
        "temperature": 0.4,
        "response_mime_type": "application/json",
    }
    if schema:
        generation_config["response_schema"] = schema

    return genai.GenerativeModel(
        MODEL_NAME,
        generation_config=generation_config,
        system_instruction=(
            "You are Everest's market analyst. You are concise, specific and "
            "quantitative. You never give personalised financial advice and you "
            "always reply with valid JSON matching the requested shape."
        ),
    )


def _blocking_generate(prompt: str, schema: Optional[dict]) -> dict:
    response = _model(schema).generate_content(prompt)
    text = (response.text or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[1] if "\n" in text else text
    return json.loads(text)


async def generate_json(prompt: str, schema: Optional[dict] = None) -> dict:
    try:
        return await asyncio.to_thread(_blocking_generate, prompt, schema)
    except HTTPException:
        raise
    except json.JSONDecodeError as exc:
        log.warning("Gemini returned non-JSON: %s", exc)
        raise HTTPException(
            status_code=502, detail="The model returned a malformed response. Try again."
        ) from exc
    except Exception as exc:  # noqa: BLE001
        # Provider errors are verbose (Gemini's quota payload runs to ~40 lines).
        # Log the detail, show the user something they can act on.
        log.exception("Gemini call failed")
        text = str(exc).lower()

        if "429" in text or "quota" in text or "rate limit" in text:
            raise HTTPException(
                status_code=429,
                detail=(
                    "The AI service is rate-limited right now. This is a quota limit on the "
                    "Gemini API key, not a problem with your portfolio. Try again shortly."
                ),
            ) from exc

        if "api key" in text or "permission" in text or "401" in text or "403" in text:
            raise HTTPException(
                status_code=502,
                detail="The AI service rejected the configured API key.",
            ) from exc

        # A RETIRED MODEL IS NOT AN OUTAGE, and must not be reported as one.
        #
        # Google returns 404 "no longer available to new users" when a model is
        # withdrawn. Folding that into the generic message below cost real
        # debugging time: the endpoints looked like they were failing
        # intermittently, so the obvious response was to wait and retry, when in
        # fact nothing would ever recover without a code change. Name the model
        # and say it is configuration.
        if "404" in text or "not found" in text or "no longer available" in text:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"The configured AI model ({MODEL_NAME}) is no longer available "
                    "from the provider. This needs a model update in Everest — it is "
                    "a configuration problem, not a temporary outage."
                ),
            ) from exc

        raise HTTPException(
            status_code=502,
            detail="The AI service is unavailable right now. Please try again shortly.",
        ) from exc


ANALYST_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "sector_concentration": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sector": {"type": "string"},
                    "weight_percent": {"type": "number"},
                    "comment": {"type": "string"},
                },
                "required": ["sector", "weight_percent", "comment"],
            },
        },
        "risk_flags": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "severity": {"type": "string"},
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                },
                "required": ["severity", "title", "detail"],
            },
        },
        "top_performers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string"},
                    "contribution": {"type": "string"},
                    "note": {"type": "string"},
                },
                "required": ["ticker", "contribution", "note"],
            },
        },
        "detractors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string"},
                    "contribution": {"type": "string"},
                    "note": {"type": "string"},
                },
                "required": ["ticker", "contribution", "note"],
            },
        },
    },
    "required": ["summary", "sector_concentration", "risk_flags", "top_performers", "detractors"],
}

THESIS_SCHEMA = {
    "type": "object",
    "properties": {
        "ticker": {"type": "string"},
        "direction": {"type": "string"},
        "summary": {"type": "string"},
        "bull_case": {"type": "array", "items": {"type": "string"}},
        "bear_case": {"type": "array", "items": {"type": "string"}},
        "key_risks": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "integer"},
        "confidence_rationale": {"type": "string"},
    },
    "required": [
        "ticker", "direction", "summary", "bull_case", "bear_case",
        "key_risks", "confidence", "confidence_rationale",
    ],
}

SCREENER_SCHEMA = {
    "type": "object",
    "properties": {
        "style": {"type": "string"},
        "summary": {"type": "string"},
        "ranked": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rank": {"type": "integer"},
                    "ticker": {"type": "string"},
                    "score": {"type": "number"},
                    "rationale": {"type": "string"},
                    "verdict": {"type": "string"},
                },
                "required": ["rank", "ticker", "score", "rationale", "verdict"],
            },
        },
    },
    "required": ["style", "summary", "ranked"],
}

EARNINGS_SCHEMA = {
    "type": "object",
    "properties": {
        "ticker": {"type": "string"},
        "next_report": {"type": "string"},
        "analyst_expectations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string"},
                    "expectation": {"type": "string"},
                },
                "required": ["metric", "expectation"],
            },
        },
        "last_quarter_recap": {"type": "string"},
        "key_metrics_to_watch": {"type": "array", "items": {"type": "string"}},
        "catalysts": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "ticker", "next_report", "analyst_expectations",
        "last_quarter_recap", "key_metrics_to_watch", "catalysts",
    ],
}


COMPARE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "verdict": {"type": "string"},
        "rows": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "dimension": {"type": "string"},
                    "assessments": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "ticker": {"type": "string"},
                                "value": {"type": "string"},
                                "note": {"type": "string"},
                            },
                            "required": ["ticker", "value", "note"],
                        },
                    },
                },
                "required": ["dimension", "assessments"],
            },
        },
        "risks": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "verdict", "rows", "risks"],
}

RISK_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "overall_level": {"type": "string"},
        "factors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "level": {"type": "string"},
                    "finding": {"type": "string"},
                    "evidence": {"type": "string"},
                },
                "required": ["name", "level", "finding", "evidence"],
            },
        },
        "diversification_notes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "overall_level", "factors", "diversification_notes"],
}
