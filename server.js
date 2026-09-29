// server.js - Real-Time Indian Market Data Server (NSE via Yahoo Finance)
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = process.env.PORT || 3000;
const DIR  = path.resolve(__dirname);

// NOTE: All prices are NSE prices via Yahoo Finance (.NS tickers).
// BSE prices will differ slightly — they are two separate exchanges.
const WATCHLIST = [
  // Large Cap / NIFTY 50
  { sym: 'RELIANCE.NS',    name: 'Reliance Industries',   base: 1257  },
  { sym: 'TCS.NS',         name: 'Tata Consultancy Svc',  base: 3600  },
  { sym: 'HDFCBANK.NS',    name: 'HDFC Bank',             base: 1700  },
  { sym: 'INFY.NS',        name: 'Infosys',               base: 1790  },
  { sym: 'ICICIBANK.NS',   name: 'ICICI Bank',            base: 1250  },
  { sym: 'WIPRO.NS',       name: 'Wipro',                 base: 570   },
  { sym: 'SBIN.NS',        name: 'State Bank of India',   base: 775   },
  { sym: 'BAJFINANCE.NS',  name: 'Bajaj Finance',         base: 6800  },
  { sym: 'ADANIENT.NS',    name: 'Adani Enterprises',     base: 2400  },
  { sym: 'LT.NS',          name: 'Larsen & Toubro',       base: 3560  },
  { sym: 'ASIANPAINT.NS',  name: 'Asian Paints',          base: 2800  },
  { sym: 'MARUTI.NS',      name: 'Maruti Suzuki',         base: 12500 },
  { sym: 'KOTAKBANK.NS',   name: 'Kotak Mahindra Bank',   base: 1850  },
  { sym: 'AXISBANK.NS',    name: 'Axis Bank',             base: 1150  },
  { sym: 'HINDUNILVR.NS',  name: 'Hindustan Unilever',    base: 2550  },
  { sym: 'ITC.NS',         name: 'ITC Limited',           base: 470   },
  { sym: 'SUNPHARMA.NS',   name: 'Sun Pharmaceutical',    base: 1750  },
  { sym: 'POWERGRID.NS',   name: 'Power Grid Corp',       base: 330   },
  { sym: 'NTPC.NS',        name: 'NTPC Limited',          base: 390   },
  { sym: 'ONGC.NS',        name: 'ONGC',                  base: 285   },
  { sym: 'TECHM.NS',       name: 'Tech Mahindra',         base: 1600  },
  { sym: 'HCLTECH.NS',     name: 'HCL Technologies',      base: 1800  },
  { sym: 'BHARTIARTL.NS',  name: 'Bharti Airtel',         base: 1680  },
  { sym: 'ULTRACEMCO.NS',  name: 'UltraTech Cement',      base: 11500 },
  { sym: 'GRASIM.NS',      name: 'Grasim Industries',     base: 2700  },
  { sym: 'ADANIPORTS.NS',  name: 'Adani Ports',           base: 1380  },
  { sym: 'BAJAJFINSV.NS',  name: 'Bajaj Finserv',         base: 1750  },
  { sym: 'DIVISLAB.NS',    name: "Divi's Laboratories",   base: 5400  },
  { sym: 'DRREDDY.NS',     name: "Dr. Reddy's Labs",      base: 6800  },
  { sym: 'NESTLEIND.NS',   name: 'Nestle India',          base: 24000 },
  { sym: 'CIPLA.NS',       name: 'Cipla',                 base: 1550  },
  { sym: 'COALINDIA.NS',   name: 'Coal India',            base: 465   },
  { sym: 'JSWSTEEL.NS',    name: 'JSW Steel',             base: 950   },
  { sym: 'TATASTEEL.NS',   name: 'Tata Steel',            base: 165   },
  { sym: 'M&M.NS',         name: 'Mahindra & Mahindra',   base: 2900  },
];

const INDICES = [
  { sym: '^NSEI',    name: 'NIFTY 50' },
  { sym: '^BSESN',   name: 'SENSEX' },
  { sym: '^NSEBANK', name: 'BANK NIFTY' }
];

const ALL_SYMBOLS = [...INDICES.map(i => i.sym), ...WATCHLIST.map(w => w.sym)];

// In-memory cache
let quotesCache = { data: null, ts: 0 };
let historyCache = {};
let newsCache = { data: null, ts: 0 };

function fetchYahoo(endpoint) {
  return new Promise((resolve, reject) => {
    const targetUrl = 'https://query1.finance.yahoo.com' + endpoint;
    const req = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 12000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('JSON parse error: ' + e.message));
          }
        } else {
          reject(new Error(`Yahoo returned status ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Yahoo request timeout')); });
  });
}

// Fetch single quote — uses regularMarketPreviousClose for accurate Δ/% calculations
async function getQuote(symbol) {
  try {
    // 5m interval gives both real-time price AND the correct regularMarketPreviousClose
    const json = await fetchYahoo(
      `/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false`
    );
    const result = json.chart && json.chart.result && json.chart.result[0];
    if (!result) throw new Error('No result for ' + symbol);
    const meta  = result.meta;
    const price = meta.regularMarketPrice || 0;

    // KEY FIX: regularMarketPreviousClose is the correct official previous day close.
    // chartPreviousClose can be stale / adjusted and causes wrong % display.
    const prev = meta.regularMarketPreviousClose
              || meta.chartPreviousClose
              || meta.previousClose
              || price;

    const chg = +(price - prev).toFixed(2);
    const pct = prev > 0 ? +((chg / prev) * 100).toFixed(2) : 0;
    return {
      sym:      symbol,
      price:    price,
      prev:     prev,
      chg:      chg,
      pct:      pct,
      open:     meta.regularMarketOpen      || prev,
      high:     meta.regularMarketDayHigh   || price,
      low:      meta.regularMarketDayLow    || price,
      wh:       meta.fiftyTwoWeekHigh       || price * 1.2,
      wl:       meta.fiftyTwoWeekLow        || price * 0.8,
      vol:      meta.regularMarketVolume    || 0,
      mcap:     meta.marketCap              || 0,
      exchange: meta.exchangeName           || 'NSE',
      time:     meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
      real:     true
    };
  } catch (err) {
    console.warn(`[QUOTE FAIL] ${symbol}: ${err.message}`);
    return null;
  }
}

// Fetch all quotes
async function getAllQuotes() {
  const now = Date.now();
  if (quotesCache.data && (now - quotesCache.ts < 15000)) {
    return quotesCache.data;
  }

  // Fetch in batches of 8 to avoid Yahoo Finance rate limits
  const BATCH = 8;
  const prices = {};
  for (let i = 0; i < ALL_SYMBOLS.length; i += BATCH) {
    const batch   = ALL_SYMBOLS.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(sym => getQuote(sym)));
    results.forEach(res => {
      if (res) prices[res.sym] = res;
    });
    if (i + BATCH < ALL_SYMBOLS.length) {
      await new Promise(r => setTimeout(r, 350));
    }
  }


  // Calculate Market Breadth
  let adv = 0, dec = 0, unc = 0;
  WATCHLIST.forEach(s => {
    const p = prices[s.sym];
    if (p) {
      if (p.pct > 0.05) adv++;
      else if (p.pct < -0.05) dec++;
      else unc++;
    }
  });

  const payload = {
    prices,
    breadth: { adv, dec, unc, total: adv + dec + unc },
    timestamp: now,
    real: true
  };

  quotesCache = { data: payload, ts: now };
  return payload;
}

// Fetch candle history
async function getHistory(symbol, tf) {
  const cacheKey = `${symbol}_${tf}`;
  const now = Date.now();
  if (historyCache[cacheKey] && (now - historyCache[cacheKey].ts < 60000)) {
    return historyCache[cacheKey].data;
  }

  let range = '5d';
  let interval = '15m';
  if (tf === '5d')  { range = '5d';  interval = '15m'; }
  if (tf === '1mo') { range = '1mo'; interval = '1d'; }
  if (tf === '3mo') { range = '3mo'; interval = '1d'; }
  if (tf === '1y')  { range = '1y';  interval = '1d'; }

  try {
    const json = await fetchYahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`);
    const res = json.chart.result[0];
    const ts = res.timestamp || [];
    const closes = (res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
    
    let validPts = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined && !isNaN(closes[i])) {
        validPts.push({
          t: ts[i] * 1000,
          c: +closes[i].toFixed(2)
        });
      }
    }

    if (tf === '1d' && validPts.length > 0) {
      const lastTs = validPts[validPts.length - 1].t;
      const lastDayString = new Date(lastTs).toDateString();
      const oneDayPts = validPts.filter(p => new Date(p.t).toDateString() === lastDayString);
      validPts = oneDayPts.length >= 3 ? oneDayPts : validPts.slice(-25);
    }

    const payload = { symbol, tf, points: validPts, real: true };
    historyCache[cacheKey] = { data: payload, ts: now };
    return payload;
  } catch (err) {
    console.warn(`History fetch failed for ${symbol} (${tf}):`, err.message);
    return { symbol, tf, points: [], real: false, error: err.message };
  }
}

// Fetch real RSS news
function fetchNews() {
  return new Promise((resolve) => {
    const now = Date.now();
    if (newsCache.data && (now - newsCache.ts < 300000)) {
      return resolve(newsCache.data);
    }

    const rssUrl = 'https://news.google.com/rss/search?q=Indian+Stock+Market+NIFTY+Sensex+NSE&hl=en-IN&gl=IN&ceid=IN:en';
    https.get(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const items = body.match(/<item>[\s\S]*?<\/item>/g) || [];
          const list = [];
          for (let i = 0; i < Math.min(items.length, 12); i++) {
            const raw = items[i];
            const tMatch = raw.match(/<title>(.*?)<\/title>/);
            const pMatch = raw.match(/<pubDate>(.*?)<\/pubDate>/);
            const sMatch = raw.match(/<source[^>]*>(.*?)<\/source>/);
            const title = tMatch ? tMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : '';
            const pubDate = pMatch ? pMatch[1] : '';
            const source = sMatch ? sMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : 'Market News';
            
            const lower = title.toLowerCase();
            let sentiment = 'neu';
            if (lower.includes('gain') || lower.includes('high') || lower.includes('rally') || lower.includes('surge') || lower.includes('jump') || lower.includes('soar') || lower.includes('bull')) {
              sentiment = 'pos';
            } else if (lower.includes('fall') || lower.includes('drop') || lower.includes('sink') || lower.includes('slump') || lower.includes('crash') || lower.includes('tumble') || lower.includes('bear') || lower.includes('down')) {
              sentiment = 'neg';
            }

            let timeStr = 'Recently';
            if (pubDate) {
              const diffMs = Date.now() - new Date(pubDate).getTime();
              const diffMin = Math.floor(diffMs / 60000);
              if (diffMin < 60) timeStr = `${Math.max(1, diffMin)}m ago`;
              else {
                const diffHrs = Math.floor(diffMin / 60);
                if (diffHrs < 24) timeStr = `${diffHrs}h ago`;
                else timeStr = `${Math.floor(diffHrs / 24)}d ago`;
              }
            }

            if (title) {
              list.push({
                h: title,
                src: source,
                t: timeStr,
                s: sentiment
              });
            }
          }
          newsCache = { data: list, ts: now };
          resolve(list);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// ── IMPROVED SIGNAL ENGINE ────────────────────────────────────────────────────
// Uses: 50/200 EMA trend filter + RSI + MACD crossover + Volume + 52W range
// All signals computed on 1Y daily OHLCV data for much higher reliability

function emaSeries(arr, period) {
  const k = 2 / (period + 1);
  const out = [arr[0]];
  for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
  return out;
}

function rsiCalc(closes, p = 14) {
  if (closes.length <= p) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - p; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  return +(100 - 100 / (1 + g / (l || 0.001))).toFixed(2);
}

function atrCalc(candles, p = 14) {
  if (candles.length < 2) return candles[0] ? candles[0].c * 0.02 : 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const pc = candles[i - 1].c;
    trs.push(Math.max(
      candles[i].h - candles[i].l,
      Math.abs(candles[i].h - pc),
      Math.abs(candles[i].l - pc)
    ));
  }
  const sl = trs.slice(-p);
  return sl.reduce((a, b) => a + b, 0) / sl.length;
}

// ── NIFTY 50 MARKET REGIME ENGINE ──────────────────────────────────────────
// Caches 2Y daily candles of ^NSEI to evaluate whether broad market is above 200-EMA
let niftyDataCache = { data: null, ts: 0 };

async function getNiftyData() {
  const now = Date.now();
  if (niftyDataCache.data && (now - niftyDataCache.ts < 300000)) {
    return niftyDataCache.data;
  }
  try {
    const json = await fetchYahoo('/v8/finance/chart/%5ENSEI?range=2y&interval=1d&includePrePost=false');
    const res = json.chart && json.chart.result && json.chart.result[0];
    if (!res || !res.timestamp) return null;
    const q = res.indicators.quote[0];
    const candles = [];
    for (let i = 0; i < res.timestamp.length; i++) {
      if (q.close[i] != null) {
        candles.push({
          t: res.timestamp[i] * 1000,
          c: q.close[i]
        });
      }
    }
    if (candles.length < 50) return null;
    const closes = candles.map(c => c.c);
    const ema200 = emaSeries(closes, Math.min(200, Math.floor(closes.length * 0.75)));
    const latestPrice = closes[closes.length - 1];
    const latestEma = ema200[ema200.length - 1];
    const isBullish = latestPrice > latestEma;

    // Date lookup map for backtesting (YYYY-MM-DD -> boolean: isBullish)
    const dateMap = {};
    for (let i = 0; i < candles.length; i++) {
      const dStr = new Date(candles[i].t).toISOString().slice(0, 10);
      dateMap[dStr] = closes[i] > ema200[i];
    }

    const result = {
      latestPrice: +latestPrice.toFixed(1),
      latestEma: +latestEma.toFixed(1),
      isBullish,
      dateMap
    };
    niftyDataCache = { data: result, ts: now };
    return result;
  } catch (err) {
    console.warn('[NIFTY] Fetch failed:', err.message);
    return null;
  }
}

function getImprovedSignal(candles, niftyData = null) {
  const EMPTY = { signal: 'HOLD', score: 0, reasons: [], rsi: 50, trend: 'UNKNOWN', confidence: 50, stopLoss: null, target: null, filters: [] };
  if (candles.length < 30) return EMPTY;

  const closes  = candles.map(c => c.c);
  const volumes = candles.map(c => c.v || 0);
  const n       = closes.length;
  let score     = 0;
  const reasons = [];

  // ── 1. Stock Trend (50 / 200 EMA) ──────────────────────────────────────────
  const tPeriod  = Math.min(200, Math.floor(n * 0.75));
  const sPeriod  = Math.min(50,  Math.floor(n * 0.25));
  const tEMAarr  = emaSeries(closes, tPeriod);
  const sEMAarr  = emaSeries(closes, sPeriod);
  const price    = closes[n - 1];
  const ltEMA    = tEMAarr[n - 1];
  const lsEMA    = sEMAarr[n - 1];
  const uptrend  = price > ltEMA && lsEMA > ltEMA;
  const downtrend= price < ltEMA && lsEMA < ltEMA;

  if (uptrend)        { score += 2.5; reasons.push(`Stock Trend: Price > ${tPeriod}-EMA (₹${ltEMA.toFixed(0)}) & 50 > 200 EMA (Bullish structure)`); }
  else if (downtrend) { score -= 2.5; reasons.push(`Stock Trend: Price < ${tPeriod}-EMA (₹${ltEMA.toFixed(0)}) (Downtrend structure)`); }
  else                { reasons.push('Stock Trend: Mixed / Sideways structure'); }

  // ── 2. RSI with Pullback / Dip-Buying Reversal Logic ─────────────────────
  const rsi = rsiCalc(closes);
  const rsiPrev = closes.length >= 2 ? rsiCalc(closes.slice(0, n - 1)) : rsi;
  const rsiTickingUp = rsi > rsiPrev;

  if (rsi < 35) {
    score += 1.5;
    reasons.push(`RSI ${rsi.toFixed(0)} — Deep oversold (Potential reversal discount)`);
  } else if (rsi >= 35 && rsi <= 52 && rsiTickingUp && uptrend) {
    score += 2.0;
    reasons.push(`RSI ${rsi.toFixed(0)} — Pullback bounce setup in ongoing uptrend`);
  } else if (rsi < 48) {
    score += 0.5;
    reasons.push(`RSI ${rsi.toFixed(0)} — Moderate pullback zone`);
  } else if (rsi > 70) {
    score -= 2.5;
    reasons.push(`RSI ${rsi.toFixed(0)} — Extremely overbought (Exhaustion risk)`);
  } else if (rsi > 62) {
    score -= 1.0;
    reasons.push(`RSI ${rsi.toFixed(0)} — Extended momentum zone`);
  }

  // ── 3. MACD Momentum Crossover ───────────────────────────────────────────
  const e12      = emaSeries(closes, 12);
  const e26      = emaSeries(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const sigLine  = emaSeries(macdLine.slice(26), 9);
  const L        = sigLine.length;
  let macdBullish = false;
  let macdText = 'Neutral';

  if (L >= 2) {
    const histNow  = macdLine[n - 1] - sigLine[L - 1];
    const histPrev = macdLine[n - 2] - sigLine[L - 2];
    if (histNow > 0 && histPrev <= 0) {
      score += 2.0; macdBullish = true; macdText = 'Bullish Crossover ✓';
      reasons.push('MACD Bullish Crossover confirmed ✓');
    } else if (histNow < 0 && histPrev >= 0) {
      score -= 2.0; macdText = 'Bearish Crossover ✗';
      reasons.push('MACD Bearish Crossover confirmed ✗');
    } else if (histNow > 0 && histNow > histPrev) {
      score += 0.5; macdBullish = true; macdText = 'Expanding Bullish';
      reasons.push('MACD histogram expanding bullish');
    } else if (histNow < 0 && histNow < histPrev) {
      score -= 0.5; macdText = 'Expanding Bearish';
      reasons.push('MACD histogram expanding bearish');
    } else if (histNow > 0) {
      macdBullish = true; macdText = 'Bullish territory';
    }
  }

  // ── 4. Volume Surge Confirmation Filter ──────────────────────────────────
  const avgVol  = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = volumes[n - 1];
  const vRatio  = avgVol > 0 ? lastVol / avgVol : 1;
  const volumePassed = vRatio >= 1.25;

  if (vRatio >= 1.8 && score > 0) {
    score += 1.5;
    reasons.push(`Volume Surge: ${vRatio.toFixed(1)}x 20-day avg — Strong institutional inflow`);
  } else if (vRatio >= 1.25 && score > 0) {
    score += 0.5;
    reasons.push(`Volume Confirmation: ${vRatio.toFixed(1)}x 20-day avg — Healthy participation`);
  } else if (score > 0 && vRatio < 1.0) {
    score -= 1.0;
    reasons.push(`Low Volume Warning: ${vRatio.toFixed(1)}x 20-day avg — Move lacks volume confirmation`);
  }

  // ── 5. 52-Week Range Position ─────────────────────────────────────────────
  const yClose   = closes.slice(-252);
  const y52Low   = Math.min(...yClose);
  const y52High  = Math.max(...yClose);
  const rangePos = y52High > y52Low ? (price - y52Low) / (y52High - y52Low) : 0.5;
  if      (rangePos < 0.15) { score += 0.5; reasons.push('52W Range: Near annual support zone'); }
  else if (rangePos > 0.92) { score -= 0.5; reasons.push('52W Range: Near annual resistance — pullback likely'); }

  // ── 6. Extra Filter: Market Regime (NIFTY 50 > 200 EMA) ──────────────────
  let marketFilterPassed = false;
  let marketDetail = 'NIFTY data loading...';
  if (niftyData) {
    marketFilterPassed = niftyData.isBullish;
    marketDetail = `NIFTY ₹${niftyData.latestPrice.toLocaleString('en-IN')} vs 200-EMA ₹${niftyData.latestEma.toLocaleString('en-IN')}`;
    if (niftyData.isBullish) {
      reasons.push(`✅ Market Regime: NIFTY 50 > 200-EMA (${marketDetail}) — Bullish market tailwind`);
    } else {
      reasons.push(`⚠️ Market Regime: NIFTY 50 < 200-EMA (${marketDetail}) — Market in correction`);
    }
  }

  // ── Filter Checklist Construction ─────────────────────────────────────────
  const filters = [
    {
      id: 'market',
      name: 'Market Regime (NIFTY > 200-EMA)',
      passed: marketFilterPassed,
      detail: marketDetail
    },
    {
      id: 'trend',
      name: 'Stock Trend (Price > 200-EMA)',
      passed: uptrend,
      detail: `Price ₹${price.toFixed(0)} vs 200-EMA ₹${ltEMA.toFixed(0)}`
    },
    {
      id: 'volume',
      name: 'Volume Surge (≥1.25x 20D Avg)',
      passed: volumePassed,
      detail: `${vRatio.toFixed(1)}x 20-day average volume`
    },
    {
      id: 'momentum',
      name: 'Momentum Quality (RSI & MACD)',
      passed: (rsi >= 35 && rsi <= 65) || macdBullish,
      detail: `RSI ${rsi.toFixed(0)} | MACD: ${macdText}`
    },
    {
      id: 'mode',
      name: 'Long-Only CNC Mode (Zerodha Kite)',
      passed: true,
      detail: 'Delivery / CNC compliant (Overnight shorting excluded)'
    }
  ];

  const passedCount = filters.filter(f => f.passed).length;
  const filtersPassedStr = `${passedCount}/${filters.length}`;

  // ── Final Signal Determination with Extra Filters ────────────────────────
  let signal = 'HOLD';

  if (score >= 3.0) {
    // Candidate for BUY: Check extra filter barriers
    if (!marketFilterPassed) {
      // Market filter blocks fresh swing long
      signal = 'HOLD';
      reasons.unshift('🚫 Filter Barrier: NIFTY 50 below 200-EMA — Fresh BUY signal withheld to avoid bear market trap');
    } else if (!volumePassed && vRatio < 1.0) {
      signal = 'HOLD';
      reasons.unshift('⚠️ Filter Barrier: Volume too low (<1.0x) to confirm institutional breakout');
    } else if (!uptrend && rsi > 50) {
      signal = 'HOLD';
      reasons.unshift('⚠️ Filter Barrier: Counter-trend setup without oversold discount');
    } else {
      signal = 'BUY';
    }
  } else if (score <= -3.0) {
    // In Long-Only CNC swing trading, sell signals mean EXIT / AVOID
    signal = 'EXIT';
  } else {
    signal = 'HOLD';
  }

  const atr    = atrCalc(candles.slice(-14));
  const sl     = signal === 'BUY'  ? +(price - atr * 1.5).toFixed(2)
               : signal === 'EXIT' ? +(price + atr * 1.5).toFixed(2) : null;
  const tgt    = signal === 'BUY'  ? +(price + atr * 3.0).toFixed(2)
               : signal === 'EXIT' ? +(price - atr * 3.0).toFixed(2) : null;

  // Base confidence on filter quality + score
  const confidence = Math.min(94, Math.round(45 + (passedCount * 8) + (Math.abs(score) * 2)));

  return {
    signal,
    score:      +score.toFixed(2),
    confidence,
    reasons,
    rsi,
    trend:      uptrend ? 'UP' : downtrend ? 'DOWN' : 'SIDEWAYS',
    trendEMA:   +ltEMA.toFixed(2),
    atr:        +atr.toFixed(2),
    stopLoss:   sl,
    target:     tgt,
    riskReward: '2:1 (1.5× ATR Stop, 3.0× ATR Target)',
    filters,
    filtersPassed: filtersPassedStr,
    marketRegime: marketFilterPassed ? 'BULLISH' : 'BEARISH'
  };
}

// 5-minute cache so /api/signal doesn't refetch 1Y data on every click
const signalCache = {};

async function fetchSignalForSymbol(symbol) {
  const now = Date.now();
  if (signalCache[symbol] && (now - signalCache[symbol].ts < 300000)) {
    return signalCache[symbol].data;
  }
  const [stockJson, niftyData] = await Promise.all([
    fetchYahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false`),
    getNiftyData()
  ]);
  const res = stockJson.chart && stockJson.chart.result && stockJson.chart.result[0];
  if (!res || !res.timestamp) throw new Error('No data for ' + symbol);
  const q = res.indicators.quote[0];
  const candles = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    if (q.close[i] != null) {
      candles.push({
        t: res.timestamp[i] * 1000,
        o: q.open[i]   || q.close[i],
        h: q.high[i]   || q.close[i],
        l: q.low[i]    || q.close[i],
        c: q.close[i],
        v: q.volume[i] || 0
      });
    }
  }
  const data = { symbol, ...getImprovedSignal(candles, niftyData) };
  signalCache[symbol] = { data, ts: now };
  return data;
}

// ── BACKTEST ENGINE WITH 4 EXTRA FILTERS ───────────────────────────────────────────
// Walk-forward daily backtest (2 Years) with:
// 1. NIFTY 50 200-EMA Market Regime Filter
// 2. Volume Confirmation Filter (≥1.15x 20D Avg)
// 3. Long-Only CNC Swing Trading (No overnight shorting)
// 4. Breakeven Profit-Lock Trailing Stop & 25-Day Holding Period (2:1 R:R)
async function runBacktest(symbol) {
  try {
    const [stockJson, niftyData] = await Promise.all([
      fetchYahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&includePrePost=false`),
      getNiftyData()
    ]);
    const res = stockJson.chart && stockJson.chart.result && stockJson.chart.result[0];
    if (!res || !res.timestamp) return { error: 'No data' };
    const q = res.indicators.quote[0];
    const candles = [];
    for (let i = 0; i < res.timestamp.length; i++) {
      if (q.close[i] != null && q.high[i] != null && q.low[i] != null) {
        candles.push({
          t: res.timestamp[i] * 1000,
          o: q.open[i]   || q.close[i],
          h: q.high[i],
          l: q.low[i],
          c: q.close[i],
          v: q.volume[i] || 0
        });
      }
    }
    if (candles.length < 60) return { error: 'Insufficient data', candles: candles.length };

    const LOOKBACK = 50;
    const MAX_HOLD = 25; // 25 trading days max hold
    const RR       = 2;  // 2:1 reward:risk (1.5x ATR stop, 3.0x ATR target)
    const trades   = [];
    let nextEntry  = LOOKBACK;

    for (let i = LOOKBACK; i < candles.length - MAX_HOLD; i++) {
      if (i < nextEntry) continue;
      const slice = candles.slice(0, i + 1);
      const closes = slice.map(c => c.c);
      const n = closes.length;
      const price = closes[n - 1];

      // ── FILTER 1: Market Regime Filter (NIFTY 50 > 200-EMA) ─────────────
      if (niftyData && niftyData.dateMap) {
        const dStr = new Date(candles[i].t).toISOString().slice(0, 10);
        if (niftyData.dateMap[dStr] === false) {
          // Market was bearish on this day — skip entry to avoid broad market selloffs
          continue;
        }
      }

      // ── FILTER 2: Stock Uptrend Structure ──────────────────────────────
      const tEMA = emaSeries(closes, Math.min(200, Math.floor(n * 0.75)));
      const sEMA = emaSeries(closes, Math.min(50,  Math.floor(n * 0.25)));
      if (price < tEMA[n - 1] || sEMA[n - 1] < tEMA[n - 1]) {
        continue; // Only trade in direction of stock's primary uptrend
      }

      // ── FILTER 3: Pullback Rebound / Dip-Buy Setup in Uptrend ───────────
      const r = rsiCalc(closes);
      const rPrev = closes.length >= 2 ? rsiCalc(closes.slice(0, n - 1)) : r;
      const isDipTurn = r >= 35 && r <= 55 && r > rPrev;
      const isBreakout = r > 50 && r <= 65;
      if (!isDipTurn && !isBreakout) continue;

      // ── FILTER 4: Volume Confirmation ──────────────────────────────────
      const avgVol = slice.slice(-20).map(c => c.v).reduce((a, b) => a + b, 0) / 20;
      const vRatio = avgVol > 0 ? slice[slice.length - 1].v / avgVol : 1;
      if (vRatio < 1.15) continue; // Must have at least normal-to-high volume

      const entry = price;
      const atr   = atrCalc(slice.slice(-14));
      if (atr === 0) continue;

      const risk  = atr * 1.5;
      let sl      = entry - risk;
      const tgt   = entry + risk * RR;

      let outcome   = 'TIMEOUT';
      let exitPrice = candles[Math.min(i + MAX_HOLD, candles.length - 1)].c;
      let exitDay   = MAX_HOLD;

      for (let j = i + 1; j <= Math.min(i + MAX_HOLD, candles.length - 1); j++) {
        const c = candles[j];

        // Profit-lock trailing: If price reaches 1R profit (+1.5 ATR), move stop to Entry
        if (c.h >= entry + risk) {
          sl = Math.max(sl, entry);
        }

        if (c.l <= sl) {
          outcome = exitPrice === entry ? 'BREAKEVEN' : 'LOSS';
          exitPrice = sl;
          exitDay = j - i;
          break;
        }
        if (c.h >= tgt) {
          outcome = 'WIN';
          exitPrice = tgt;
          exitDay = j - i;
          break;
        }
      }

      const pnlPct = (exitPrice - entry) / entry * 100;

      trades.push({
        date:   new Date(candles[i].t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
        signal: 'BUY',
        entry:  +entry.toFixed(2),
        target: +tgt.toFixed(2),
        sl:     +sl.toFixed(2),
        outcome,
        pnlPct: +pnlPct.toFixed(2),
        days:   exitDay
      });
      nextEntry = i + exitDay + 1;
    }

    const wins       = trades.filter(t => t.outcome === 'WIN');
    const losses     = trades.filter(t => t.outcome === 'LOSS');
    const breakevens = trades.filter(t => t.outcome === 'BREAKEVEN');
    const timeouts   = trades.filter(t => t.outcome === 'TIMEOUT');
    const total      = trades.length;
    const winRate    = total > 0 ? +(wins.length / total * 100).toFixed(1) : 0;
    const avgWin     = wins.length   > 0 ? +(wins.reduce((a, t)   => a + t.pnlPct, 0) / wins.length).toFixed(2)   : 0;
    const avgLoss    = losses.length > 0 ? +(losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length).toFixed(2) : 0;
    const netReturn  = +(trades.reduce((a, t) => a + t.pnlPct, 0)).toFixed(2);
    const expectancy = total > 0 ? +(trades.reduce((a, t) => a + t.pnlPct, 0) / total).toFixed(2) : 0;

    return {
      symbol,
      period:         '2 Years (Daily candles)',
      totalTrades:    total,
      wins:           wins.length,
      losses:         losses.length,
      breakevens:     breakevens.length,
      timeouts:       timeouts.length,
      winRate,
      avgWin,
      avgLoss,
      netReturn,
      expectancy,
      riskReward:     '2:1 (ATR × 1.5 stop, ATR × 3 target)',
      filtersApplied: [
        'NIFTY 50 200-EMA Market Regime Filter',
        'Stock Trend Filter (Price > 200-EMA)',
        'Volume Surge (≥1.15x 20D Avg)',
        'Long-Only CNC Mode (No Shorting)',
        'Profit-Lock Trailing Stop (+1R to B/E)',
        '25-Day Holding Period'
      ],
      recentTrades: trades.slice(-10)
    };
  } catch (err) {
    console.warn(`[BACKTEST] ${symbol}: ${err.message}`);
    return { error: err.message };
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Portfolio persistence endpoint
  if (pathname === '/api/portfolio') {
    const pfFile = path.join(DIR, 'portfolio.json');
    if (req.method === 'GET') {
      try {
        if (fs.existsSync(pfFile)) {
          const content = fs.readFileSync(pfFile, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(content || '[]');
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsedData = JSON.parse(body);
          if (Array.isArray(parsedData)) {
            fs.writeFileSync(pfFile, JSON.stringify(parsedData, null, 2), 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, count: parsedData.length }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Expected array of holdings' }));
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
        }
      });
      return;
    }
  }

  // ── Watchlist metadata ─────────────────────────────────────────────────────
  if (pathname === '/api/watchlist') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(WATCHLIST));
    return;
  }

  // API Endpoints
  if (pathname === '/api/quotes') {
    try {
      const data = await getAllQuotes();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/history') {
    const symbol = parsed.query.symbol || 'RELIANCE.NS';
    const tf = parsed.query.tf || '1d';
    try {
      const data = await getHistory(symbol, tf);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/news') {
    try {
      const data = await fetchNews();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/signal') {
    const symbol = parsed.query.symbol || 'RELIANCE.NS';
    try {
      const data = await fetchSignalForSymbol(symbol);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message, signal: 'HOLD' }));
    }
    return;
  }

  if (pathname === '/api/backtest') {
    const symbol = parsed.query.symbol || 'RELIANCE.NS';
    try {
      const data = await runBacktest(symbol);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status:    'online',
      serverTime: new Date().toISOString(),
      symbols:   ALL_SYMBOLS.length,
      stocks:    WATCHLIST.length,
      exchange:  'NSE (via Yahoo Finance .NS)',
      note:      'Prices are NSE prices. BSE prices differ slightly due to being separate exchanges.'
    }));
    return;
  }


  // Static files
  let reqFile = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const filePath = path.join(DIR, reqFile);

  if (!filePath.startsWith(DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=UTF-8',
      '.css':  'text/css; charset=UTF-8',
      '.js':   'application/javascript; charset=UTF-8',
      '.json': 'application/json; charset=UTF-8',
      '.png':  'image/png',
      '.svg':  'image/svg+xml'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n🇮🇳 BharatTerminal server running at http://localhost:${PORT}`);
  console.log(`📊 Tracking ${ALL_SYMBOLS.length} symbols (${WATCHLIST.length} stocks + ${INDICES.length} indices)`);
  console.log(`📡 Data source: NSE via Yahoo Finance (.NS tickers)`);
  console.log(`⚠️  Prices shown are NSE prices — BSE prices differ slightly (different exchange).\n`);
});
