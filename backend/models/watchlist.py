from typing import Optional

from pydantic import BaseModel, Field, field_validator


class WatchlistCreate(BaseModel):
    ticker: str = Field(min_length=1, max_length=5)

    @field_validator("ticker")
    @classmethod
    def ticker_format(cls, value: str) -> str:
        """Format-only validation, matching PositionCreate.

        Whether the symbol currently resolves against a market data provider is
        a separate, non-blocking concern handled in the router.
        """
        symbol = (value or "").upper().strip()
        if not symbol.isalpha() or not 1 <= len(symbol) <= 5:
            raise ValueError("Ticker must be 1-5 letters")
        return symbol

    def normalized_ticker(self) -> str:
        return self.ticker.upper().strip()


class WatchlistItem(BaseModel):
    id: str
    ticker: str
    company: Optional[str] = None
    sector: Optional[str] = None
    price: Optional[float] = None
    change: Optional[float] = None
    change_percent: Optional[float] = None
    sparkline: list[float] = []
