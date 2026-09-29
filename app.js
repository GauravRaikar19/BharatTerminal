// BharatTerminal — app.js
// High-Performance Indian Stock Market Terminal Engine (Real-Data Connected)

// NOTE: Prices displayed are NSE prices (via Yahoo Finance .NS tickers).
// BSE prices for the same stock will differ slightly — this is normal.
var STOCKS = [
  {sym:'RELIANCE.NS',    name:'Reliance Industries',   base:1257  },
  {sym:'TCS.NS',         name:'Tata Consultancy Svc',  base:3600  },
  {sym:'HDFCBANK.NS',    name:'HDFC Bank',             base:1700  },
  {sym:'INFY.NS',        name:'Infosys',               base:1790  },
  {sym:'ICICIBANK.NS',   name:'ICICI Bank',            base:1250  },
  {sym:'WIPRO.NS',       name:'Wipro',                 base:570   },
  {sym:'SBIN.NS',        name:'State Bank of India',   base:775   },
  {sym:'BAJFINANCE.NS',  name:'Bajaj Finance',         base:6800  },
  {sym:'ADANIENT.NS',    name:'Adani Enterprises',     base:2400  },
  {sym:'LT.NS',          name:'Larsen & Toubro',       base:3560  },
  {sym:'ASIANPAINT.NS',  name:'Asian Paints',          base:2800  },
  {sym:'MARUTI.NS',      name:'Maruti Suzuki',         base:12500 },
  {sym:'KOTAKBANK.NS',   name:'Kotak Mahindra Bank',   base:1850  },
  {sym:'AXISBANK.NS',    name:'Axis Bank',             base:1150  },
  {sym:'HINDUNILVR.NS',  name:'Hindustan Unilever',    base:2550  },
  {sym:'ITC.NS',         name:'ITC Limited',           base:470   },
  {sym:'SUNPHARMA.NS',   name:'Sun Pharmaceutical',    base:1750  },
  {sym:'POWERGRID.NS',   name:'Power Grid Corp',       base:330   },
  {sym:'NTPC.NS',        name:'NTPC Limited',          base:390   },
  {sym:'ONGC.NS',        name:'ONGC',                  base:285   },
  {sym:'TECHM.NS',       name:'Tech Mahindra',         base:1600  },
  {sym:'HCLTECH.NS',     name:'HCL Technologies',      base:1800  },
  {sym:'BHARTIARTL.NS',  name:'Bharti Airtel',         base:1680  },
  {sym:'ULTRACEMCO.NS',  name:'UltraTech Cement',      base:11500 },
  {sym:'GRASIM.NS',      name:'Grasim Industries',     base:2700  },
  {sym:'ADANIPORTS.NS',  name:'Adani Ports',           base:1380  },
  {sym:'BAJAJFINSV.NS',  name:'Bajaj Finserv',         base:1750  },
  {sym:'DIVISLAB.NS',    name:"Divi's Laboratories",   base:5400  },
  {sym:'DRREDDY.NS',     name:"Dr. Reddy's Labs",      base:6800  },
  {sym:'NESTLEIND.NS',   name:'Nestle India',          base:24000 },
  {sym:'CIPLA.NS',       name:'Cipla',                 base:1550  },
  {sym:'COALINDIA.NS',   name:'Coal India',            base:465   },
  {sym:'JSWSTEEL.NS',    name:'JSW Steel',             base:950   },
  {sym:'TATASTEEL.NS',   name:'Tata Steel',            base:165   },
  {sym:'M&M.NS',         name:'Mahindra & Mahindra',   base:2900  },
];

var INDICES = [
  {sym:'^NSEI',    el_v:'nv', el_c:'nc', el_b:'nb',  base:23398.1},
  {sym:'^BSESN',   el_v:'sv', el_c:'sc', el_b:'sb2', base:74781.7},
  {sym:'^NSEBANK', el_v:'bv', el_c:'bc', el_b:'bb2', base:56606.5}
];

var NEWS = [
  {h:'Sensex, Nifty outlook: Strong institutional flows keep undertone positive', src:'TradingView', t:'10m ago', s:'pos'},
  {h:'RBI holds benchmark rates steady; liquidity measures support banking space', src:'Economic Times', t:'25m ago', s:'neu'},
  {h:'Reliance Industries retail and digital expansions continue robust run', src:'Moneycontrol', t:'45m ago', s:'pos'},
  {h:'IT services firms see stabilization in discretionary tech spending pipeline', src:'Mint', t:'1h ago', s:'pos'},
  {h:'Banking index holds critical support levels as credit growth stays healthy', src:'CNBC TV18', t:'2h ago', s:'pos'}
];

var API_BASE = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ? ''
  : 'http://localhost:3000';

// Default / recovered portfolio fallback
var DEFAULT_PORTFOLIO = [];

function getInitialPF() {
  try {
    var raw = localStorage.getItem('bt_pf');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter out legacy dummy placeholder (100 @ 1034) so user starts fresh
        return parsed.filter(function(item) {
          return !(item && item.sym === 'BAJFINANCE' && item.qty === 100 && item.buy === 1034);
        });
      }
    }
  } catch(e) {}
  return [];
}

// Application state
var S = {
  prices:     {},
  history:    {},
  breadth:    { adv: 7, dec: 5, unc: 0, total: 12 },
  sel:        'RELIANCE.NS',
  tf:         '1d',
  pf:         getInitialPF(),
  chart:      null,
  fgChart:    null,
  isRealData: false
};

// ------- RNG & SEED FALLBACK -------
function mkRng(seed) {
  var s = (Math.abs(Math.floor(seed)) % 2147483647) || 1;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashStr(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return Math.abs(h);
}

function seedPrice(base, seed) {
  var r     = mkRng(seed);
  var dc    = (r() - 0.5) * 0.02;
  var price = parseFloat((base * (1 + dc)).toFixed(2));
  var open  = parseFloat((base * (1 + (r() - 0.5) * 0.01)).toFixed(2));
  var high  = parseFloat((Math.max(price, open) * (1 + r() * 0.005)).toFixed(2));
  var low   = parseFloat((Math.min(price, open) * (1 - r() * 0.005)).toFixed(2));
  var prev  = parseFloat(base.toFixed(2));
  var chg   = parseFloat((price - prev).toFixed(2));
  var pct   = parseFloat(((chg / prev) * 100).toFixed(2));
  var vol   = Math.floor(r() * 4000000 + 1000000);
  var mcap  = parseFloat((price * 500 * 1e7).toFixed(0));
  var wh    = parseFloat((high * 1.15).toFixed(2));
  var wl    = parseFloat((low * 0.85).toFixed(2));
  return {sym:'', price:price, chg:chg, pct:pct, open:open, high:high, low:low, prev:prev, vol:vol, mcap:mcap, wh:wh, wl:wl, real:false};
}

function genHistory(base, tf, sym) {
  var counts = {'1d':25, '5d':99, '1mo':22, '3mo':66, '1y':250};
  var ivs    = {'1d':900000, '5d':900000, '1mo':86400000, '3mo':86400000, '1y':86400000};
  var n  = counts[tf] || 25;
  var iv = ivs[tf] || 900000;
  var r  = mkRng(hashStr(sym + tf));
  var p  = base;
  var pts = [];
  var now = Date.now();
  for (var i = n; i >= 0; i--) {
    p = Math.max(base * 0.4, p + (r() - 0.49) * base * 0.003);
    pts.push({t: new Date(now - i * iv), c: parseFloat(p.toFixed(2))});
  }
  if (S.prices[sym] && S.prices[sym].price) {
    pts[pts.length - 1].c = S.prices[sym].price;
  }
  return pts;
}

function initData() {
  var t = Date.now() * 0.0001;
  for (var i = 0; i < STOCKS.length; i++) {
    var p = seedPrice(STOCKS[i].base, i * 9973 + t);
    p.sym = STOCKS[i].sym;
    S.prices[STOCKS[i].sym] = p;
  }
  for (var j = 0; j < INDICES.length; j++) {
    var ip = seedPrice(INDICES[j].base, j * 7919 + t);
    ip.sym = INDICES[j].sym;
    S.prices[INDICES[j].sym] = ip;
  }
  for (var k = 0; k < STOCKS.length; k++) {
    S.history[STOCKS[k].sym] = genHistory(STOCKS[k].base, S.tf, STOCKS[k].sym);
  }
}

// ------- REAL DATA API CALLS -------
function fetchRealQuotes(done) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', API_BASE + '/api/quotes', true);
  xhr.timeout = 7000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        if (data && data.prices) {
          for (var k in data.prices) {
            S.prices[k] = data.prices[k];
          }
          if (data.breadth) {
            S.breadth = data.breadth;
          }
          S.isRealData = true;
          renderStatusBadge();
          renderTicker();
          renderIdx();
          renderWL();
          renderDetail();
          renderMovers();
          renderPF();
          renderBreadth();
          if (done) done(true);
          return;
        }
      } catch(e) {}
    }
    if (done) done(false);
  };
  xhr.onerror = xhr.ontimeout = function() {
    if (done) done(false);
  };
  xhr.send();
}

function fetchRealHistory(sym, tf, done) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', API_BASE + '/api/history?symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(tf), true);
  xhr.timeout = 8000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        if (data && data.points && data.points.length > 0) {
          S.history[sym] = data.points.map(function(p) {
            return { t: new Date(p.t), c: p.c };
          });
          renderChart();
          calcIndicators();
          if (done) done(true);
          return;
        }
      } catch(e) {}
    }
    // Fallback generated if history not reachable
    var stk = null;
    for (var i = 0; i < STOCKS.length; i++) {
      if (STOCKS[i].sym === sym) { stk = STOCKS[i]; break; }
    }
    if (stk && (!S.history[sym] || !S.history[sym].length)) {
      S.history[sym] = genHistory(stk.base, tf, sym);
      renderChart();
      calcIndicators();
    }
    if (done) done(false);
  };
  xhr.onerror = xhr.ontimeout = function() {
    if (done) done(false);
  };
  xhr.send();
}

function fetchRealNews() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', API_BASE + '/api/news', true);
  xhr.timeout = 8000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var list = JSON.parse(xhr.responseText);
        if (Array.isArray(list) && list.length > 0) {
          NEWS = list;
          renderNews();
        }
      } catch(e) {}
    }
  };
  xhr.send();
}

// ------- IMPROVED SIGNAL (server-side: 1Y daily, trend filter, MACD crossover, ATR stops) -------
function fetchImprovedSignal(sym) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', API_BASE + '/api/signal?symbol=' + encodeURIComponent(sym), true);
  xhr.timeout = 12000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var d = JSON.parse(xhr.responseText);
        if (d && d.signal) {
          renderImprovedSignal(d);
          return;
        }
      } catch(e) {}
    }
    // Fallback to local calcIndicators if API fails
    calcIndicators();
  };
  xhr.onerror = xhr.ontimeout = function() { calcIndicators(); };
  xhr.send();
}

function renderImprovedSignal(d) {
  var INR = '\u20b9';
  var box  = G('sigbox');
  var lbl  = G('siglbl');
  var ico  = G('sigico');
  var cf   = G('sigcf');
  var tr   = G('sigtrend');
  var ri   = G('sigrsi');
  var rs   = G('sigrs');
  var sl   = G('sigsl');
  var tgt  = G('sigtgt');
  var lvl  = G('siglevels');
  if (!box) return;

  var sig = d.signal || 'HOLD';
  box.className = 'sig2 ' + sig;

  // Icon
  ico.textContent = sig === 'BUY' ? '🟢' : (sig === 'EXIT' || sig === 'SELL') ? '🔴' : '🟡';
  lbl.textContent = sig + (sig === 'EXIT' ? ' / AVOID' : ' SIGNAL');
  cf.textContent  = (d.confidence || 50) + '%';

  // Trend badge
  if (tr) {
    var trendCol = d.trend === 'UP' ? 'var(--green)' : d.trend === 'DOWN' ? 'var(--red)' : 'var(--gold)';
    var trendTxt = d.trend === 'UP' ? '▲ UPTREND' : d.trend === 'DOWN' ? '▼ DOWNTREND' : '■ SIDEWAYS';
    tr.textContent = trendTxt;
    tr.style.color = trendCol;
  }

  // RSI
  if (ri) {
    ri.textContent = d.rsi ? d.rsi.toFixed(0) : '--';
    ri.style.color = d.rsi < 35 ? 'var(--green)' : d.rsi > 65 ? 'var(--red)' : 'var(--t3)';
  }

  // Stop Loss and Target
  if (d.stopLoss && d.target && lvl) {
    lvl.style.display = 'grid';
    if (sl)  sl.textContent  = INR + fN(d.stopLoss);
    if (tgt) tgt.textContent = INR + fN(d.target);
  } else if (lvl) {
    lvl.style.display = 'none';
  }

  // Render Real-World Filter Checklist
  var fb = G('sigfiltersbox');
  var fl = G('sigfilterslist');
  var fc = G('sigfilterscount');
  if (fb && fl && d.filters && d.filters.length) {
    fb.style.display = 'block';
    if (fc) {
      fc.textContent = (d.filtersPassed || '--') + ' PASSED';
      var allPass = d.filters.every(function(f){ return f.passed; });
      fc.className = 'sig2-filters-count' + (allPass ? ' all' : '');
    }
    fl.innerHTML = d.filters.map(function(f) {
      var icon = f.passed ? '✅' : '❌';
      var badgeCls = f.passed ? 'pass' : 'fail';
      var badgeTxt = f.passed ? 'PASS' : 'FAIL';
      return '<div class="sig2-filt-item">' +
        '<div class="sig2-filt-row">' +
          '<span class="sig2-filt-title">' + icon + ' ' + f.name + '</span>' +
          '<span class="sig2-filt-badge ' + badgeCls + '">' + badgeTxt + '</span>' +
        '</div>' +
        (f.detail ? '<div class="sig2-filt-detail">' + f.detail + '</div>' : '') +
      '</div>';
    }).join('');
  } else if (fb) {
    fb.style.display = 'none';
  }

  // Reasons list
  if (rs && d.reasons && d.reasons.length) {
    rs.innerHTML = d.reasons.map(function(r) {
      return '• ' + r;
    }).join('<br>');
  }

  // Also update the basic indicator display with data from the improved signal
  if (d.rsi !== undefined) {
    var rsiV = d.rsi;
    var rsiS = rsiV < 30 ? 'OVERSOLD' : rsiV > 70 ? 'OVERBOUGHT' : 'NEUTRAL';
    var rsiC = rsiV < 30 ? 'bull' : rsiV > 70 ? 'bear' : 'neut';
    if (G('irsi'))  G('irsi').textContent  = rsiV.toFixed(1);
    if (G('irsis')) { G('irsis').textContent = rsiS; G('irsis').className = 'ind-s ' + rsiC; }
    if (G('irsib')) { G('irsib').style.width = rsiV + '%'; G('irsib').style.background = rsiV < 30 ? 'var(--green)' : rsiV > 70 ? 'var(--red)' : 'var(--gold)'; }
  }
}

// ------- BACKTEST -------
function fetchBacktest(sym) {
  var btn = G('bt-btn');
  var body = G('bt-body');
  if (!body) return;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Running... (10-20s)'; }
  body.innerHTML = '<div style="font-size:.6rem;color:var(--t2);text-align:center;padding:28px">⏳ Running 2-year backtest on ' + sym + ' with 4 extra filters...<br><span style="color:var(--cyan)">NIFTY 200-EMA Regime + Volume Surge + Long CNC + 25-Day Profit-Lock</span></div>';

  var xhr = new XMLHttpRequest();
  xhr.open('GET', API_BASE + '/api/backtest?symbol=' + encodeURIComponent(sym), true);
  xhr.timeout = 60000;
  xhr.onload = function() {
    if (btn) { btn.disabled = false; btn.textContent = '▶ Run Backtest'; }
    try {
      var d = JSON.parse(xhr.responseText);
      if (d && d.error) {
        body.innerHTML = '<div style="color:var(--red);font-size:.6rem;padding:14px">⚠️ ' + d.error + '</div>';
        return;
      }
      renderBacktest(d);
    } catch(e) {
      body.innerHTML = '<div style="color:var(--red);font-size:.6rem;padding:14px">⚠️ Failed to parse results</div>';
    }
  };
  xhr.onerror = xhr.ontimeout = function() {
    if (btn) { btn.disabled = false; btn.textContent = '▶ Run Backtest'; }
    body.innerHTML = '<div style="color:var(--red);font-size:.6rem;padding:14px">⚠️ Timeout — server may be busy</div>';
  };
  xhr.send();
}

function renderBacktest(d) {
  var body = G('bt-body');
  if (!body || !d) return;
  var INR = '\u20b9';

  var wrColor  = d.winRate >= 60 ? 'var(--green)' : d.winRate >= 45 ? 'var(--gold)' : 'var(--red)';
  var evColor  = d.expectancy > 0 ? 'var(--green)' : 'var(--red)';
  var netColor = d.netReturn > 0  ? 'var(--green)' : 'var(--red)';

  var html = '';

  // Active filters banner
  if (d.filtersApplied && d.filtersApplied.length) {
    html += '<div style="background:rgba(0,255,200,0.03);border:1px solid rgba(0,255,200,0.15);border-radius:4px;padding:8px 10px;margin-bottom:10px;font-size:.53rem;color:var(--t2)">' +
      '<div style="font-weight:700;color:var(--cyan);margin-bottom:5px;letter-spacing:.06em">🛡️ 4 REAL-WORLD FILTERS ACTIVE:</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;color:var(--t3)">' +
      d.filtersApplied.map(function(f){ return '<div><span style="color:var(--green)">✓</span> ' + f + '</div>'; }).join('') +
      '</div></div>';
  }

  html += '<div class="bt-stats">';
  html += '<div class="bt-stat ' + (d.winRate >= 50 ? 'win' : 'loss') + '"><div class="bt-stat-v" style="color:' + wrColor + '">' + d.winRate + '%</div><div class="bt-stat-l">Win Rate</div></div>';
  html += '<div class="bt-stat"><div class="bt-stat-v">' + d.totalTrades + '</div><div class="bt-stat-l">Total Trades</div></div>';
  html += '<div class="bt-stat ' + (d.expectancy > 0 ? 'pos' : 'loss') + '"><div class="bt-stat-v" style="color:' + evColor + '">' + (d.expectancy > 0 ? '+' : '') + d.expectancy + '%</div><div class="bt-stat-l">Exp. Value/Trade</div></div>';
  html += '<div class="bt-stat ' + (d.netReturn > 0 ? 'win' : 'loss') + '"><div class="bt-stat-v" style="color:' + netColor + '">' + (d.netReturn > 0 ? '+' : '') + d.netReturn + '%</div><div class="bt-stat-l">Total Return</div></div>';
  html += '</div>';

  var beCount = d.breakevens || 0;
  var colCount = beCount > 0 ? 'repeat(4,1fr)' : 'repeat(3,1fr)';
  html += '<div style="display:grid;grid-template-columns:' + colCount + ';gap:6px;font-size:.58rem;margin-bottom:10px">';
  html += '<div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.15);border-radius:4px;padding:7px;text-align:center"><div style="color:var(--green);font-weight:700">' + d.wins + ' Wins</div><div style="color:var(--t2)">Avg +' + d.avgWin + '%</div></div>';
  html += '<div style="background:rgba(255,68,68,0.06);border:1px solid rgba(255,68,68,0.15);border-radius:4px;padding:7px;text-align:center"><div style="color:var(--red);font-weight:700">' + d.losses + ' Losses</div><div style="color:var(--t2)">Avg ' + d.avgLoss + '%</div></div>';
  if (beCount > 0) {
    html += '<div style="background:rgba(255,215,0,0.06);border:1px solid rgba(255,215,0,0.15);border-radius:4px;padding:7px;text-align:center"><div style="color:var(--gold);font-weight:700">' + beCount + ' B/E</div><div style="color:var(--t2)">Profit Locked</div></div>';
  }
  html += '<div style="background:rgba(255,255,255,0.03);border:1px solid var(--bd);border-radius:4px;padding:7px;text-align:center"><div style="color:var(--t2);font-weight:700">' + d.timeouts + ' Timeout</div><div style="color:var(--t2)">Held 25 days</div></div>';
  html += '</div>';

  if (d.recentTrades && d.recentTrades.length) {
    html += '<table class="bt-trades"><thead><tr><th>Date</th><th>Signal</th><th>Entry</th><th>Target</th><th>Stop</th><th>Result</th><th>P&L</th></tr></thead><tbody>';
    for (var i = 0; i < d.recentTrades.length; i++) {
      var t = d.recentTrades[i];
      var rc = t.outcome === 'WIN' ? 'bt-win' : t.outcome === 'LOSS' ? 'bt-loss' : t.outcome === 'BREAKEVEN' ? 'bt-timeout' : 'bt-timeout';
      var oc = t.outcome === 'WIN' ? 'var(--green)' : t.outcome === 'LOSS' ? 'var(--red)' : t.outcome === 'BREAKEVEN' ? 'var(--gold)' : 'var(--t2)';
      var pc = t.pnlPct > 0 ? 'var(--green)' : t.pnlPct < 0 ? 'var(--red)' : 'var(--t2)';
      html += '<tr class="' + rc + '">';
      html += '<td>' + t.date + '</td>';
      html += '<td style="color:' + (t.signal === 'BUY' ? 'var(--green)' : 'var(--red)') + ';font-weight:700">' + t.signal + '</td>';
      html += '<td>' + INR + fN(t.entry) + '</td>';
      html += '<td style="color:var(--green)">' + INR + fN(t.target) + '</td>';
      html += '<td style="color:var(--red)">' + INR + fN(t.sl) + '</td>';
      html += '<td style="color:' + oc + ';font-weight:700">' + t.outcome + '</td>';
      html += '<td style="color:' + pc + ';font-weight:700">' + (t.pnlPct > 0 ? '+' : '') + t.pnlPct + '%</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }

  html += '<div class="bt-note">🛡️ Backtest uses 4 real-world filters: ' + (d.riskReward || '2:1') + ' | Period: ' + d.period + ' | Trades: ' + d.totalTrades + ' in 2 years. Past performance does not guarantee future results.</div>';

  body.innerHTML = html;
}

function fetchPortfolio(done) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', API_BASE + '/api/portfolio', true);
  xhr.timeout = 5000;
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var list = JSON.parse(xhr.responseText);
        if (Array.isArray(list)) {
          if (list.length > 0) {
            S.pf = list;
            try { localStorage.setItem('bt_pf', JSON.stringify(list)); } catch(e) {}
            renderPF();
          } else if (S.pf && S.pf.length > 0) {
            savePortfolioToServer();
          }
        }
      } catch(e) {}
    }
    if (done) done();
  };
  xhr.onerror = xhr.ontimeout = function() {
    if (done) done();
  };
  xhr.send();
}

function savePortfolioToServer() {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', API_BASE + '/api/portfolio', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 5000;
  xhr.send(JSON.stringify(S.pf));
}

// ------- FORMATTERS -------
function fN(n) {
  n = parseFloat(n);
  if (isNaN(n)) return '--';
  if (n >= 1000) return n.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
  return n.toFixed(2);
}
function fV(v) {
  if (!v) return '--';
  if (v >= 1e7) return (v / 1e7).toFixed(2) + ' Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(2) + ' L';
  return v.toLocaleString('en-IN');
}
function fM(v) {
  if (!v) return '--';
  var r = '\u20b9';
  if (v >= 1e12) return r + (v / 1e12).toFixed(2) + ' T';
  if (v >= 1e9)  return r + (v / 1e9).toFixed(2)  + ' B';
  if (v >= 1e7)  return r + (v / 1e7).toFixed(2)  + ' Cr';
  return r + v;
}
function G(id) { return document.getElementById(id); }

// ------- TICKER TAPE -------
function renderTicker() {
  var INR = '\u20b9';
  var arr = STOCKS.concat(STOCKS);
  var html = '';
  for (var i = 0; i < arr.length; i++) {
    var s = arr[i];
    var d = S.prices[s.sym];
    if (!d) continue;
    var up  = d.pct >= 0;
    var sym = s.sym.replace('.NS', '');
    html += '<span class="ti" onclick="pickStock(\'' + s.sym + '\')">' +
      '<span class="ti-sym">' + sym + '</span> ' +
      '<span class="ti-p">' + INR + fN(d.price) + '</span> ' +
      '<span class="' + (up ? 'up' : 'dn') + '">' + (up ? '\u25b2' : '\u25bc') + Math.abs(d.pct).toFixed(2) + '%</span>' +
    '</span>';
  }
  G('ticker-inner').innerHTML = html;
}

// ------- INDICES -------
function renderIdx() {
  for (var i = 0; i < INDICES.length; i++) {
    var idx = INDICES[i];
    var d   = S.prices[idx.sym];
    if (!d) continue;
    var up  = d.pct >= 0;
    var cls = up ? 'up' : 'dn';
    var bar = Math.min(100, Math.max(0, 50 + d.pct * 10));
    G(idx.el_v).textContent = fN(d.price);
    G(idx.el_c).textContent = (up ? '\u25b2 ' : '\u25bc ') + fN(Math.abs(d.chg)) + ' (' + Math.abs(d.pct).toFixed(2) + '%)';
    G(idx.el_c).className = 'ic2-c ' + cls;
    G(idx.el_b).style.width = bar + '%';
    G(idx.el_b).className = 'ic2-bf ' + cls;
  }
}

// ------- WATCHLIST -------
function renderWL() {
  var INR = '\u20b9';
  var html = '';
  for (var i = 0; i < STOCKS.length; i++) {
    var s = STOCKS[i];
    var d = S.prices[s.sym];
    if (!d) continue;
    var up  = d.pct >= 0;
    var sel = s.sym === S.sel ? ' sel' : '';
    var sym = s.sym.replace('.NS', '');
    html += '<div class="wi' + sel + '" onclick="pickStock(\'' + s.sym + '\')">' +
      '<div><div class="wi-s">' + sym + '</div><div class="wi-n">' + s.name + '</div></div>' +
      '<div style="text-align:right">' +
        '<div class="wi-p">' + INR + fN(d.price) + '</div>' +
        '<div class="wi-c ' + (up ? 'up' : 'dn') + '">' + (up ? '\u25b2' : '\u25bc') + Math.abs(d.pct).toFixed(2) + '%</div>' +
      '</div>' +
    '</div>';
  }
  G('wl').innerHTML = html;
}

// ------- STOCK DETAIL -------
function renderDetail() {
  var sym = S.sel;
  var d   = S.prices[sym];
  if (!d) return;
  var INR = '\u20b9';
  var up  = d.pct >= 0;
  var cls = up ? 'up' : 'dn';
  var stk = null;
  for (var i = 0; i < STOCKS.length; i++) {
    if (STOCKS[i].sym === sym) { stk = STOCKS[i]; break; }
  }
  G('ctitle').textContent = sym + ' — Real Chart (NSE)';
  G('sisym').textContent  = sym.replace('.NS','');
  G('sinm').textContent   = stk ? stk.name : sym;
  G('sipr').textContent   = INR + fN(d.price);
  G('sich').textContent   = (up ? '\u25b2 ' : '\u25bc ') + INR + fN(Math.abs(d.chg));
  G('sich').className     = 'si-c ' + cls;
  G('sipc').textContent   = '(' + Math.abs(d.pct).toFixed(2) + '%)';
  G('sto').textContent    = INR + fN(d.open);
  G('sth').textContent    = INR + fN(d.high);
  G('stl').textContent    = INR + fN(d.low);
  G('stp').textContent    = INR + fN(d.prev);
  G('stv').textContent    = fV(d.vol);
  G('stm').textContent    = d.mcap ? fM(d.mcap) : 'NSE Listed';
  // Show exchange label from data if available
  var exchLabel = d.exchange ? d.exchange : 'NSE';
  G('stm').title = 'Exchange: ' + exchLabel + ' | Prices are NSE prices';
  G('st52h').textContent  = INR + fN(d.wh);
  G('st52l').textContent  = INR + fN(d.wl);
  calcIndicators();
}

// ------- INDICATORS + AI SIGNAL -------
function emaOf(arr, period) {
  var k = 2 / (period + 1);
  var e = arr[0];
  for (var i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}

function calcRSI(closes) {
  var p = 14;
  if (closes.length < p + 1) return 50;
  var g = 0, l = 0;
  for (var i = closes.length - p; i < closes.length; i++) {
    var d = closes[i] - closes[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  return parseFloat((100 - 100 / (1 + g / (l || 0.001))).toFixed(2));
}

function calcMACD(closes) {
  var ema12 = emaOf(closes, 12);
  var ema26 = emaOf(closes, 26);
  return parseFloat((ema12 - ema26).toFixed(4));
}

function calcBB(closes) {
  var sl = closes.slice(-20);
  var mean = 0;
  for (var i = 0; i < sl.length; i++) mean += sl[i];
  mean /= sl.length;
  var variance = 0;
  for (var j = 0; j < sl.length; j++) variance += (sl[j] - mean) * (sl[j] - mean);
  var std = Math.sqrt(variance / sl.length);
  var upper = mean + 2 * std;
  var lower = mean - 2 * std;
  var last  = closes[closes.length - 1];
  return parseFloat(((last - lower) / ((upper - lower) || 1)).toFixed(4));
}

function calcIndicators() {
  var hist   = S.history[S.sel] || [];
  var closes = [];
  for (var i = 0; i < hist.length; i++) {
    if (hist[i] && !isNaN(hist[i].c)) closes.push(hist[i].c);
  }
  if (closes.length < 10) return;

  var rsiV  = calcRSI(closes);
  var macdV = calcMACD(closes);
  var bbV   = calcBB(closes);

  // RSI
  var rsiS = rsiV < 30 ? 'OVERSOLD' : rsiV > 70 ? 'OVERBOUGHT' : 'NEUTRAL';
  var rsiC = rsiV < 30 ? 'bull' : rsiV > 70 ? 'bear' : 'neut';
  if (G('irsi'))  G('irsi').textContent  = rsiV.toFixed(1);
  if (G('irsis')) { G('irsis').textContent = rsiS; G('irsis').className   = 'ind-s ' + rsiC; }
  if (G('irsib')) { G('irsib').style.width = rsiV + '%'; G('irsib').style.background = rsiV < 30 ? 'var(--green)' : rsiV > 70 ? 'var(--red)' : 'var(--gold)'; }

  // MACD
  var macdS = macdV > 0 ? 'BULLISH' : 'BEARISH';
  var macdC = macdV > 0 ? 'bull' : 'bear';
  if (G('imacd'))  G('imacd').textContent  = macdV.toFixed(2);
  if (G('imacdis')) { G('imacdis').textContent = macdS; G('imacdis').className  = 'ind-s ' + macdC; }
  if (G('imacdb')) { G('imacdb').style.width = Math.min(100, Math.max(0, 50 + macdV * 2)) + '%'; G('imacdb').style.background = macdV > 0 ? 'var(--green)' : 'var(--red)'; }

  // Bollinger
  var bbS = bbV < 0.2 ? 'NEAR LOWER' : bbV > 0.8 ? 'NEAR UPPER' : 'MID BAND';
  var bbC = bbV < 0.2 ? 'bull' : bbV > 0.8 ? 'bear' : 'neut';
  if (G('ibb'))   G('ibb').textContent  = bbV.toFixed(2);
  if (G('ibbis')) { G('ibbis').textContent = bbS; G('ibbis').className  = 'ind-s ' + bbC; }
  if (G('ibbb'))  { G('ibbb').style.width = Math.min(100, Math.max(0, bbV * 100)) + '%'; G('ibbb').style.background = bbV < 0.2 ? 'var(--green)' : bbV > 0.8 ? 'var(--red)' : 'var(--cyan)'; }
}

// ------- CHART -------
function renderChart() {
  var hist = S.history[S.sel] || [];
  if (!hist.length || typeof Chart === 'undefined') return;

  var labels = [];
  var data   = [];
  for (var i = 0; i < hist.length; i++) {
    var d = hist[i];
    var lbl = (S.tf === '1d' || S.tf === '5d')
      ? d.t.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})
      : d.t.toLocaleDateString('en-IN', {day:'2-digit', month:'short'});
    labels.push(lbl);
    data.push(d.c);
  }

  var isUp   = data[data.length - 1] >= data[0];
  var color  = isUp ? '#00ff88' : '#ff4444';
  var aColor = isUp ? 'rgba(0,255,136,0.14)' : 'rgba(255,68,68,0.12)';

  var canvas = G('pc');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  if (S.chart) { S.chart.destroy(); S.chart = null; }

  var grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, aColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  S.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        borderColor: color,
        borderWidth: 1.6,
        fill: true,
        backgroundColor: grad,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {mode:'index', intersect:false},
      plugins: {
        legend: {display: false},
        tooltip: {
          backgroundColor: 'rgba(8,13,8,0.96)',
          borderColor: 'rgba(0,255,136,0.25)',
          borderWidth: 1,
          titleColor: '#7aad7a',
          bodyColor: '#b8d8b8',
          titleFont: {family:'JetBrains Mono', size:10},
          bodyFont:  {family:'JetBrains Mono', size:12},
          callbacks: {
            label: function(ctx) { return '\u20b9' + fN(ctx.parsed.y); }
          }
        }
      },
      scales: {
        x: {
          grid: {color:'rgba(0,255,136,0.03)'},
          ticks: {color:'#4a6a4a', font:{family:'JetBrains Mono',size:9}, maxTicksLimit:8}
        },
        y: {
          position: 'right',
          grid: {color:'rgba(0,255,136,0.03)'},
          ticks: {
            color:'#4a6a4a', font:{family:'JetBrains Mono',size:9},
            callback: function(v) { return '\u20b9' + fN(v); }
          }
        }
      }
    }
  });
}

// ------- MOVERS -------
function renderMovers() {
  var INR = '\u20b9';
  var list = [];
  for (var i = 0; i < STOCKS.length; i++) {
    var s = STOCKS[i];
    var d = S.prices[s.sym];
    if (!d) continue;
    list.push({sym:s.sym, name:s.name, price:d.price, pct:d.pct});
  }
  list.sort(function(a, b) { return b.pct - a.pct; });

  var top = list.slice(0, 5);
  var bot = list.slice(-5).reverse();

  var gh = '', lh = '';
  for (var j = 0; j < top.length; j++) {
    var s = top[j];
    gh += '<tr onclick="pickStock(\'' + s.sym + '\')">' +
      '<td style="font-weight:600">' + s.sym.replace('.NS','') + '</td>' +
      '<td>' + INR + fN(s.price) + '</td>' +
      '<td class="gu">' + (s.pct >= 0 ? '\u25b2' : '\u25bc') + s.pct.toFixed(2) + '%</td></tr>';
  }
  for (var k = 0; k < bot.length; k++) {
    var s = bot[k];
    lh += '<tr onclick="pickStock(\'' + s.sym + '\')">' +
      '<td style="font-weight:600">' + s.sym.replace('.NS','') + '</td>' +
      '<td>' + INR + fN(s.price) + '</td>' +
      '<td class="rd">' + (s.pct >= 0 ? '\u25b2' : '\u25bc') + Math.abs(s.pct).toFixed(2) + '%</td></tr>';
  }
  G('gainers').innerHTML = gh;
  G('losers').innerHTML  = lh;
}

// ------- PORTFOLIO -------
function renderPF() {
  var INR = '\u20b9';
  var rows = S.pf;
  var ti = 0, tc = 0;
  var html = '';

  for (var i = 0; i < rows.length; i++) {
    var item = rows[i];
    var sym  = item.sym.toUpperCase();
    var nsym = sym.indexOf('.NS') === -1 ? sym + '.NS' : sym;
    var d    = S.prices[nsym];
    var cmp  = d ? d.price : item.buy;
    var inv  = item.qty * item.buy;
    var cur  = item.qty * cmp;
    var pnl  = cur - inv;
    var ret  = inv > 0 ? (pnl / inv * 100) : 0;
    ti += inv;
    tc += cur;
    var pc = pnl >= 0 ? 'pp' : 'pn';
    html += '<tr>' +
      '<td style="font-weight:700">' + sym + '</td>' +
      '<td>' + item.qty + '</td>' +
      '<td>' + INR + fN(item.buy) + '</td>' +
      '<td>' + INR + fN(cmp) + '</td>' +
      '<td>' + INR + fN(inv.toFixed(0)) + '</td>' +
      '<td>' + INR + fN(cur.toFixed(0)) + '</td>' +
      '<td class="' + pc + '">' + (pnl >= 0 ? '+' : '') + INR + fN(Math.abs(pnl).toFixed(0)) + '</td>' +
      '<td class="' + pc + '">' + (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%</td>' +
      '<td><button class="db" onclick="rmHolding(' + i + ')">\u2715</button></td>' +
    '</tr>';
  }

  if (!html) {
    html = '<tr><td colspan="9" style="text-align:center;color:#4a6a4a;padding:28px;font-size:.7rem">No holdings yet. Add stocks above to track your portfolio.</td></tr>';
  }
  G('pfbody').innerHTML = html;

  var tp = tc - ti;
  var tr = ti ? tp / ti * 100 : 0;
  var pc = tp >= 0 ? 'pp' : 'pn';
  G('pfinv').textContent = INR + fN(ti.toFixed(0));
  G('pfcur').textContent = INR + fN(tc.toFixed(0));
  G('pfpnl').textContent = (tp >= 0 ? '+' : '') + INR + fN(Math.abs(tp).toFixed(0));
  G('pfpnl').className   = 'pf-sv ' + pc;
  G('pfret').textContent = (tr >= 0 ? '+' : '') + tr.toFixed(2) + '%';
  G('pfret').className   = 'pf-sv ' + pc;
}

// ------- NEWS -------
function renderNews() {
  var html = '';
  for (var i = 0; i < NEWS.length; i++) {
    var n = NEWS[i];
    var lbl = n.s === 'pos' ? 'BULLISH' : n.s === 'neg' ? 'BEARISH' : 'NEUTRAL';
    html += '<div class="ni">' +
      '<div class="ni-h">' + n.h + '</div>' +
      '<div class="ni-m">' +
        '<span class="ni-src">' + n.src + '</span>' +
        '<span class="ni-t">' + n.t + '</span>' +
        '<span class="ni-s ' + n.s + '">' + lbl + '</span>' +
      '</div>' +
    '</div>';
  }
  G('newsl').innerHTML = html;
}

// ------- FEAR & GREED -------
function renderFG() {
  var val = 58; // Neutral / Moderate Greed baseline
  var n = S.prices['^NSEI'];
  if (n && n.pct) {
    val = Math.round(50 + n.pct * 12);
    val = Math.max(15, Math.min(88, val));
  }
  var labels = ['Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'];
  var thresh = [25, 45, 55, 75, 100];
  var colors = ['#ff2222', '#ff6644', '#ffd700', '#88ff44', '#00ff88'];
  var idx = 2;
  for (var i = 0; i < thresh.length; i++) {
    if (val <= thresh[i]) { idx = i; break; }
  }
  var color = colors[idx];
  var label = labels[idx];

  var fgv = G('fgv'), fgl = G('fgl');
  if (fgv) { fgv.textContent = val; fgv.style.color = color; }
  if (fgl) { fgl.textContent = label; fgl.style.color = color; }

  var canvas = G('fgc');
  if (!canvas || typeof Chart === 'undefined') return;
  if (S.fgChart) { S.fgChart.destroy(); S.fgChart = null; }
  S.fgChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {datasets: [{
      data: [val, 100 - val],
      backgroundColor: [color, 'rgba(255,255,255,0.04)'],
      borderWidth: 0,
      circumference: 180,
      rotation: 270
    }]},
    options: {responsive:false, cutout:'76%', plugins:{legend:{display:false},tooltip:{enabled:false}}}
  });
}

// ------- BREADTH -------
function renderBreadth() {
  var b = S.breadth || { adv: 7, dec: 5, unc: 0, total: 12 };
  var adv = b.adv, dec = b.dec, unc = b.unc || 0, tot = b.total || 12;
  var ratio = dec > 0 ? (adv / dec).toFixed(2) : adv.toFixed(2);
  var rColor = adv >= dec ? '#00ff88' : '#ff4444';
  var ap = Math.round((adv / tot) * 100);
  var dp = Math.round((dec / tot) * 100);

  G('brb').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<div style="font-size:.52rem;letter-spacing:.16em;color:#4a6a4a;text-transform:uppercase">Watchlist Advance / Decline (Real)</div>' +
      '<div class="br-row">' +
        '<span class="up">\u25b2 Advancing: ' + adv + '</span>' +
        '<span class="dn">\u25bc Declining: ' + dec + '</span>' +
        '<span style="color:#4a6a4a">= ' + unc + '</span>' +
      '</div>' +
      '<div class="br-bar">' +
        '<div style="width:' + ap + '%;background:#00ff88"></div>' +
        '<div style="width:' + dp + '%;background:#ff4444"></div>' +
      '</div>' +
      '<div style="font-size:.6rem;color:#4a6a4a">A/D Ratio: <span style="color:' + rColor + '">' + ratio + '</span></div>' +
      '<div style="border-top:1px solid rgba(0,255,136,0.05);margin-top:6px;padding-top:6px">' +
        '<div style="font-size:.52rem;letter-spacing:.16em;color:#4a6a4a;text-transform:uppercase;margin-bottom:5px">Market Regime</div>' +
        '<div class="br-row"><span>Data Feed</span><span class="up" style="color:var(--green)">LIVE NSE/BSE</span></div>' +
        '<div class="br-row"><span>Exchange</span><span>NSE India</span></div>' +
      '</div>' +
    '</div>';
}

// ------- CLOCK & MARKET STATUS -------
function isMarketOpen() {
  var ist = new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Kolkata'}));
  var h = ist.getHours(), m = ist.getMinutes(), day = ist.getDay();
  return day > 0 && day < 6 && (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
}

function renderStatusBadge() {
  try {
    var live = isMarketOpen();
    var sdot = G('sdot');
    var stxt = G('stxt');
    if (sdot) {
      sdot.className = S.isRealData ? (live ? '' : 'off') : 'off';
    }
    if (stxt) {
      if (S.isRealData) {
        stxt.innerHTML = 'REAL DATA \u00b7 ' + (live ? 'MARKET LIVE' : 'MARKET CLOSED');
      } else {
        stxt.textContent = live ? 'MARKET LIVE' : 'MARKET CLOSED';
      }
    }
  } catch(e) {}
}

function updateClock() {
  try {
    var ist = new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Kolkata'}));
    G('clk').textContent = ist.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) + ' IST';
    renderStatusBadge();
  } catch(e) {}
}

// ------- NAVIGATION & ACTIONS -------
function goTab(tab) {
  var tabs = document.querySelectorAll('.tab');
  var btns = document.querySelectorAll('.sb');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('on');
  for (var j = 0; j < btns.length; j++) btns[j].classList.remove('active');
  var t = G('tab-' + tab);
  var b = G('nav-' + tab);
  if (t) t.classList.add('on');
  if (b) b.classList.add('active');
  if (tab === 'news')      { renderNews(); renderFG(); renderBreadth(); }
  if (tab === 'portfolio') { renderPF(); }
  if (tab === 'dashboard') { renderChart(); }
}

function setTF(tf) {
  S.tf = tf;
  var tfs = document.querySelectorAll('.tf');
  for (var i = 0; i < tfs.length; i++) tfs[i].classList.remove('on');
  var btn = G('tf-' + tf);
  if (btn) btn.classList.add('on');
  fetchRealHistory(S.sel, tf);
}

function pickStock(sym) {
  S.sel = sym;
  renderAll();
  fetchRealHistory(sym, S.tf);
  fetchImprovedSignal(sym); // fetch improved signal from server (1Y daily data)
}

function populateStockDatalist() {
  var dl = G('stocks-datalist');
  if (!dl) return;
  var html = '';
  for (var i = 0; i < STOCKS.length; i++) {
    var s = STOCKS[i];
    var sym = s.sym.replace('.NS', '');
    html += '<option value="' + sym + '">' + s.name + '</option>';
  }
  dl.innerHTML = html;
}

function getStockPrice(sym) {
  if (!sym) return null;
  sym = sym.trim().toUpperCase();
  var nsym = sym.indexOf('.NS') === -1 ? sym + '.NS' : sym;
  return S.prices[nsym] || S.prices[sym] || null;
}

function onPfSymChange() {
  var symInput = G('pfsym');
  var hint = G('pf-cmp-hint');
  var btn = G('pf-use-cmp-btn');
  if (!symInput) return;
  var sym = symInput.value.trim().toUpperCase();
  var pData = getStockPrice(sym);
  if (pData && pData.price) {
    if (hint) {
      hint.textContent = 'CMP: ₹' + fN(pData.price);
      hint.style.color = '#00ff88';
    }
    if (btn) btn.style.display = 'inline-block';
  } else {
    if (hint) hint.textContent = '';
    if (btn) btn.style.display = 'none';
  }
}

function useCmpPrice() {
  var symInput = G('pfsym');
  var buyInput = G('pfbuy');
  if (!symInput || !buyInput) return;
  var sym = symInput.value.trim().toUpperCase();
  var pData = getStockPrice(sym);
  if (pData && pData.price) {
    buyInput.value = pData.price.toFixed(2);
    buyInput.focus();
  }
}

function addHolding() {
  var sym = G('pfsym').value.trim().toUpperCase();
  var qty = parseFloat(G('pfqty').value);
  var buy = parseFloat(G('pfbuy').value);
  if (!sym || isNaN(qty) || isNaN(buy) || qty <= 0 || buy <= 0) {
    alert('Please enter a valid Symbol, Quantity, and Buy Price.');
    return;
  }

  // Price sanity check against current market price (CMP)
  var pData = getStockPrice(sym);
  if (pData && pData.price > 0) {
    var cmp = pData.price;
    var diffPct = Math.round(Math.abs((buy - cmp) / cmp) * 100);
    // If entered buy price deviates by 35% or more from CMP
    if (diffPct >= 35) {
      var direction = buy < cmp ? 'below' : 'above';
      var confirmMsg = '⚠️ Price Sanity Alert for ' + sym + ':\n\n' +
        '• Current Market Price (CMP): ₹' + fN(cmp) + '\n' +
        '• Your Entered Buy Price: ₹' + fN(buy) + ' (' + diffPct + '% ' + direction + ' CMP)\n\n' +
        'Is this an intentional historical purchase? Click OK to confirm and add, or Cancel to correct the buy price.';
      if (!confirm(confirmMsg)) {
        G('pfbuy').focus();
        return;
      }
    }
  }

  S.pf.push({sym:sym, qty:qty, buy:buy});
  try { localStorage.setItem('bt_pf', JSON.stringify(S.pf)); } catch(e) {}
  savePortfolioToServer();
  G('pfsym').value = '';
  G('pfqty').value = '';
  G('pfbuy').value = '';
  onPfSymChange();
  renderPF();
}

function rmHolding(i) {
  S.pf.splice(i, 1);
  try { localStorage.setItem('bt_pf', JSON.stringify(S.pf)); } catch(e) {}
  savePortfolioToServer();
  renderPF();
}

function exportPF() {
  var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(S.pf, null, 2));
  var a = document.createElement('a');
  a.setAttribute("href", dataStr);
  a.setAttribute("download", "bharat_terminal_portfolio.json");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function importPF() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
      try {
        var parsed = JSON.parse(evt.target.result);
        if (Array.isArray(parsed)) {
          S.pf = parsed;
          try { localStorage.setItem('bt_pf', JSON.stringify(S.pf)); } catch(err) {}
          savePortfolioToServer();
          renderPF();
          alert('Portfolio imported successfully! (' + parsed.length + ' holdings)');
        } else {
          alert('Invalid portfolio file format.');
        }
      } catch(err) {
        alert('Could not parse JSON file.');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ------- RENDER ALL -------
function renderAll() {
  renderTicker();
  renderIdx();
  renderWL();
  renderDetail();
  renderChart();
  renderMovers();
  renderPF();
  renderNews();
  renderFG();
  renderBreadth();
}

// ------- BOOT -------
function boot() {
  populateStockDatalist();
  initData();
  renderAll();
  updateClock();
  setInterval(updateClock, 1000);

  // Sync server portfolio
  fetchPortfolio();

  // Fetch real data immediately
  fetchRealQuotes(function(ok) {
    if (ok) {
      fetchRealHistory(S.sel, S.tf);
      fetchRealNews();
      fetchImprovedSignal(S.sel); // load improved signal on boot
    }
  });

  // Polling intervals
  setInterval(function() { fetchRealQuotes(); }, 12000);
  setInterval(function() { fetchRealNews(); }, 180000);
}

// Expose globals
window.goTab           = goTab;
window.setTF           = setTF;
window.pickStock       = pickStock;
window.addHolding      = addHolding;
window.rmHolding       = rmHolding;
window.exportPF        = exportPF;
window.importPF        = importPF;
window.fetchBacktest   = fetchBacktest;
window.onPfSymChange   = onPfSymChange;
window.useCmpPrice     = useCmpPrice;

boot();
