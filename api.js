// ============================================================
// FINANCEX TERMINAL — API KATMANI
// CoinGecko (kripto), ExchangeRate-API (doviz),
// Alpha Vantage (hisse) entegrasyonlari
// ============================================================

const API = {

  // ── ALPHA VANTAGE KEY (Ayarlar sayfasindan kayit edilir) ────
  get alphaKey() {
    // Oncelik: kullanici ayarlarindan gelen key, yoksa varsayilan key
    return localStorage.getItem('fx_alpha_key') || 'BVRQLID7TZIU3OK2';
  },

  // ── COINGECKO — Ucretsiz, key gerektirmez ───────────────────
  // Dokümantasyon: https://www.coingecko.com/en/api/documentation
  async getCryptoData() {
    const ids = [
      'bitcoin','ethereum','binancecoin','solana','ripple','usd-coin',
      'cardano','avalanche-2','dogecoin','tron','polkadot','chainlink',
      'matic-network','internet-computer','litecoin','uniswap','aave',
      'maker','curve-dao-token','compound-governance-token','synthetix-network-token',
      '1inch','sushiswap','yearn-finance','balancer','shiba-inu','pepe',
      'dogwifcoin','floki','bonk','injective-protocol','arweave','filecoin',
      'cosmos','near','aptos','sui','sei-network','optimism','arbitrum',
      'algorand','vechain','hedera-hashgraph','ethereum-classic','stellar',
      'monero','bitcoin-cash','kaspa','fantom','the-graph','lido-dao',
      'thorchain','pendle','jupiter','jito-governance-token','pyth-network',
      'wormhole','starknet','zksync','manta-network','ethena','ether-fi',
      'renzo','saga-2','bittensor','render-token','fetch-ai',
      'singularitynet','ocean-protocol','aioz-network','conflux-token',
      'oasis-network','mina-protocol','flow','kava','celo','icon',
      'qtum','zilliqa','ontology','horizen','iota','digibyte','ravencoin',
      'siacoin','storj','helium','iotex','jasmy','chiliz','enjincoin',
      'the-sandbox','decentraland','axie-infinity','immutable-x','gala',
      'bitcoin-sv','dash','zcash','decred','nano','vertcoin','waves',
      'nem','lisk','ark','stratis'
    ].join(',');
    try {
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('CoinGecko HTTP ' + res.status);
      const data = await res.json();
      return data.map(c => ({
        sym:    c.symbol.toUpperCase(),
        name:   c.name,
        price:  c.current_price,
        chg:    c.price_change_percentage_24h || 0,
        cap:    c.market_cap,
        vol:    c.total_volume,
        high:   c.high_24h,
        low:    c.low_24h,
        rank:   c.market_cap_rank,
        image:  c.image,
        group:  c.market_cap_rank <= 10 ? 'top10' : 'altcoins'
      }));
    } catch(e) {
      console.warn('CoinGecko API hatasi:', e.message);
      return null; // fallback'e duser
    }
  },

  // ── EXCHANGERATE-API — Ucretsiz tier (1500 istek/ay) ────────
  // Dokümantasyon: https://www.exchangerate-api.com
  // Key GEREKMEZ - ucretsiz endpoint
  async getForexData() {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) throw new Error('ExchangeRate HTTP ' + res.status);
      const data = await res.json();
      if (data.result !== 'success') throw new Error('API yanit hatasi');
      return data.rates; // { EUR: 0.92, TRY: 32.45, ... }
    } catch(e) {
      console.warn('ExchangeRate-API hatasi:', e.message);
      return null;
    }
  },

  // ── ALPHA VANTAGE — Hisse verileri ──────────────────────────
  // Ucretsiz: Gunde 25 istek, dakikada 5 istek
  // Key al: https://www.alphavantage.co/support/#api-key
  async getStockQuote(symbol) {
    const key = this.alphaKey;
    if (!key) return null;
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${key}`;
      const res = await fetch(url);
      const data = await res.json();
      const q = data['Global Quote'];
      if (!q || !q['05. price']) return null;
      return {
        sym:   symbol,
        price: parseFloat(q['05. price']),
        chg:   parseFloat(q['10. change percent'].replace('%','')),
        open:  parseFloat(q['02. open']),
        high:  parseFloat(q['03. high']),
        low:   parseFloat(q['04. low']),
        vol:   parseInt(q['06. volume']),
        prev:  parseFloat(q['08. previous close'])
      };
    } catch(e) {
      console.warn('Alpha Vantage hatasi:', symbol, e.message);
      return null;
    }
  },

  // Birden fazla hisse - rate limit icin queue
  async getMultipleStocks(symbols) {
    const results = {};
    // Alpha Vantage ucretsiz = 5 istek/dk
    // Batch cekmek yerine onbellek kullaniriz
    for (let i = 0; i < Math.min(symbols.length, 5); i++) {
      const q = await this.getStockQuote(symbols[i]);
      if (q) results[symbols[i]] = q;
      if (i < symbols.length - 1) await sleep(1200); // rate limit koru
    }
    return results;
  }
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── CACHE KATMANI ───────────────────────────────────────────────
const CACHE = {
  _store: {},
  set(key, val, ttlMs = 60000) {
    this._store[key] = { val, exp: Date.now() + ttlMs };
  },
  get(key) {
    const e = this._store[key];
    if (!e) return null;
    if (Date.now() > e.exp) { delete this._store[key]; return null; }
    return e.val;
  }
};
