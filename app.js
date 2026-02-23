// ============================================================
// FINANCEX TERMINAL — APPLICATION LOGIC
// ============================================================

// ---- STATE ----
let currentUser = null;
let currentPage = 'home';
let currentExchange = 'bist';
let currentForexGroup = 'all';
let currentCryptoGroup = 'all';
let currentCommodityGroup = 'all';
let priceChart = null;
let priceFlicker = null;

// ---- AUTH ----
function switchAuth(mode) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(mode + 'Form').classList.add('active');
}

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (!email || !pass) { showToast('Lütfen tüm alanları doldurun.', 'error'); return; }
  currentUser = { name: email.split('@')[0] || email, email };
  enterTerminal();
}

function loginDemo() {
  currentUser = { name: 'Demo', email: 'demo@financex.com' };
  enterTerminal();
}

let verifyCodeVal = '';
function sendVerification() {
  const email = document.getElementById('regEmail').value;
  const pass = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;
  const username = document.getElementById('regUsername').value;
  if (!email || !pass || !username) { showToast('Lütfen tüm alanları doldurun.', 'error'); return; }
  if (pass !== pass2) { showToast('Parolalar eşleşmiyor!', 'error'); return; }
  if (pass.length < 8) { showToast('Parola en az 8 karakter olmalı.', 'error'); return; }
  verifyCodeVal = String(Math.floor(100000 + Math.random() * 900000));
  document.getElementById('verifyEmailDisplay').textContent = email;
  document.getElementById('regStep1').style.display = 'none';
  document.getElementById('regStep2').style.display = 'block';
  showToast(`Doğrulama kodu gönderildi: ${verifyCodeVal}`, 'success');
  startResendTimer();
}

function moveToNext(el, n) {
  el.value = el.value.replace(/[^0-9]/g,'');
  if (el.value && n < 6) {
    el.parentElement.querySelectorAll('.code-digit')[n].focus();
  }
}

function verifyCode() {
  const digits = document.querySelectorAll('.code-digit');
  const entered = Array.from(digits).map(d => d.value).join('');
  if (entered.length < 6) { showToast('Lütfen 6 haneli kodu girin.', 'error'); return; }
  if (entered === verifyCodeVal) {
    const email = document.getElementById('regEmail').value;
    const username = document.getElementById('regUsername').value;
    currentUser = { name: username, email };
    showToast('Hesap oluşturuldu! Giriş yapılıyor...', 'success');
    setTimeout(enterTerminal, 1200);
  } else {
    showToast('Hatalı doğrulama kodu!', 'error');
  }
}

function backToStep1() {
  document.getElementById('regStep1').style.display = 'block';
  document.getElementById('regStep2').style.display = 'none';
}

let resendInterval;
function startResendTimer() {
  let t = 60;
  const el = document.getElementById('resendTimer');
  clearInterval(resendInterval);
  resendInterval = setInterval(() => {
    el.textContent = ` (${t}s)`;
    if (--t < 0) { clearInterval(resendInterval); el.textContent = ''; }
  }, 1000);
}

function resendCode() {
  verifyCodeVal = String(Math.floor(100000 + Math.random() * 900000));
  showToast(`Yeni kod gönderildi: ${verifyCodeVal}`, 'success');
  startResendTimer();
}

function enterTerminal() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainTerminal').style.display = 'block';
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userAvatar').textContent = currentUser.name[0].toUpperCase();
  initTerminal();
}

function doLogout() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('mainTerminal').style.display = 'none';
  currentUser = null;
  clearInterval(priceFlicker);
}

function toggleUserMenu() {
  document.getElementById('userDropdown').classList.toggle('show');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.nav-user')) {
    document.getElementById('userDropdown').classList.remove('show');
  }
});

// ---- TERMINAL INIT ----
function initTerminal() {
  buildTicker();
  updateClock();
  setInterval(updateClock, 1000);
  buildHomeTables();
  priceFlicker = setInterval(flickerPrices, 2500);
}

function updateClock() {
  const now = new Date();
  const str = now.toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const date = now.toLocaleDateString('tr-TR', {day:'2-digit',month:'short',year:'numeric'});
  document.getElementById('marketTime').textContent = `${date} ${str}`;
}

// ---- TICKER ----
function buildTicker() {
  const track = document.getElementById('tickerTrack');
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS]; // duplicate for seamless loop
  track.innerHTML = items.map(item => {
    const up = item.chg >= 0;
    const sign = up ? '+' : '';
    return `<div class="ticker-item" onclick="quickModal('${item.sym}',${item.price},${item.chg})">
      <span class="ticker-sym">${item.sym}</span>
      <span class="ticker-price">${formatPrice(item.price)}</span>
      <span class="ticker-chg ${up?'up':'down'}">${sign}${item.chg.toFixed(2)}%</span>
    </div>`;
  }).join('');
}

// ---- HOME TABLES ----
function buildHomeTables() {
  // Stocks - top 20 from BIST
  const stocks = EXCHANGES.bist.stocks.slice(0,20);
  document.getElementById('homeStocksTable').innerHTML = renderMarketRows(stocks, 'stock');

  // Forex - top 20
  const forex = FOREX_DATA.slice(0,20);
  document.getElementById('homeForexTable').innerHTML = renderMarketRows(forex, 'forex');

  // Commodities - all 30 (show 20)
  const comms = COMMODITIES_DATA.slice(0,20);
  document.getElementById('homeCommoditiesTable').innerHTML = renderMarketRows(comms, 'commodity');

  // Crypto - top 20
  const crypto = CRYPTO_DATA.slice(0,20);
  document.getElementById('homeCryptoTable').innerHTML = renderMarketRows(crypto, 'crypto');
}

function renderMarketRows(items, type) {
  return items.map(item => {
    const up = item.chg >= 0;
    const sign = up ? '+' : '';
    const price = item.unit ? `${formatPrice(item.price)} <small style="color:var(--text-dim);font-size:9px">${item.unit||''}</small>` : formatPrice(item.price);
    return `<div class="market-row" onclick="openModal('${item.sym}','${escHtml(item.name)}',${item.price},${item.chg})">
      <div>
        <div class="row-sym">${item.sym}</div>
        <div class="row-name">${item.name}</div>
      </div>
      <div class="row-price">${price}</div>
      <div class="row-chg ${up?'up':'down'}">${sign}${item.chg.toFixed(2)}%</div>
    </div>`;
  }).join('');
}

// ---- PAGE ROUTING ----
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  currentPage = page;
  const pageEl = document.getElementById(page + 'Page');
  if (pageEl) pageEl.classList.add('active');

  // Highlight nav
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => {
    if (n.querySelector('span') && n.querySelector('span').textContent.toLowerCase().includes(getNavKey(page))) {
      n.classList.add('active');
    }
  });

  if (page === 'stocks') {
    buildExchangePage(currentExchange);
  } else if (page === 'forex') {
    buildForexPage('all');
  } else if (page === 'crypto') {
    buildCryptoPage('all');
  } else if (page === 'commodities') {
    buildCommoditiesPage('all');
  }
}

function getNavKey(page) {
  const map = {home:'anasayfa',stocks:'hisse',forex:'döviz',crypto:'kripto',commodities:'emtia'};
  return map[page] || page;
}

// ---- EXCHANGE ----
function showExchange(exch) {
  currentExchange = exch;
  showPage('stocks');
}

function buildExchangePage(exchKey) {
  const exch = EXCHANGES[exchKey];
  if (!exch) return;
  document.getElementById('stocksTitle').textContent = exch.name + ' — ' + exch.country;

  // Build tabs
  const tabs = document.getElementById('exchangeTabs');
  const exchKeys = Object.keys(EXCHANGES);
  tabs.innerHTML = exchKeys.map(k => {
    return `<button class="ex-tab ${k===exchKey?'active':''}" onclick="buildExchangePage('${k}')">${EXCHANGES[k].name}</button>`;
  }).join('');

  // Build grid
  const grid = document.getElementById('stocksGrid');
  grid.innerHTML = exch.stocks.map((s, i) => renderStockCard(s, i)).join('');
}

function renderStockCard(s, rank) {
  const up = s.chg >= 0;
  const spark = generateSparkline(s.chg, up);
  return `<div class="stock-card ${up?'up':'down'}" onclick="openModal('${s.sym}','${escHtml(s.name)}',${s.price},${s.chg})">
    <div class="sc-sym">${s.sym}</div>
    <div class="sc-name">${s.name}</div>
    <div class="sc-price">${formatPrice(s.price)}</div>
    <div class="sc-chg ${up?'up':'down'}">${up?'+':''}${s.chg.toFixed(2)}%</div>
    <svg class="sc-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none">
      <path d="${spark}" stroke="${up?'var(--green)':'var(--red)'}" stroke-width="1.5" fill="none"/>
    </svg>
  </div>`;
}

// ---- FOREX PAGE ----
function showForexGroup(g) {
  currentForexGroup = g;
  showPage('forex');
}

function buildForexPage(grp) {
  const filtered = grp === 'all' ? FOREX_DATA : FOREX_DATA.filter(f => f.group === grp);
  document.getElementById('forexGrid').innerHTML = filtered.map((f, i) => {
    const up = f.chg >= 0;
    const spark = generateSparkline(f.chg, up);
    return `<div class="stock-card ${up?'up':'down'}" onclick="openModal('${f.sym}','${escHtml(f.name)}',${f.price},${f.chg})">
      <div class="sc-sym">${f.sym}</div>
      <div class="sc-name">${f.name}</div>
      <div class="sc-price">${formatPrice(f.price)}</div>
      <div class="sc-chg ${up?'up':'down'}">${up?'+':''}${f.chg.toFixed(2)}%</div>
      <svg class="sc-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none">
        <path d="${spark}" stroke="${up?'var(--green)':'var(--red)'}" stroke-width="1.5" fill="none"/>
      </svg>
    </div>`;
  }).join('');
}

// ---- CRYPTO PAGE ----
function showCryptoGroup(g) {
  currentCryptoGroup = g;
  showPage('crypto');
}

function buildCryptoPage(grp) {
  const filtered = grp === 'all' ? CRYPTO_DATA : CRYPTO_DATA.filter(c => c.group === grp);
  document.getElementById('cryptoGrid').innerHTML = filtered.map((c, i) => {
    const up = c.chg >= 0;
    const spark = generateSparkline(c.chg, up);
    return `<div class="stock-card ${up?'up':'down'}" onclick="openModal('${c.sym}','${escHtml(c.name)}',${c.price},${c.chg})">
      <div class="sc-sym">${c.sym}</div>
      <div class="sc-name">${c.name}</div>
      <div class="sc-price">${formatPrice(c.price)}</div>
      <div class="sc-chg ${up?'up':'down'}">${up?'+':''}${c.chg.toFixed(2)}%</div>
      <svg class="sc-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none">
        <path d="${spark}" stroke="${up?'var(--green)':'var(--red)'}" stroke-width="1.5" fill="none"/>
      </svg>
    </div>`;
  }).join('');
}

// ---- COMMODITIES PAGE ----
function showCommodityGroup(g) {
  currentCommodityGroup = g;
  showPage('commodities');
}

function buildCommoditiesPage(grp) {
  const filtered = grp === 'all' ? COMMODITIES_DATA : COMMODITIES_DATA.filter(c => c.group === grp);
  document.getElementById('commoditiesGrid').innerHTML = filtered.map((c, i) => {
    const up = c.chg >= 0;
    const spark = generateSparkline(c.chg, up);
    return `<div class="stock-card ${up?'up':'down'}" onclick="openModal('${c.sym}','${escHtml(c.name)}',${c.price},${c.chg})">
      <div class="sc-sym">${c.sym}</div>
      <div class="sc-name">${c.name} <small style="color:var(--text-dim)">${c.unit||''}</small></div>
      <div class="sc-price">${formatPrice(c.price)}</div>
      <div class="sc-chg ${up?'up':'down'}">${up?'+':''}${c.chg.toFixed(2)}%</div>
      <svg class="sc-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none">
        <path d="${spark}" stroke="${up?'var(--green)':'var(--red)'}" stroke-width="1.5" fill="none"/>
      </svg>
    </div>`;
  }).join('');
}

// ---- MODAL ----
function openModal(sym, name, price, chg) {
  const up = chg >= 0;
  document.getElementById('modalSymbol').textContent = sym;
  document.getElementById('modalName').textContent = name;
  document.getElementById('modalPrice').textContent = formatPrice(price);
  const chgEl = document.getElementById('modalChange');
  chgEl.textContent = (up?'+':'') + chg.toFixed(2) + '%';
  chgEl.className = 'modal-change ' + (up?'up':'down');

  // Stats
  const spread = price * 0.02;
  document.getElementById('statOpen').textContent = formatPrice(price * (1 - chg/100 * 0.8));
  document.getElementById('statHigh').textContent = formatPrice(price + spread * Math.random());
  document.getElementById('statLow').textContent = formatPrice(price - spread * Math.random());
  document.getElementById('statVol').textContent = formatVolume(Math.random() * 1e9);
  document.getElementById('stat52H').textContent = formatPrice(price * (1 + 0.15 + Math.random()*0.2));
  document.getElementById('stat52L').textContent = formatPrice(price * (0.65 + Math.random()*0.2));

  drawChart(price, chg, '1G');
  document.getElementById('detailModal').classList.add('open');
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.period-btn')[0].classList.add('active');
}

function quickModal(sym, price, chg) {
  openModal(sym, sym + ' Piyasa', price, chg);
}

function closeModal(e) {
  if (e.target === document.getElementById('detailModal')) closeModalBtn();
}

function closeModalBtn() {
  document.getElementById('detailModal').classList.remove('open');
}

function setPeriod(period, btn) {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const price = parseFloat(document.getElementById('modalPrice').textContent.replace(/[^0-9.]/g,''));
  const chg = parseFloat(document.getElementById('modalChange').textContent);
  drawChart(price, chg, period);
}

// ---- CHART ----
function drawChart(price, chg, period) {
  const canvas = document.getElementById('priceChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 800;
  const H = 300;
  canvas.width = W;
  canvas.height = H;

  const points = generateChartData(price, chg, period);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const up = points[points.length-1] >= points[0];

  const px = (i) => (i / (points.length - 1)) * (W - 60) + 30;
  const py = (v) => H - 50 - ((v - min) / range) * (H - 80);

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = 'rgba(26,37,64,0.8)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = 30 + ((H - 80) / 5) * i;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(W - 30, y);
    ctx.stroke();
    const val = max - (range / 5) * i;
    ctx.fillStyle = 'rgba(107,122,153,0.8)';
    ctx.font = '10px IBM Plex Mono';
    ctx.textAlign = 'right';
    ctx.fillText(formatPrice(val), 26, y + 3);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 30, 0, H - 50);
  if (up) {
    grad.addColorStop(0, 'rgba(0,230,118,0.3)');
    grad.addColorStop(1, 'rgba(0,230,118,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,61,87,0.3)');
    grad.addColorStop(1, 'rgba(255,61,87,0)');
  }

  ctx.beginPath();
  ctx.moveTo(px(0), py(points[0]));
  points.forEach((v, i) => { if (i > 0) ctx.lineTo(px(i), py(v)); });
  ctx.lineTo(px(points.length-1), H - 50);
  ctx.lineTo(px(0), H - 50);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = up ? '#00e676' : '#ff3d57';
  ctx.lineWidth = 2;
  ctx.moveTo(px(0), py(points[0]));
  points.forEach((v, i) => { if (i > 0) ctx.lineTo(px(i), py(v)); });
  ctx.stroke();

  // Current price line
  const lastY = py(points[points.length - 1]);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(0,212,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, lastY);
  ctx.lineTo(W - 30, lastY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label at end
  ctx.fillStyle = up ? '#00e676' : '#ff3d57';
  ctx.font = 'bold 11px IBM Plex Mono';
  ctx.textAlign = 'left';
  ctx.fillText(formatPrice(points[points.length-1]), W - 26, lastY + 4);
}

function generateChartData(price, chg, period) {
  const counts = {
    '1G': 48, '1H': 28, '1A': 30, '3A': 90, '1Y': 52
  };
  const n = counts[period] || 48;
  const volatility = {
    '1G': 0.008, '1H': 0.02, '1A': 0.05, '3A': 0.08, '1Y': 0.15
  }[period] || 0.008;

  const startPrice = price / (1 + chg / 100);
  const data = [startPrice];
  for (let i = 1; i < n; i++) {
    const drift = (chg / 100) / n;
    const rnd = (Math.random() - 0.5) * 2 * volatility;
    data.push(data[i-1] * (1 + drift + rnd));
  }
  return data;
}

// ---- SPARKLINE ----
function generateSparkline(chg, up) {
  const n = 20;
  const points = [15];
  for (let i = 1; i < n; i++) {
    const drift = (chg / 100) / n;
    const rnd = (Math.random() - 0.5) * 6;
    points.push(Math.max(2, Math.min(28, points[i-1] + drift * 80 + rnd)));
  }
  let d = `M 0 ${30 - points[0]}`;
  points.forEach((v, i) => {
    if (i > 0) d += ` L ${(i / (n-1)) * 100} ${30 - v}`;
  });
  return d;
}

// ---- PRICE FLICKERING ----
function flickerPrices() {
  // Update ticker
  const tickers = document.querySelectorAll('.ticker-item');
  tickers.forEach((t, i) => {
    const idx = i % TICKER_ITEMS.length;
    const item = TICKER_ITEMS[idx];
    const newChg = item.chg + (Math.random() - 0.5) * 0.1;
    const newPrice = item.price * (1 + (Math.random() - 0.5) * 0.001);
    const up = newChg >= 0;
    const priceEl = t.querySelector('.ticker-price');
    const chgEl = t.querySelector('.ticker-chg');
    if (priceEl) priceEl.textContent = formatPrice(newPrice);
    if (chgEl) {
      chgEl.textContent = (up?'+':'') + newChg.toFixed(2) + '%';
      chgEl.className = 'ticker-chg ' + (up ? 'up' : 'down');
    }
    // Flash effect
    t.style.background = up ? 'rgba(0,230,118,0.06)' : 'rgba(255,61,87,0.06)';
    setTimeout(() => { t.style.background = ''; }, 400);
  });
}

// ---- UTILITIES ----
function formatPrice(p) {
  if (p === undefined || p === null) return '-';
  if (p >= 1000000) return '$' + (p/1000000).toFixed(2) + 'M';
  if (p >= 10000) return p.toLocaleString('tr-TR', {minimumFractionDigits:0, maximumFractionDigits:0});
  if (p >= 1000) return p.toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2});
  if (p >= 1) return p.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00');
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(8);
}

function formatVolume(v) {
  if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v/1e3).toFixed(2) + 'K';
  return v.toFixed(0);
}

function escHtml(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showToast(msg, type='') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModalBtn();
  if (document.getElementById('mainTerminal').style.display === 'none') return;
  if (e.ctrlKey && e.key === '1') showPage('home');
  if (e.ctrlKey && e.key === '2') showPage('stocks');
  if (e.ctrlKey && e.key === '3') showPage('forex');
  if (e.ctrlKey && e.key === '4') showPage('crypto');
  if (e.ctrlKey && e.key === '5') showPage('commodities');
});

// Password strength meter
document.addEventListener('input', e => {
  if (e.target.id === 'regPass') {
    const strength = document.getElementById('passStrength');
    const v = e.target.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const colors = ['','#ff3d57','#ffcc00','#00d4ff','#00e676'];
    const widths = ['0%','25%','50%','75%','100%'];
    strength.style.background = colors[score] || '';
    strength.style.width = widths[score];
  }
});
