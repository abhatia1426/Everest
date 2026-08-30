from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

Mode = Literal["real", "paper"]
ContractType = Literal["call", "put"]


class OptionCreate(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    strike: float = Field(gt=0)
    expiry: date
    type: ContractType
    qty: float = Field(gt=0)
    avg_cost: float = Field(ge=0)
    mode: Mode = "real"

    def normalized(self) -> dict:
        data = self.model_dump()
        data["ticker"] = data["ticker"].upper().strip()
        data["expiry"] = data["expiry"].isoformat()
        return data


class OptionPosition(BaseModel):
    id: str
    ticker: str
    strike: float
    expiry: str
    type: ContractType
    qty: float
    avg_cost: float
    mode: Mode
    underlying_price: Optional[float] = None
    est_value: Optional[float] = None
    cost_basis: Optional[float] = None
    pnl: Optional[float] = None
    pnl_percent: Optional[float] = None
    dte: Optional[int] = None
