/**
 * Brand colours for the local equity universe.
 *
 * WHY NOT OFFICIAL LOGOS: shipping real company logos means bundling
 * trademarked artwork we do not have licences for, and the app is
 * offline/CSP-constrained so we cannot hotlink a logo CDN either. Random
 * hash-derived colours (the previous behaviour) made cards look accidental.
 *
 * This maps each symbol to its actual brand colour, so a monogram mark reads
 * as deliberate design rather than a placeholder — NVDA is NVIDIA green, KO is
 * Coca-Cola red, GS is Goldman blue. `CompanyLogo` already accepts a `src`, so
 * when a licensed logo set is available it drops in ahead of this with no
 * call-site changes.
 */
const BRAND = {
  // Technology
  AAPL: '#a2aaad', MSFT: '#00a4ef', NVDA: '#76b900', AVGO: '#cc0000',
  ORCL: '#f80000', CRM: '#00a1e0', AMD: '#ed1c24', ADBE: '#fa0f00',
  CSCO: '#1ba0d7', ACN: '#a100ff', INTC: '#0068b5', QCOM: '#3253dc',
  TXN: '#cc0000', IBM: '#0f62fe', NOW: '#62d84e', INTU: '#0077c5',
  AMAT: '#f47b20', MU: '#4e2a84', LRCX: '#00a4e4', KLAC: '#0093d0',
  ADI: '#0067b1', SNPS: '#0b3d91', CDNS: '#004c97', PANW: '#fa582d',
  CRWD: '#e01e5a', SNOW: '#29b5e8', DDOG: '#632ca6', NET: '#f38020',
  MDB: '#00ed64', ZS: '#0075be', TEAM: '#0052cc', SHOP: '#95bf47',
  SQ: '#3e4348', PLTR: '#101113', ANET: '#0075c9', DELL: '#007db8',
  HPQ: '#0096d6', SMCI: '#0a4d8c', ON: '#0a7d3e', MRVL: '#0099cc',
  FTNT: '#ee3124', WDAY: '#0875e1', TWLO: '#f22f46', OKTA: '#007dc1',
  HUBS: '#ff7a59',

  // Communication services
  GOOGL: '#4285f4', GOOG: '#4285f4', META: '#0866ff', NFLX: '#e50914',
  DIS: '#113ccf', CMCSA: '#000000', VZ: '#ee0000', T: '#00a8e0',
  TMUS: '#e20074', SPOT: '#1db954', EA: '#ff4747', TTWO: '#d6001c',
  RBLX: '#e2231a', PINS: '#e60023', SNAP: '#fffc00', WBD: '#0057b8',
  LYV: '#e11d2e', OMC: '#000000',

  // Consumer discretionary
  AMZN: '#ff9900', TSLA: '#cc0000', HD: '#f96302', MCD: '#ffc72c',
  NKE: '#111111', SBUX: '#00704a', LOW: '#004990', BKNG: '#003580',
  TJX: '#e3123d', ABNB: '#ff5a5f', CMG: '#a81612', ORLY: '#00703c',
  MAR: '#a01b2c', HLT: '#104c97', GM: '#005daa', F: '#00274d',
  RIVN: '#3a5a40', LCID: '#c9a227', DASH: '#ff3008', UBER: '#000000',
  LULU: '#d31334', ROST: '#003876', YUM: '#a32638', EBAY: '#e53238',
  ETSY: '#f56400',

  // Consumer staples
  WMT: '#0071ce', COST: '#e31837', PG: '#003da5', KO: '#f40009',
  PEP: '#005cb4', PM: '#c8102e', MO: '#004b8d', MDLZ: '#5f2b81',
  CL: '#c8102e', TGT: '#cc0000', KMB: '#00a0df', GIS: '#0075c9',
  KHC: '#e3120b', STZ: '#003057', KDP: '#c8102e', SYY: '#0072ce',
  KR: '#004990',

  // Financials
  BRK: '#00539b', JPM: '#5c2d2d', V: '#1a1f71', MA: '#eb001b',
  BAC: '#e31837', WFC: '#d71e2b', GS: '#6b90c6', MS: '#00457c',
  SCHW: '#00a0df', AXP: '#006fcf', C: '#004685', BLK: '#000000',
  SPGI: '#d6002a', CB: '#00447c', PGR: '#0071ce', PYPL: '#003087',
  COF: '#004977', USB: '#0c2074', PNC: '#f58025', AIG: '#00529b',
  MET: '#0090da', ICE: '#002d72', CME: '#0091da', COIN: '#0052ff',
  HOOD: '#00c805',

  // Healthcare
  LLY: '#d52b1e', UNH: '#002677', JNJ: '#d51900', ABBV: '#071d49',
  MRK: '#00857c', TMO: '#e71316', ABT: '#008fc7', PFE: '#0093d0',
  DHR: '#0067b1', AMGN: '#0063c3', ISRG: '#00629b', BMY: '#be2bbb',
  GILD: '#c8102e', VRTX: '#00857d', REGN: '#00263e', MDT: '#170f4f',
  CVS: '#cc0000', CI: '#00a19b', ELV: '#003da5', SYK: '#fdb913',
  BSX: '#0072ce', MRNA: '#ff0050', ZTS: '#f26722', HCA: '#003876',

  // Industrials
  GE: '#3874ba', CAT: '#ffcd11', RTX: '#c8102e', BA: '#0039a6',
  HON: '#ee3124', UNP: '#ffd200', DE: '#367c2b', LMT: '#00263e',
  UPS: '#351c15', ADP: '#d0271d', ETN: '#0073ae', MMM: '#ff0000',
  NOC: '#0066b2', GD: '#00629b', FDX: '#4d148c', CSX: '#003f7f',
  WM: '#00953b', EMR: '#004b8d', ITW: '#e31937', DAL: '#c8102e',
  UAL: '#005daa', LUV: '#304cb2',

  // Energy
  XOM: '#ee1c25', CVX: '#0054a4', COP: '#e31837', SLB: '#0014dc',
  EOG: '#c8102e', MPC: '#00539b', PSX: '#e4002b', VLO: '#00539b',
  OXY: '#e31837', WMB: '#00a0df', KMI: '#00a3e0',

  // Utilities
  NEE: '#0072ce', DUK: '#00789e', SO: '#0072ce', D: '#0072ce',
  AEP: '#f47920', EXC: '#00a9e0', SRE: '#003da5',

  // Real estate
  PLD: '#0072ce', AMT: '#e31837', EQIX: '#ed1c24', SPG: '#00447c',
  O: '#004990', CCI: '#0072ce', PSA: '#f47920',

  // Materials
  LIN: '#0072ce', SHW: '#0057b8', APD: '#0072ce', ECL: '#004b8d',
  FCX: '#f47920', NEM: '#0072ce', DOW: '#e31837', NUE: '#00539b',

  // ETFs
  SPY: '#c8102e', QQQ: '#0072ce', VOO: '#96151d', VTI: '#96151d',
  IWM: '#000000', DIA: '#c8102e', ARKK: '#00a0df', GLD: '#d4af37',
  TLT: '#000000', SCHD: '#00a0df',
}

/** Brand colour for a symbol, or null when we have no mapping. */
export function brandColor(ticker) {
  return BRAND[String(ticker || '').toUpperCase().trim()] || null
}
