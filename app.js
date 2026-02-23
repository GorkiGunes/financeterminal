// ============================================================
// FINANCEX TERMINAL v2 — ANA UYGULAMA
// Firebase Auth + Firestore + Gercek API verisi
// ============================================================

// ── GLOBAL DURUM ─────────────────────────────────────────────
let currentUser     = null;
let userProfile     = null;
let userFavorites   = new Set();
let currentPage     = 'home';
let currentExchange = 'bist';
let cryptoCache     = null;
let forexCache      = null;
let refreshTimer    = null;
let resendInterval  = null;
let pendingRegUser  = null;   // kayit sirasinda firebase user
let modalCurrentItem = null;  // acik modalin verisi

// ── FIREBASE ALIAS ───────────────────────────────────────────
function FB() { return window.__FB; }

// ── AUTH STATE LISTENER ──────────────────────────────────────
window.onAuthChanged = async function(user) {
  if (user) {
    currentUser = user;
    await loadUserProfile(user);
    await loadFavorites();
    enterTerminal();
  } else {
    currentUser = null;
    userProfile = null;
    userFavorites.clear();
    showAuthScreen();
  }
};

// ── AUTH SCREEN HELPERS ──────────────────────────────────────
function showAuthScreen() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('mainTerminal').style.display = 'none';
}

function switchAuth(mode) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  const tabs = document.querySelectorAll('.auth-tab');
  if (mode === 'login')    tabs[0].classList.add('active');
  if (mode === 'register') tabs[1].classList.add('active');
  document.getElementById(mode + 'Form').classList.add('active');
}

function togglePass(id, eye) {
  const inp = document.getElementById(id);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  eye.style.opacity = inp.type === 'text' ? '1' : '0.5';
}

// ── GİRİŞ ────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if (!email || !pass) { errEl.textContent = 'Lutfen tum alanlari doldurun.'; return; }

  setBtnLoading('loginBtn', 'loginBtnText', 'loginSpinner', true);
  try {
    const fb = FB();
    // Persistence: beni hatirla
    const persist = document.getElementById('rememberMe')?.checked
      ? fb.browserLocalPersistence : fb.browserSessionPersistence;
    await fb.setPersistence(fb.auth, persist);
    const cred = await fb.signInWithEmailAndPassword(fb.auth, email, pass);
    if (!cred.user.emailVerified) {
      await fb.signOut(fb.auth);
      errEl.textContent = 'E-postaniz dogrulanmamis. Lutfen gelen kutunuzu kontrol edin.';
      setBtnLoading('loginBtn', 'loginBtnText', 'loginSpinner', false);
      return;
    }
    // onAuthChanged devralir
  } catch(e) {
    errEl.textContent = firebaseErrorTR(e.code);
    setBtnLoading('loginBtn', 'loginBtnText', 'loginSpinner', false);
  }
}

// ── GOOGLE GİRİŞ ─────────────────────────────────────────────
async function doGoogleLogin() {
  const fb = FB();
  try {
    const provider = new fb.GoogleAuthProvider();
    const cred = await fb.signInWithPopup(fb.auth, provider);
    // Yeni Google kullanicisi icin profil olustur
    const user = cred.user;
    const ref = fb.doc(fb.db, 'users', user.uid);
    const snap = await fb.getDoc(ref);
    if (!snap.exists()) {
      const parts = (user.displayName || '').split(' ');
      await fb.setDoc(ref, {
        firstName: parts[0] || '',
        lastName:  parts.slice(1).join(' ') || '',
        username:  user.email.split('@')[0],
        email:     user.email,
        phone:     '',
        createdAt: fb.serverTimestamp(),
        settings:  { currency:'USD', refresh: 60 }
      });
    }
    // onAuthChanged devralir
  } catch(e) {
    showToast(firebaseErrorTR(e.code), 'error');
  }
}

// ── DEMO GİRİŞ ───────────────────────────────────────────────
function loginDemo() {
  // Demo: Firebase olmadan dogrudan terminale gir
  currentUser  = { uid: 'demo', email: 'demo@financex.com', emailVerified: true, displayName: 'Demo' };
  userProfile  = { firstName: 'Demo', lastName: 'Kullanici', username: 'demo', email: 'demo@financex.com', settings: { currency:'USD', refresh:60 } };
  enterTerminal();
}

// ── KAYIT ─────────────────────────────────────────────────────
async function doRegister() {
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName  = document.getElementById('regLastName').value.trim();
  const username  = document.getElementById('regUsername').value.trim();
  const email     = document.getElementById('regEmail').value.trim();
  const pass      = document.getElementById('regPass').value;
  const pass2     = document.getElementById('regPass2').value;
  const terms     = document.getElementById('termsCheck')?.checked;
  const errEl     = document.getElementById('regError');
  errEl.textContent = '';

  if (!firstName || !lastName || !username || !email || !pass)
    return errEl.textContent = 'Lutfen tum alanlari doldurun.';
  if (pass !== pass2)
    return errEl.textContent = 'Parolalar eslesmiyor!';
  if (pass.length < 8)
    return errEl.textContent = 'Parola en az 8 karakter olmalidir.';
  if (!terms)
    return errEl.textContent = 'Kullanim Kosullarini kabul etmelisiniz.';

  setBtnLoading('regBtn', 'regBtnText', 'regSpinner', true);
  try {
    const fb = FB();
    const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pass);
    pendingRegUser = cred.user;

    // Display name guncelle
    await fb.updateProfile(cred.user, { displayName: firstName + ' ' + lastName });

    // Firestore'a kullanici belgesi olustur
    await fb.setDoc(fb.doc(fb.db, 'users', cred.user.uid), {
      firstName, lastName, username, email,
      phone: '',
      createdAt: fb.serverTimestamp(),
      settings: { currency: 'USD', refresh: 60 }
    });

    // Dogrulama e-postasi gonder (Firebase Auth yerlesik)
    await fb.sendEmailVerification(cred.user);

    // Firebase'den cikis yap - e-posta dogrulanmadan giris yapilmasin
    await fb.signOut(fb.auth);

    // Step 2'ye gec
    document.getElementById('regStep1').style.display = 'none';
    document.getElementById('regStep2').style.display = 'block';
    document.getElementById('verifyEmailDisplay').textContent = email;
    startResendTimer();
    showToast('Dogrulama e-postasi gonderildi!', 'success');
  } catch(e) {
    errEl.textContent = firebaseErrorTR(e.code);
  }
  setBtnLoading('regBtn', 'regBtnText', 'regSpinner', false);
}

// ── E-POSTA DOGRULAMA ─────────────────────────────────────────
async function checkEmailVerified() {
  const errEl = document.getElementById('verifyError');
  errEl.textContent = '';
  const email = document.getElementById('verifyEmailDisplay').textContent;
  const pass  = document.getElementById('regPass').value;
  try {
    const fb = FB();
    const cred = await fb.signInWithEmailAndPassword(fb.auth, email, pass);
    await cred.user.reload();
    if (!cred.user.emailVerified) {
      await fb.signOut(fb.auth);
      errEl.textContent = 'E-posta henuz dogrulanmamis. Lutfen once baglantiya tiklayin.';
      return;
    }
    // Basarili - onAuthChanged devralir
    showToast('Hesabiniz olusturuldu! Hos geldiniz.', 'success');
  } catch(e) {
    errEl.textContent = firebaseErrorTR(e.code);
  }
}

async function resendVerification() {
  const email = document.getElementById('verifyEmailDisplay').textContent;
  const pass  = document.getElementById('regPass').value;
  try {
    const fb = FB();
    const cred = await fb.signInWithEmailAndPassword(fb.auth, email, pass);
    await fb.sendEmailVerification(cred.user);
    await fb.signOut(fb.auth);
    showToast('Dogrulama e-postasi tekrar gonderildi!', 'success');
    startResendTimer();
  } catch(e) {
    showToast(firebaseErrorTR(e.code), 'error');
  }
}

function backToRegStep1() {
  document.getElementById('regStep1').style.display = 'block';
  document.getElementById('regStep2').style.display = 'none';
}

function startResendTimer() {
  let t = 60;
  const btn = document.getElementById('resendBtn');
  const el  = document.getElementById('resendTimer');
  if (btn) btn.disabled = true;
  clearInterval(resendInterval);
  resendInterval = setInterval(() => {
    if (el) el.textContent = ` (${t}s)`;
    if (--t < 0) {
      clearInterval(resendInterval);
      if (el)  el.textContent = '';
      if (btn) btn.disabled = false;
    }
  }, 1000);
}

// ── PAROLA SIFIRLAMA ─────────────────────────────────────────
async function doForgotPassword() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) return showToast('Lutfen once e-posta adresinizi girin.', 'error');
  try {
    const fb = FB();
    await fb.sendPasswordResetEmail(fb.auth, email);
    showToast('Parola sifirlama e-postasi gonderildi!', 'success');
  } catch(e) {
    showToast(firebaseErrorTR(e.code), 'error');
  }
}

// ── ÇIKIŞ ────────────────────────────────────────────────────
async function doLogout() {
  clearInterval(refreshTimer);
  try {
    if (currentUser?.uid !== 'demo') await FB().signOut(FB().auth);
    else { currentUser = null; showAuthScreen(); }
  } catch(e) { showToast('Cikis hatasi.', 'error'); }
}

// ── PROFİL YÜKLE ─────────────────────────────────────────────
async function loadUserProfile(user) {
  if (user.uid === 'demo') return;
  try {
    const fb = FB();
    const snap = await fb.getDoc(fb.doc(fb.db, 'users', user.uid));
    userProfile = snap.exists() ? snap.data() : {};
  } catch(e) {
    console.warn('Profil yuklenemedi:', e);
    userProfile = {};
  }
}

// ── FAVORİLER ─────────────────────────────────────────────────
async function loadFavorites() {
  if (!currentUser || currentUser.uid === 'demo') return;
  try {
    const fb = FB();
    const snap = await fb.getDocs(fb.collection(fb.db, 'users', currentUser.uid, 'favorites'));
    userFavorites.clear();
    snap.forEach(d => userFavorites.add(d.id));
    updateFavBadge();
  } catch(e) {
    console.warn('Favoriler yuklenemedi:', e);
  }
}

async function toggleFavorite(sym, name, price, chg) {
  if (!currentUser || currentUser.uid === 'demo') {
    showToast('Favoriler icin giris yapin.', 'error'); return;
  }
  const fb = FB();
  const ref = fb.doc(fb.db, 'users', currentUser.uid, 'favorites', sym);
  if (userFavorites.has(sym)) {
    await fb.deleteDoc(ref);
    userFavorites.delete(sym);
    showToast(sym + ' favorilerden kaldirildi.', '');
  } else {
    await fb.setDoc(ref, { sym, name, price, chg, addedAt: fb.serverTimestamp() });
    userFavorites.add(sym);
    showToast(sym + ' favorilere eklendi!', 'success');
  }
  updateFavBadge();
  updateModalFavBtn(sym);
}

function updateFavBadge() {
  const badge = document.getElementById('favCountBadge');
  if (!badge) return;
  if (userFavorites.size > 0) {
    badge.textContent = userFavorites.size;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function toggleFavFromModal() {
  if (!modalCurrentItem) return;
  const { sym, name, price, chg } = modalCurrentItem;
  toggleFavorite(sym, name, price, chg);
}

function updateModalFavBtn(sym) {
  const btn = document.getElementById('modalFavBtn');
  if (!btn) return;
  const isFav = userFavorites.has(sym);
  btn.textContent = isFav ? '★' : '☆';
  btn.classList.toggle('active', isFav);
  btn.title = isFav ? 'Favorilerden kaldir' : 'Favorilere ekle';
}

// ── TERMİNALE GİR ────────────────────────────────────────────
function enterTerminal() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainTerminal').style.display = 'block';

  const name  = userProfile?.firstName || currentUser?.displayName?.split(' ')[0] || 'Kullanici';
  const email = currentUser?.email || '';
  const init  = name[0]?.toUpperCase() || '?';

  document.getElementById('userName').textContent      = name;
  document.getElementById('userEmailNav').textContent  = email;
  document.getElementById('userAvatar').textContent    = init;
  document.getElementById('udAvatar').textContent      = init;
  document.getElementById('udName').textContent        = (userProfile?.firstName || '') + ' ' + (userProfile?.lastName || '');
  document.getElementById('udEmail').textContent       = email;

  buildTicker();
  updateClock();
  setInterval(updateClock, 1000);
  buildHomeTables();
  fetchLiveData();

  // Otomatik yenileme
  const refreshMs = (userProfile?.settings?.refresh || 60) * 1000;
  if (refreshMs > 0) {
    refreshTimer = setInterval(fetchLiveData, refreshMs);
  }
}

// ── CANLI VERİ ÇEK ───────────────────────────────────────────
async function fetchLiveData() {
  setApiStatus('loading');
  let anyOk = false;

  // 1) Kripto - CoinGecko
  const cgData = await API.getCryptoData();
  if (cgData) {
    cryptoCache = cgData;
    document.getElementById('cryptoUpdateTime').textContent = new Date().toLocaleTimeString('tr-TR');
    buildHomeCryptoTable();
    if (currentPage === 'crypto') buildCryptoPage(window._cryptoGroup || 'all');
    buildTicker();
    anyOk = true;
  }

  // 2) Doviz - ExchangeRate-API
  const fxRates = await API.getForexData();
  if (fxRates) {
    mergeFxRates(fxRates);
    document.getElementById('forexUpdateTime').textContent = new Date().toLocaleTimeString('tr-TR');
    buildHomeForexTable();
    if (currentPage === 'forex') buildForexPage(window._forexGroup || 'all');
    anyOk = true;
  }

  setApiStatus(anyOk ? 'ok' : 'err');
}

function setApiStatus(state) {
  const el = document.getElementById('apiStatus');
  if (!el) return;
  el.className = 'api-status ' + state;
  el.title = { ok: 'API baglantisi aktif', err: 'API hatasi - yedek veri', loading: 'Veriler yukleniyor...' }[state] || '';
}

function mergeFxRates(rates) {
  // FOREX_DATA icindeki fiyatlari gercek oranlarla guncelle
  FOREX_DATA.forEach(pair => {
    const [base, quote] = pair.sym.split('/');
    if (base === 'USD' && rates[quote]) {
      const oldPrice = pair.price;
      pair.price = 1 / rates[quote] * (base === 'USD' ? rates[quote] : 1);
      if (base === 'USD') pair.price = rates[quote];
      pair.chg = oldPrice ? ((pair.price - oldPrice) / oldPrice * 100) : pair.chg;
    }
  });
}

// ── CLOCK ──────────────────────────────────────────────────────
function updateClock() {
  const now  = new Date();
  const time = now.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const date = now.toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' });
  const el = document.getElementById('marketTime');
  if (el) el.textContent = `${date} ${time}`;
}

// ── TICKER ────────────────────────────────────────────────────
function buildTicker() {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  // Kripto cachenin ilk 15'ini + statik varliklari birlestir
  let items = [...TICKER_ITEMS];
  if (cryptoCache) {
    cryptoCache.slice(0, 15).forEach(c => {
      const idx = items.findIndex(i => i.sym === c.sym);
      if (idx >= 0) items[idx] = { ...items[idx], price: c.price, chg: c.chg };
    });
  }
  const doubled = [...items, ...items];
  track.innerHTML = doubled.map(item => {
    const up   = item.chg >= 0;
    const sign = up ? '+' : '';
    return `<div class="ticker-item" onclick="quickModal('${item.sym}',${item.price},${item.chg})">
      <span class="ticker-sym">${item.sym}</span>
      <span class="ticker-price">${formatPrice(item.price)}</span>
      <span class="ticker-chg ${up?'up':'down'}">${sign}${(+item.chg).toFixed(2)}%</span>
    </div>`;
  }).join('');
}

// ── HOME TABLES ───────────────────────────────────────────────
function buildHomeTables() {
  // Hisseler - BIST ilk 20
  const stocks = EXCHANGES.bist.stocks.slice(0, 20);
  document.getElementById('homeStocksTable').innerHTML = renderMarketRows(stocks);

  // Summary kartlar
  const cards = [
    { label:'ALTIN',     sym:'XAU/USD', price:COMMODITIES_DATA[0].price, chg:COMMODITIES_DATA[0].chg },
    { label:'USD/TRY',   sym:'USD/TRY', price:FOREX_DATA[0].price,       chg:FOREX_DATA[0].chg },
    { label:'BITCOIN',   sym:'BTC',     price:CRYPTO_DATA[0].price,      chg:CRYPTO_DATA[0].chg },
    { label:'BIST 100',  sym:'XU100',   price:9847,  chg:+1.02 },
    { label:'S&P 500',   sym:'SPX',     price:5234,  chg:-0.45 },
    { label:'PETROL WTI',sym:'WTI',     price:COMMODITIES_DATA[13].price, chg:COMMODITIES_DATA[13].chg },
  ];
  document.getElementById('summaryCards').innerHTML = cards.map(c => {
    const up = c.chg >= 0;
    return `<div class="summary-card ${up?'green':'red'}" onclick="quickModal('${c.sym}',${c.price},${c.chg})">
      <div class="card-label">${c.label}</div>
      <div class="card-value">${formatPrice(c.price)}</div>
      <div class="card-change">${up?'+':''}${c.chg.toFixed(2)}%</div>
    </div>`;
  }).join('');

  // Emtia statik
  document.getElementById('homeCommoditiesTable').innerHTML =
    renderMarketRows(COMMODITIES_DATA.slice(0, 20));

  buildHomeForexTable();
  buildHomeCryptoTable();
}

function buildHomeForexTable() {
  document.getElementById('homeForexTable').innerHTML =
    renderMarketRows(FOREX_DATA.slice(0, 20));
}

function buildHomeCryptoTable() {
  const source = cryptoCache ? cryptoCache.slice(0, 20) : CRYPTO_DATA.slice(0, 20);
  document.getElementById('homeCryptoTable').innerHTML = renderMarketRows(source);
}

function renderMarketRows(items) {
  return items.map(item => {
    const up   = item.chg >= 0;
    const sign = up ? '+' : '';
    return `<div class="market-row" onclick="openModal('${item.sym}','${escJs(item.name)}',${item.price},${item.chg})">
      <div>
        <div class="row-sym">${item.sym}</div>
        <div class="row-name">${item.name}</div>
      </div>
      <div class="row-price">${formatPrice(item.price)}</div>
      <div class="row-chg ${up?'up':'down'}">${sign}${(+item.chg).toFixed(2)}%</div>
    </div>`;
  }).join('');
}

// ── PAGE ROUTING ─────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  currentPage = page;
  const pageEl = document.getElementById(page + 'Page');
  if (pageEl) pageEl.classList.add('active');

  // Aktif nav item
  const navMap = { home:0, stocks:1, forex:2, crypto:3, commodities:4, favorites:5 };
  const navItems = document.querySelectorAll('.nav-item');
  if (navMap[page] !== undefined && navItems[navMap[page]])
    navItems[navMap[page]].classList.add('active');

  if (page === 'stocks')      buildExchangePage(currentExchange);
  if (page === 'forex')       buildForexPage(window._forexGroup || 'all');
  if (page === 'crypto')      buildCryptoPage(window._cryptoGroup || 'all');
  if (page === 'commodities') buildCommoditiesPage(window._commodityGroup || 'all');
  if (page === 'favorites')   buildFavoritesPage();
  if (page === 'profile')     buildProfilePage();
  if (page === 'settings')    buildSettingsPage();

  document.getElementById('userDropdown')?.classList.remove('show');
}

function showExchange(exch) {
  currentExchange = exch;
  showPage('stocks');
}
function showForexGroup(g) { window._forexGroup = g; showPage('forex'); }
function showCryptoGroup(g) { window._cryptoGroup = g; showPage('crypto'); }
function showCommodityGroup(g) { window._commodityGroup = g; showPage('commodities'); }

// ── EXCHANGE PAGE ─────────────────────────────────────────────
function buildExchangePage(exchKey) {
  const exch = EXCHANGES[exchKey];
  if (!exch) return;
  currentExchange = exchKey;
  document.getElementById('stocksTitle').textContent = exch.name + ' — ' + exch.country;

  // Tabs
  const tabs = Object.keys(EXCHANGES).map(k =>
    `<button class="ex-tab ${k===exchKey?'active':''}" onclick="buildExchangePage('${k}')">${EXCHANGES[k].name}</button>`
  ).join('');
  document.getElementById('exchangeTabs').innerHTML = tabs;

  // Grid
  document.getElementById('stocksGrid').innerHTML =
    exch.stocks.map((s, i) => renderStockCard(s, i)).join('');
}

function renderStockCard(s) {
  const up   = s.chg >= 0;
  const isFav = userFavorites.has(s.sym);
  const spark = generateSparkline(s.chg);
  return `<div class="stock-card ${up?'up':'down'}">
    <div class="card-top-row">
      <div>
        <div class="sc-sym">${s.sym}</div>
        <div class="sc-name">${s.name}</div>
      </div>
      <button class="card-fav-btn ${isFav?'active':''}"
        onclick="event.stopPropagation();toggleFavorite('${s.sym}','${escJs(s.name)}',${s.price},${s.chg})"
        title="${isFav?'Favorilerden kaldir':'Favorilere ekle'}">
        ${isFav?'★':'☆'}
      </button>
    </div>
    <div onclick="openModal('${s.sym}','${escJs(s.name)}',${s.price},${s.chg})" style="cursor:pointer">
      <div class="sc-price">${formatPrice(s.price)}</div>
      <div class="sc-chg ${up?'up':'down'}">${up?'+':''}${(+s.chg).toFixed(2)}%</div>
      <svg class="sc-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none">
        <path d="${spark}" stroke="${up?'var(--green)':'var(--red)'}" stroke-width="1.5" fill="none"/>
      </svg>
    </div>
  </div>`;
}

// ── FOREX PAGE ────────────────────────────────────────────────
function buildForexPage(grp) {
  const filtered = grp === 'all' ? FOREX_DATA : FOREX_DATA.filter(f => f.group === grp);
  document.getElementById('forexGrid').innerHTML = filtered.map(f => renderStockCard(f)).join('');
}

// ── CRYPTO PAGE ───────────────────────────────────────────────
function buildCryptoPage(grp) {
  let source = cryptoCache || CRYPTO_DATA;
  if (grp !== 'all') {
    const groupMap = { top10: c => c.rank <= 10 || c.group === 'top10',
                       defi: c => c.group === 'defi',
                       altcoins: c => c.group === 'altcoins' };
    if (groupMap[grp]) source = source.filter(groupMap[grp]);
  }
  document.getElementById('cryptoGrid').innerHTML = source.map(c => renderStockCard(c)).join('');
}

// ── COMMODITIES PAGE ──────────────────────────────────────────
function buildCommoditiesPage(grp) {
  const filtered = grp === 'all' ? COMMODITIES_DATA : COMMODITIES_DATA.filter(c => c.group === grp);
  document.getElementById('commoditiesGrid').innerHTML = filtered.map(c => renderStockCard(c)).join('');
}

// ── FAVORITES PAGE ────────────────────────────────────────────
async function buildFavoritesPage() {
  const emptyEl = document.getElementById('favEmptyState');
  const gridEl  = document.getElementById('favGrid');
  const infoEl  = document.getElementById('favInfo');

  if (!currentUser || currentUser.uid === 'demo') {
    infoEl.textContent = 'Favoriler icin giris yapin';
    emptyEl.style.display = 'block'; gridEl.innerHTML = ''; return;
  }

  infoEl.textContent = 'Yukleniyor...';
  try {
    const fb = FB();
    const snap = await fb.getDocs(fb.collection(fb.db, 'users', currentUser.uid, 'favorites'));
    const items = [];
    snap.forEach(d => items.push(d.data()));

    if (items.length === 0) {
      emptyEl.style.display = 'block'; gridEl.innerHTML = '';
      infoEl.textContent = '0 favori'; return;
    }
    emptyEl.style.display = 'none';
    gridEl.innerHTML = items.map(item => renderStockCard(item)).join('');
    infoEl.textContent = items.length + ' favori | Firestore';
  } catch(e) {
    infoEl.textContent = 'Yuklenemedi';
    showToast('Favoriler yuklenemedi: ' + e.message, 'error');
  }
}

// ── PROFILE PAGE ──────────────────────────────────────────────
function buildProfilePage() {
  if (!currentUser) return;
  const p = userProfile || {};
  const el = id => document.getElementById(id);
  const name = (p.firstName || '') + ' ' + (p.lastName || '');
  const init = (p.firstName || currentUser.email || '?')[0].toUpperCase();

  el('profileAvatarBig').textContent = init;
  el('profileDisplayName').textContent = name.trim() || '—';
  el('profileEmailShow').textContent   = currentUser.email || '—';
  el('profileEmail').value             = currentUser.email || '';
  el('profileFirstName').value         = p.firstName || '';
  el('profileLastName').value          = p.lastName  || '';
  el('profileUsername').value          = p.username  || '';
  el('profilePhone').value             = p.phone     || '';

  // Dogrulama rozeti
  const badge = el('profileVerifyBadge');
  const isVerified = currentUser.emailVerified || currentUser.uid === 'demo';
  badge.textContent = isVerified ? '✓ E-posta Dogrulandi' : '✗ E-posta Dogrulanmadi';
  badge.className = 'profile-verify-badge ' + (isVerified ? 'verified' : 'unverified');

  // Kayit tarihi
  if (p.createdAt?.seconds) {
    const d = new Date(p.createdAt.seconds * 1000);
    el('profileJoinDate').textContent = 'Uye: ' + d.toLocaleDateString('tr-TR');
  }
}

async function saveProfile() {
  if (!currentUser || currentUser.uid === 'demo') {
    return showToast('Demo hesapta profil kaydedilemez.', 'error');
  }
  const data = {
    firstName: document.getElementById('profileFirstName').value.trim(),
    lastName:  document.getElementById('profileLastName').value.trim(),
    username:  document.getElementById('profileUsername').value.trim(),
    phone:     document.getElementById('profilePhone').value.trim(),
  };
  try {
    const fb = FB();
    await fb.updateDoc(fb.doc(fb.db, 'users', currentUser.uid), data);
    userProfile = { ...userProfile, ...data };
    // Navbar'i guncelle
    document.getElementById('userName').textContent = data.firstName;
    document.getElementById('userAvatar').textContent = data.firstName[0]?.toUpperCase() || '?';
    document.getElementById('udAvatar').textContent   = data.firstName[0]?.toUpperCase() || '?';
    document.getElementById('udName').textContent     = data.firstName + ' ' + data.lastName;
    buildProfilePage();
    showToast('Profil basariyla guncellendi!', 'success');
  } catch(e) {
    showToast('Kayit hatasi: ' + e.message, 'error');
  }
}

async function changePassword() {
  if (!currentUser || currentUser.uid === 'demo') {
    return showToast('Demo hesapta parola degistirilemez.', 'error');
  }
  const cur  = document.getElementById('currentPass').value;
  const nw   = document.getElementById('newPass').value;
  const nw2  = document.getElementById('newPass2').value;
  if (!cur || !nw || !nw2) return showToast('Tum parola alanlarini doldurun.', 'error');
  if (nw !== nw2)           return showToast('Yeni parolalar eslesmiyor!', 'error');
  if (nw.length < 8)        return showToast('Yeni parola en az 8 karakter olmalidir.', 'error');
  try {
    const fb   = FB();
    const cred = fb.EmailAuthProvider.credential(currentUser.email, cur);
    await fb.reauthenticateWithCredential(currentUser, cred);
    await fb.updatePassword(currentUser, nw);
    document.getElementById('currentPass').value = '';
    document.getElementById('newPass').value     = '';
    document.getElementById('newPass2').value    = '';
    showToast('Parolaniz basariyla degistirildi!', 'success');
  } catch(e) {
    showToast(firebaseErrorTR(e.code), 'error');
  }
}

async function confirmDeleteAccount() {
  const confirmed = confirm('DIKKAT: Bu islem geri alinamaz!\nHesabiniz ve tum verileriniz kalici olarak silinecek.\n\nDevam etmek istiyor musunuz?');
  if (!confirmed) return;
  const pass = prompt('Onaylamak icin mevcut parolanizi girin:');
  if (!pass) return;
  try {
    const fb   = FB();
    const cred = fb.EmailAuthProvider.credential(currentUser.email, pass);
    await fb.reauthenticateWithCredential(currentUser, cred);
    await fb.deleteDoc(fb.doc(fb.db, 'users', currentUser.uid));
    await fb.deleteUser(currentUser);
    showToast('Hesabiniz silindi.', '');
  } catch(e) {
    showToast(firebaseErrorTR(e.code), 'error');
  }
}

// ── SETTINGS PAGE ─────────────────────────────────────────────
function buildSettingsPage() {
  const key = localStorage.getItem('fx_alpha_key') || 'BVRQLID7TZIU3OK2';
  document.getElementById('settingAlphaKey').value = key ? key.slice(0,4) + '...' + key.slice(-4) : '';
  const settings = userProfile?.settings || {};
  const curr = document.getElementById('settingCurrency');
  const ref  = document.getElementById('settingRefresh');
  if (curr) curr.value = settings.currency || 'USD';
  if (ref)  ref.value  = settings.refresh  || '60';
}

async function saveApiKeys() {
  const raw = document.getElementById('settingAlphaKey').value.trim();
  if (raw && !raw.includes('...') && raw.length > 8) {
    localStorage.setItem('fx_alpha_key', raw);
    showToast('Alpha Vantage API anahtari kaydedildi! Veriler yenileniyor...', 'success');
    fetchLiveData();
  } else if (raw.includes('...')) {
    showToast('Mevcut anahtar aktif: BVRQ...OK2', 'success');
  } else {
    showToast('Gecerli bir API anahtari girin (en az 8 karakter).', 'error');
  }
}

async function saveSetting(key, val) {
  if (!currentUser || currentUser.uid === 'demo') return;
  try {
    const fb = FB();
    await fb.updateDoc(fb.doc(fb.db, 'users', currentUser.uid), {
      ['settings.' + key]: val
    });
    if (!userProfile.settings) userProfile.settings = {};
    userProfile.settings[key] = val;
    if (key === 'refresh') {
      clearInterval(refreshTimer);
      const ms = parseInt(val) * 1000;
      if (ms > 0) refreshTimer = setInterval(fetchLiveData, ms);
    }
    showToast('Ayar kaydedildi.', 'success');
  } catch(e) {
    showToast('Ayar kaydedilemedi: ' + e.message, 'error');
  }
}

// ── MODAL ─────────────────────────────────────────────────────
function openModal(sym, name, price, chg) {
  price = parseFloat(price); chg = parseFloat(chg);
  modalCurrentItem = { sym, name, price, chg };
  const up = chg >= 0;

  document.getElementById('modalSymbol').textContent = sym;
  document.getElementById('modalName').textContent   = name;
  document.getElementById('modalPrice').textContent  = formatPrice(price);
  const chgEl = document.getElementById('modalChange');
  chgEl.textContent = (up?'+':'') + chg.toFixed(2) + '%';
  chgEl.className   = 'modal-change ' + (up ? 'up' : 'down');

  const spread = price * 0.02;
  document.getElementById('statOpen').textContent = formatPrice(price * (1 - chg/100 * 0.8));
  document.getElementById('statHigh').textContent = formatPrice(price + spread * Math.random());
  document.getElementById('statLow').textContent  = formatPrice(price - spread * Math.random());
  document.getElementById('statVol').textContent  = formatVolume(Math.random() * 1e9);
  document.getElementById('stat52H').textContent  = formatPrice(price * (1.10 + Math.random() * 0.2));
  document.getElementById('stat52L').textContent  = formatPrice(price * (0.65 + Math.random() * 0.2));

  updateModalFavBtn(sym);
  drawChart(price, chg, '1G');
  document.getElementById('detailModal').classList.add('open');
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.period-btn')[0]?.classList.add('active');
}

function quickModal(sym, price, chg) { openModal(sym, sym, price, chg); }

function closeModal(e) {
  if (e.target === document.getElementById('detailModal')) closeModalBtn();
}
function closeModalBtn() {
  document.getElementById('detailModal').classList.remove('open');
  modalCurrentItem = null;
}
function setPeriod(period, btn) {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (!modalCurrentItem) return;
  drawChart(modalCurrentItem.price, modalCurrentItem.chg, period);
}

// ── CHART ─────────────────────────────────────────────────────
function drawChart(price, chg, period) {
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 800;
  const H = 300;
  canvas.width = W; canvas.height = H;

  const pts = generateChartData(price, chg, period);
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const up = pts[pts.length-1] >= pts[0];
  const px = i => (i / (pts.length - 1)) * (W - 60) + 30;
  const py = v  => H - 50 - ((v - min) / range) * (H - 80);

  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(26,37,64,0.8)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = 30 + ((H - 80) / 5) * i;
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(W - 30, y); ctx.stroke();
    const val = max - (range / 5) * i;
    ctx.fillStyle = 'rgba(107,122,153,0.7)';
    ctx.font = '10px IBM Plex Mono'; ctx.textAlign = 'right';
    ctx.fillText(formatPrice(val), 26, y + 3);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 30, 0, H - 50);
  if (up) { grad.addColorStop(0, 'rgba(0,230,118,0.3)'); grad.addColorStop(1, 'rgba(0,230,118,0)'); }
  else    { grad.addColorStop(0, 'rgba(255,61,87,0.3)');  grad.addColorStop(1, 'rgba(255,61,87,0)'); }
  ctx.beginPath();
  ctx.moveTo(px(0), py(pts[0]));
  pts.forEach((v, i) => { if (i > 0) ctx.lineTo(px(i), py(v)); });
  ctx.lineTo(px(pts.length-1), H - 50); ctx.lineTo(px(0), H - 50); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = up ? '#00e676' : '#ff3d57'; ctx.lineWidth = 2;
  ctx.moveTo(px(0), py(pts[0]));
  pts.forEach((v, i) => { if (i > 0) ctx.lineTo(px(i), py(v)); });
  ctx.stroke();

  // Current price dashed line
  const lastY = py(pts[pts.length-1]);
  ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(0,212,255,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, lastY); ctx.lineTo(W - 30, lastY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = up ? '#00e676' : '#ff3d57';
  ctx.font = 'bold 11px IBM Plex Mono'; ctx.textAlign = 'left';
  ctx.fillText(formatPrice(pts[pts.length-1]), W - 26, lastY + 4);
}

function generateChartData(price, chg, period) {
  const n   = { '1G':48, '1H':28, '1A':30, '3A':90, '1Y':52 }[period] || 48;
  const vol = { '1G':0.008, '1H':0.02, '1A':0.05, '3A':0.08, '1Y':0.15 }[period] || 0.008;
  const start = price / (1 + chg / 100);
  const data  = [start];
  for (let i = 1; i < n; i++) {
    const drift = (chg / 100) / n;
    const rnd   = (Math.random() - 0.5) * 2 * vol;
    data.push(data[i-1] * (1 + drift + rnd));
  }
  return data;
}

// ── SPARKLINE ─────────────────────────────────────────────────
function generateSparkline(chg) {
  const n = 20; const pts = [15];
  for (let i = 1; i < n; i++) {
    const drift = (chg / 100) / n;
    const rnd   = (Math.random() - 0.5) * 6;
    pts.push(Math.max(2, Math.min(28, pts[i-1] + drift * 80 + rnd)));
  }
  let d = `M 0 ${30 - pts[0]}`;
  pts.forEach((v, i) => { if (i > 0) d += ` L ${(i/(n-1))*100} ${30 - v}`; });
  return d;
}

// ── PAROLA GÜCÜ ───────────────────────────────────────────────
function checkPassStrength(v) {
  let score = 0;
  if (v.length >= 8)         score++;
  if (/[A-Z]/.test(v))      score++;
  if (/[0-9]/.test(v))      score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const fill  = document.getElementById('passStrengthFill');
  const label = document.getElementById('passStrengthLabel');
  const colors = ['','#ff3d57','#ffcc00','#00d4ff','#00e676'];
  const labels = ['','ZAYıF','ORTA','GÜÇlÜ','ÇOK GÜÇLÜ'];
  const widths = ['0%','25%','50%','75%','100%'];
  if (fill)  { fill.style.width = widths[score]; fill.style.background = colors[score]; }
  if (label) { label.textContent = labels[score] || ''; label.style.color = colors[score]; }
}

// ── USER DROPDOWN ─────────────────────────────────────────────
function toggleUserMenu() {
  document.getElementById('userDropdown')?.classList.toggle('show');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.nav-user'))
    document.getElementById('userDropdown')?.classList.remove('show');
});

// ── UTILITIES ─────────────────────────────────────────────────
function formatPrice(p) {
  if (p === undefined || p === null || isNaN(p)) return '—';
  if (p >= 1000000) return (p/1000000).toFixed(2) + 'M';
  if (p >= 10000)   return p.toLocaleString('tr-TR', { maximumFractionDigits:0 });
  if (p >= 100)     return p.toFixed(2);
  if (p >= 1)       return p.toFixed(4);
  if (p >= 0.01)    return p.toFixed(4);
  return p.toFixed(8);
}

function formatVolume(v) {
  if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v/1e3).toFixed(2) + 'K';
  return v.toFixed(0);
}

function escJs(str) {
  return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function setBtnLoading(btnId, textId, spinnerId, loading) {
  const btn     = document.getElementById(btnId);
  const textEl  = document.getElementById(textId);
  const spinner = document.getElementById(spinnerId);
  if (btn)    btn.disabled    = loading;
  if (textEl) textEl.style.display  = loading ? 'none' : 'inline';
  if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
}

function showToast(msg, type = '') {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function firebaseErrorTR(code) {
  const map = {
    'auth/user-not-found':        'Bu e-posta ile kayitli hesap bulunamadi.',
    'auth/wrong-password':        'Hatali parola.',
    'auth/email-already-in-use':  'Bu e-posta zaten kullanilmakta.',
    'auth/invalid-email':         'Gecersiz e-posta adresi.',
    'auth/weak-password':         'Parola en az 6 karakter olmalidir.',
    'auth/too-many-requests':     'Cok fazla basarisiz deneme. Lutfen bekleyin.',
    'auth/requires-recent-login': 'Bu islem icin tekrar giris yapmaniz gerekiyor.',
    'auth/popup-closed-by-user':  'Google giris penceresi kapatildi.',
    'auth/network-request-failed':'Baglanti hatasi. Internetinizi kontrol edin.',
    'auth/invalid-credential':    'Hatali e-posta veya parola.',
  };
  return map[code] || ('Hata: ' + (code || 'Bilinmeyen hata'));
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModalBtn();
  if (document.getElementById('mainTerminal')?.style.display === 'none') return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '1') { e.preventDefault(); showPage('home'); }
    if (e.key === '2') { e.preventDefault(); showPage('stocks'); }
    if (e.key === '3') { e.preventDefault(); showPage('forex'); }
    if (e.key === '4') { e.preventDefault(); showPage('crypto'); }
    if (e.key === '5') { e.preventDefault(); showPage('commodities'); }
  }
});
