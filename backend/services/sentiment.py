"""Lexicon-based sentiment tagging for news headlines.

Deliberately dependency-free: the AI budget is spent on the Gemini tools, and
a headline lexicon is fast enough to tag 10 articles per request inline.
"""

POSITIVE = {
    "beat", "beats", "surge", "surges", "surged", "rally", "rallies", "gain",
    "gains", "jump", "jumps", "soar", "soars", "record", "upgrade", "upgraded",
    "outperform", "growth", "profit", "profits", "strong", "bullish", "boost",
    "boosts", "win", "wins", "expands", "expansion", "raises", "top", "tops",
    "optimistic", "breakthrough", "approval", "approved", "climbs", "rise",
    "rises", "high", "buyback", "dividend", "momentum",
}

NEGATIVE = {
    "miss", "misses", "missed", "plunge", "plunges", "plunged", "fall", "falls",
    "drop", "drops", "slump", "slumps", "loss", "losses", "downgrade",
    "downgraded", "underperform", "weak", "bearish", "cut", "cuts", "lawsuit",
    "probe", "investigation", "recall", "layoff", "layoffs", "warns", "warning",
    "decline", "declines", "sinks", "tumble", "tumbles", "risk", "risks",
    "fraud", "delay", "delays", "halt", "halted", "bankruptcy", "selloff",
    "concern", "concerns", "slide", "slides", "low",
}

_TRANSLATION = str.maketrans({c: " " for c in ".,;:!?\"'()[]{}—–-/"})


def score_text(text: str) -> tuple[str, float]:
    """Return (label, score) where score is in [-1, 1]."""
    if not text:
        return "neutral", 0.0

    words = text.lower().translate(_TRANSLATION).split()
    positive = sum(1 for w in words if w in POSITIVE)
    negative = sum(1 for w in words if w in NEGATIVE)
    total = positive + negative

    if total == 0:
        return "neutral", 0.0

    score = (positive - negative) / total
    if score > 0.2:
        return "positive", round(score, 2)
    if score < -0.2:
        return "negative", round(score, 2)
    return "neutral", round(score, 2)


def tag_article(title: str, description: str | None = None) -> dict:
    label, score = score_text(f"{title} {description or ''}")
    return {"sentiment": label, "sentiment_score": score}
