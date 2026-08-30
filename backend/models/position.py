from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Mode = Literal["real", "paper"]


class PositionCreate(BaseModel):
    ticker: str = Field(min_length=1, max_length=5)
    qty: float = Field(gt=0)
    avg_cost: float = Field(ge=0)
    mode: Mode = "real"
    type: Literal["stock", "option"] = "stock"

    @field_validator("ticker")
    @classmethod
    def ticker_format(cls, value: str) -> str:
        """Format-only validation: 1-5 letters.

        Whether the symbol resolves against a market data provider is a
        separate, non-blocking concern handled in the router.
        """
        symbol = (value or "").upper().strip()
        if not symbol.isalpha() or not 1 <= len(symbol) <= 5:
            raise ValueError("Ticker must be 1-5 letters")
        return symbol

    def normalized(self) -> dict:
        data = self.model_dump()
        data["ticker"] = data["ticker"].upper().strip()
        return data


class Position(BaseModel):
    id: str
    ticker: str
    qty: float
    avg_cost: float
    mode: Mode
    type: str
    company: Optional[str] = None
    sector: Optional[str] = None
    current_price: Optional[float] = None
    market_value: Optional[float] = None
    cost_basis: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    pnl_percent: Optional[float] = None
