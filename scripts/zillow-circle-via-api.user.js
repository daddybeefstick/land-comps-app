// ==UserScript==
// @name         Zillow Circle Search (API)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Create Zillow search by center + radius using SaveCustomRegion API so Zillow draws the circle
// @match        *://www.zillow.com/*
// @match        *://www.zillow.com/homes/recently_sold*
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx8_E1B0Lr1yNNpvrRsrinmrjCTqckelwMUizjtTPW8xcPTRURrXmFN4PfiEam5CefW6A/exec';

  const EARTH_RADIUS_MILES = 3958.8;
  const SQFT_PER_ACRE = 43560;
  const LOT_PRESETS = [
    { label: '3–20 acres', min: 3 * SQFT_PER_ACRE, max: 20 * SQFT_PER_ACRE },
    { label: '3–7 acres', min: 3 * SQFT_PER_ACRE, max: 7 * SQFT_PER_ACRE },
    { label: '8–15 acres', min: 8 * SQFT_PER_ACRE, max: 15 * SQFT_PER_ACRE },
  ];
  const STORAGE_KEY = 'zillow-circle-api-panel';
  const HIDDEN_KEY = 'zillow-hidden-zpids';

  function getHidden() {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); }
  }
  function saveHidden(set) {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch (_) {}
  }
  function hideCard(card, zpid) {
    card.style.display = 'none';
    if (zpid) {
      const h = getHidden();
      h.add(zpid);
      saveHidden(h);
    }
  }
  function applyHidden() {
    const hidden = getHidden();
    document.querySelectorAll('article[data-zpid], [data-test="property-card"]').forEach((card) => {
      const zpid = card.dataset.zpid;
      if (zpid && hidden.has(zpid)) card.style.display = 'none';
      else if (!card.querySelector('.zillow-hide-btn')) addHideButton(card);
    });
  }
  function addHideButton(card) {
    const btn = document.createElement('button');
    btn.className = 'zillow-hide-btn';
    btn.textContent = '\u2715';
    btn.title = 'Hide this listing';
    btn.style.cssText = `
      position: absolute; top: 6px; left: 6px;
      z-index: 9999;
      background: rgba(0,0,0,0.55);
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 22px; height: 22px;
      font-size: 12px;
      cursor: pointer;
      line-height: 22px;
      padding: 0;
    `;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideCard(card, card.dataset.zpid);
    });
    const pos = window.getComputedStyle(card).position;
    if (!pos || pos === 'static') card.style.position = 'relative';
    card.appendChild(btn);
  }

  function scrapeListings() {
    const cards = document.querySelectorAll('article[data-zpid], [data-test="property-card"]');
    const rows = [];
    const seen = new Set();
    cards.forEach((card) => {
      const isHidden = card.style.display === 'none';
      // Try data-zpid first, then extract from homedetails URL
      let zpid = card.dataset.zpid || '';
      const linkEl = card.querySelector('a[href*="/homedetails/"], a[href*="zpid="]');
      if (!zpid && linkEl) {
        const m = linkEl.href.match(/\/(\d+)_zpid/);
        if (m) zpid = m[1];
      }
      if (!zpid) return; // skip sponsored/promoted cards with no zpid anywhere
      if (seen.has(zpid)) return;
      seen.add(zpid);
      const addressEl = card.querySelector('address') || card.querySelector('[data-test="property-card-link"]');
      const address = addressEl ? addressEl.textContent.trim() : '';
      const priceEl = card.querySelector('[data-test="property-card-price"]');
      const price = priceEl ? priceEl.textContent.trim() : '';
      const detailEls = card.querySelectorAll('[data-test="property-card-details"] li');
      const details = Array.from(detailEls).map((li) => li.textContent.trim()).join(' | ');
      const url = linkEl
        ? linkEl.href.startsWith('http') ? linkEl.href : 'https://www.zillow.com' + linkEl.href
        : '';
      const statusEl = card.querySelector('[data-test="property-card-status"]');
      const status = statusEl ? statusEl.textContent.trim() : '';
      // Hidden listings: still counted, but price excluded from avg/median
      if (address || price) rows.push({ zpid, address, price, details, status, url, excludePrice: isHidden });
    });
    return rows;
  }

  function sendToSheets(rows, meta, session, type, statusEl, btn) {
    if (!SHEETS_WEBHOOK_URL) {
      statusEl.textContent = 'SHEETS_WEBHOOK_URL not set.';
      return;
    }
    statusEl.textContent = `Sending ${rows.length} listings\u2026`;
    btn.disabled = true;
    const timer = setTimeout(() => {
      btn.disabled = false;
      statusEl.textContent = 'Timed out \u2013 Apps Script may still be running. Check the sheet.';
    }, 30000);
    GM_xmlhttpRequest({
      method: 'POST',
      url: SHEETS_WEBHOOK_URL,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ session, type, rows, meta }),
      onload(res) {
        clearTimeout(timer);
        btn.disabled = false;
        try {
          const body = JSON.parse(res.responseText);
          if (body.ok) {
            statusEl.textContent = `\u2713 ${rows.length} rows \u2192 "${type}" (row ${body.row})`;
            if (meta.soldAllWarning) statusEl.textContent += " (won't write to Sheets columns)";
          } else {
            statusEl.textContent = `Script error: ${body.error}`;
          }
        } catch (_) {
          statusEl.textContent = res.status >= 200 && res.status < 300
            ? `\u2713 ${rows.length} rows sent`
            : `HTTP ${res.status}: ${res.responseText.slice(0, 120)}`;
        }
      },
      onerror(err) {
        clearTimeout(timer);
        btn.disabled = false;
        statusEl.textContent = 'Network error \u2013 ' + (err.statusText || 'check Apps Script URL');
      },
    });
  }

  function getSavedPanelState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function savePanelState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function circlePolygon(lat, lng, radiusMiles, numPoints = 24) {
    const points = [];
    const dLat = (radiusMiles / EARTH_RADIUS_MILES) * (180 / Math.PI);
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);
    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      points.push([
        Math.round((lat + dLat * Math.sin(angle)) * 1e15) / 1e15,
        Math.round((lng + dLng * Math.cos(angle)) * 1e15) / 1e15,
      ]);
    }
    points.push(points[0]);
    return points.map((p) => `${p[0]},${p[1]}`).join('|');
  }

  async function saveCustomRegion(polygonStr) {
    const payload = {
      operationName: 'SaveCustomRegion',
      variables: {
        customRegionToSave: {
          convertToWkt: true,
          polygon: polygonStr,
        },
      },
      query:
        'mutation SaveCustomRegion($customRegionToSave: SaveCustomRegionInput!) { saveCustomRegion(customRegionToSave: $customRegionToSave) { polygon customRegionId } }',
    };
    const res = await fetch('https://www.zillow.com/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`GraphQL ${res.status}`);
    const data = await res.json();
    const id = data?.data?.saveCustomRegion?.customRegionId;
    if (!id) throw new Error(data?.errors?.[0]?.message || 'No customRegionId');
    return id;
  }

  function buildMapBounds(lat, lng, radiusMiles) {
    const dLat = (radiusMiles / EARTH_RADIUS_MILES) * (180 / Math.PI);
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);
    return {
      north: lat + dLat,
      south: lat - dLat,
      east: lng + dLng,
      west: lng - dLng,
    };
  }

  function buildSearchQueryState(customRegionId, mapBounds, opts) {
    const {
      zoom = 12,
      priceMin = 0,
      priceMax = 9999999,
      lotMin = 87120,
      lotMax = 871200,
      sort = 'globalrelevanceex',
      doz = '12m',
      saleType = 'for_sale',
    } = opts || {};
    const isRecentlySold = saleType === 'recently_sold';
    const filterState = {
      sf: { value: false },
      tow: { value: false },
      mf: { value: false },
      con: { value: false },
      manu: { value: false },
      apa: { value: false },
      apco: { value: false },
      price: { min: priceMin, max: priceMax },
      lot: { min: lotMin, max: lotMax },
      sort: { value: sort },
    };
    if (isRecentlySold) {
      filterState.rs = { value: true };
      filterState.fsba = { value: false };
      filterState.fsbo = { value: false };
      filterState.nc = { value: false };
      filterState.cmsn = { value: false };
      filterState.auc = { value: false };
      filterState.fore = { value: false };
    } else {
      filterState.land = { value: true };
    }
    if (doz) filterState.doz = { value: doz };
    return {
      isMapVisible: true,
      mapBounds,
      mapZoom: zoom,
      filterState,
      isListVisible: true,
      customRegionId,
    };
  }

  async function zillowCircleUrl(lat, lng, radiusMiles, opts = {}) {
    const polygon = circlePolygon(lat, lng, radiusMiles);
    const customRegionId = await saveCustomRegion(polygon);
    const mapBounds = buildMapBounds(lat, lng, radiusMiles);
    const saleType = opts.saleType || 'for_sale';
    const path = saleType === 'for_sale' ? '/homes/for_sale/' : `/homes/${saleType}/`;
    const state = buildSearchQueryState(customRegionId, mapBounds, opts);
    const encoded = encodeURIComponent(JSON.stringify(state));
    return `https://www.zillow.com${path}?searchQueryState=${encoded}`;
  }

  function buildPanel() {
    const wrap = document.createElement('div');
    wrap.id = 'zillow-circle-api-wrap';
    const savedPos = (() => { try { return JSON.parse(localStorage.getItem('zillow-panel-pos')); } catch { return null; } })();
    wrap.style.cssText = `
      position: fixed;
      top: ${savedPos ? savedPos.top + 'px' : '80px'};
      ${savedPos ? 'left: ' + savedPos.left + 'px;' : 'right: 16px;'}
      z-index: 99999;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 12px 14px;
      min-width: 220px;
    `;

    const header = document.createElement('div');
    header.textContent = 'Zillow circle (API)';
    header.style.cssText = 'font-weight: 600; margin-bottom: 10px; cursor: move;';
    wrap.appendChild(header);

    let dragStartX = 0, dragStartY = 0, elStartX = 0, elStartY = 0;
    header.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = wrap.getBoundingClientRect();
      elStartX = rect.left;
      elStartY = rect.top;
      wrap.style.left = elStartX + 'px';
      wrap.style.top = elStartY + 'px';
      wrap.style.right = 'auto';
      const onMove = (e2) => {
        wrap.style.left = elStartX + (e2.clientX - dragStartX) + 'px';
        wrap.style.top = elStartY + (e2.clientY - dragStartY) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        try { localStorage.setItem('zillow-panel-pos', JSON.stringify({ top: parseInt(wrap.style.top), left: parseInt(wrap.style.left) })); } catch (_) {}
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    const row = (label, el) => {
      const r = document.createElement('div');
      r.style.marginBottom = '6px';
      const l = document.createElement('label');
      l.textContent = label;
      l.style.display = 'block';
      l.style.marginBottom = '2px';
      l.style.color = '#555';
      r.appendChild(l);
      r.appendChild(el);
      return r;
    };

    const latInput = document.createElement('input');
    latInput.type = 'number';
    latInput.step = 'any';
    latInput.placeholder = 'e.g. 34.25';
    latInput.style.cssText = 'width: 100%; box-sizing: border-box; padding: 4px 6px;';
    const lngInput = document.createElement('input');
    lngInput.type = 'number';
    lngInput.step = 'any';
    lngInput.placeholder = 'e.g. -82.19';
    lngInput.style.cssText = 'width: 100%; box-sizing: border-box; padding: 4px 6px;';
    const radiusInput = document.createElement('input');
    radiusInput.type = 'number';
    radiusInput.min = '0.5';
    radiusInput.step = '0.5';
    radiusInput.value = '10';
    radiusInput.placeholder = 'miles';
    radiusInput.style.cssText = 'width: 100%; box-sizing: border-box; padding: 4px 6px;';

    wrap.appendChild(row('Center latitude', latInput));
    wrap.appendChild(row('Center longitude', lngInput));
    wrap.appendChild(row('Radius (miles)', radiusInput));

    const priceMinInput = document.createElement('input');
    priceMinInput.type = 'number';
    priceMinInput.value = '0';
    priceMinInput.style.cssText = 'width: 100%; box-sizing: border-box; padding: 4px 6px;';
    const priceMaxInput = document.createElement('input');
    priceMaxInput.type = 'number';
    priceMaxInput.value = '9999999';
    priceMaxInput.style.cssText = 'width: 100%; box-sizing: border-box; padding: 4px 6px;';
    wrap.appendChild(row('Price min', priceMinInput));
    wrap.appendChild(row('Price max', priceMaxInput));

    const lotPresetSelect = document.createElement('select');
    lotPresetSelect.style.cssText = 'width: 100%; padding: 4px 6px;';
    lotPresetSelect.innerHTML = '<option value="">Lot: 2–20 ac (default)</option>' +
      LOT_PRESETS.map((p) => `<option value="${p.min}-${p.max}">${p.label}</option>`).join('');
    wrap.appendChild(row('Lot size', lotPresetSelect));

    const modeSelect = document.createElement('select');
    modeSelect.style.cssText = 'width: 100%; padding: 4px 6px;';
    modeSelect.innerHTML = [
      '<option value="for_sale">For Sale</option>',
      '<option value="sold_90d">Sold (90 days)</option>',
      '<option value="sold_6m">Sold (6 months)</option>',
      '<option value="sold_12m">Sold (12 months)</option>',
      '<option value="sold_all">Sold (All Time)</option>',
    ].join('');
    // Auto-detect listing mode from current URL
    const detectedMode = (() => {
      const path = window.location.pathname;
      if (path.includes('recently_sold')) {
        try {
          const qs = new URLSearchParams(window.location.search);
          const sqsRaw = qs.get('searchQueryState');
          if (sqsRaw) {
            const sqs = JSON.parse(sqsRaw);
            const doz = sqs?.filterState?.doz?.value;
            if (doz === '90') return 'sold_90d';
            if (doz === '6m') return 'sold_6m';
            if (doz === '12m') return 'sold_12m';
          }
        } catch (_) {}
        return 'sold_all';
      }
      return 'for_sale';
    })();
    modeSelect.value = detectedMode;
    modeSelect.addEventListener('change', () => {
      const s = getSavedPanelState() || {};
      s.listingMode = modeSelect.value;
      savePanelState(s);
    });
    wrap.appendChild(row('Listing mode', modeSelect));

    const saved = getSavedPanelState();
    if (saved) {
      if (saved.lat != null && saved.lat !== '') latInput.value = saved.lat;
      if (saved.lng != null && saved.lng !== '') lngInput.value = saved.lng;
      if (saved.radius != null && saved.radius !== '') radiusInput.value = saved.radius;
      if (saved.priceMin != null && saved.priceMin !== '') priceMinInput.value = saved.priceMin;
      if (saved.priceMax != null && saved.priceMax !== '') priceMaxInput.value = saved.priceMax;
      if (saved.lotPreset != null && saved.lotPreset !== '') lotPresetSelect.value = saved.lotPreset;
      // URL auto-detect takes priority over saved listingMode
    }

    const status = document.createElement('div');
    status.style.cssText = 'font-size: 11px; color: #666; margin-top: 6px; min-height: 16px;';
    wrap.appendChild(status);

    const goBtn = document.createElement('button');
    goBtn.textContent = 'Go – create circle & search';
    goBtn.style.cssText = `
      margin-top: 8px;
      width: 100%;
      padding: 8px;
      background: #006aff;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    `;

    goBtn.addEventListener('click', async () => {
      const lat = parseFloat(latInput.value, 10);
      const lng = parseFloat(lngInput.value, 10);
      const radiusMiles = parseFloat(radiusInput.value, 10);
      if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(radiusMiles) || radiusMiles <= 0) {
        status.textContent = 'Enter valid lat, lng, and radius.';
        return;
      }
      // Save immediately so location survives the page navigation
      savePanelState({
        lat: latInput.value, lng: lngInput.value, radius: radiusInput.value,
        priceMin: priceMinInput.value, priceMax: priceMaxInput.value,
        lotPreset: lotPresetSelect.value, listingMode: modeSelect.value,
        session: sessionInput.value, targetRow: targetRowInput.value,
      });
      status.textContent = 'Saving region…';
      goBtn.disabled = true;
      try {
        const lotVal = lotPresetSelect.value;
        let lotMin = 87120;
        let lotMax = 871200;
        if (lotVal) {
          const [min, max] = lotVal.split('-').map(Number);
          lotMin = min;
          lotMax = max;
        }
        const modeVal = modeSelect.value;
        const goSaleType = modeVal === 'for_sale' ? 'for_sale' : 'recently_sold';
        const goDoz = modeVal === 'sold_90d' ? '90' : modeVal === 'sold_6m' ? '6m' : modeVal === 'sold_12m' ? '12m' : '';
        const url = await zillowCircleUrl(lat, lng, radiusMiles, {
          saleType: goSaleType,
          doz: goDoz,
          priceMin: parseInt(priceMinInput.value, 10) || 0,
          priceMax: parseInt(priceMaxInput.value, 10) || 9999999,
          lotMin,
          lotMax,
        });
        status.textContent = 'Opening…';
        window.location.href = url;
      } catch (err) {
        status.textContent = 'Error: ' + (err.message || String(err));
        goBtn.disabled = false;
      }
    });

    wrap.appendChild(goBtn);
    wrap.appendChild(status);

    const divider = document.createElement('div');
    divider.style.cssText = 'border-top: 1px solid #eee; margin: 10px 0 8px;';
    wrap.appendChild(divider);

    const sessionInput = document.createElement('input');
    sessionInput.type = 'text';
    sessionInput.autocomplete = 'off';
    sessionInput.placeholder = 'Session label (shared across sends)';
    sessionInput.style.cssText = 'width: 100%; box-sizing: border-box; padding: 4px 6px;';
    const defaultSession = new Date().toISOString().slice(0, 10) + ' | ' + latInput.value + ',' + lngInput.value + ' r=' + radiusInput.value + 'mi';
    sessionInput.value = saved && saved.session ? saved.session : defaultSession;
    sessionInput.addEventListener('input', () => {
      const s = getSavedPanelState() || {};
      s.session = sessionInput.value;
      savePanelState(s);
    });
    wrap.appendChild(row('Session label', sessionInput));

    const targetRowLabel = document.createElement('div');
    targetRowLabel.style.cssText = 'font-weight: 700; margin-bottom: 4px; font-size: 12px;';
    const updateRowLabel = () => {
      const v = targetRowInput.value;
      targetRowLabel.textContent = v ? `Sending to row ${v}` : 'Sending to row: auto';
    };
    const targetRowInput = document.createElement('input');
    targetRowInput.type = 'number';
    targetRowInput.min = '1';
    targetRowInput.max = '200';
    targetRowInput.step = '1';
    targetRowInput.placeholder = 'auto';
    targetRowInput.style.cssText = 'flex: 1; min-width: 0; box-sizing: border-box; padding: 4px 6px; text-align: center;';
    if (saved && saved.targetRow) targetRowInput.value = saved.targetRow;
    const persistRow = () => {
      const s = getSavedPanelState() || {};
      s.targetRow = targetRowInput.value;
      savePanelState(s);
      updateRowLabel();
    };
    targetRowInput.addEventListener('input', persistRow);
    const rowMinusBtn = document.createElement('button');
    rowMinusBtn.type = 'button';
    rowMinusBtn.textContent = '\u2212';
    rowMinusBtn.style.cssText = 'width: 28px; height: 28px; padding: 0; font-size: 16px; cursor: pointer; flex-shrink: 0;';
    rowMinusBtn.addEventListener('click', () => {
      const cur = parseInt(targetRowInput.value, 10);
      targetRowInput.value = Math.max(1, (isNaN(cur) ? 2 : cur) - 1);
      persistRow();
    });
    const rowPlusBtn = document.createElement('button');
    rowPlusBtn.type = 'button';
    rowPlusBtn.textContent = '+';
    rowPlusBtn.style.cssText = 'width: 28px; height: 28px; padding: 0; font-size: 16px; cursor: pointer; flex-shrink: 0;';
    rowPlusBtn.addEventListener('click', () => {
      const cur = parseInt(targetRowInput.value, 10);
      targetRowInput.value = Math.min(200, (isNaN(cur) ? 0 : cur) + 1);
      persistRow();
    });
    const rowControlFlex = document.createElement('div');
    rowControlFlex.style.cssText = 'display: flex; align-items: center; gap: 4px;';
    rowControlFlex.appendChild(rowMinusBtn);
    rowControlFlex.appendChild(targetRowInput);
    rowControlFlex.appendChild(rowPlusBtn);
    const rowControlWrap = document.createElement('div');
    rowControlWrap.style.marginBottom = '6px';
    rowControlWrap.appendChild(targetRowLabel);
    rowControlWrap.appendChild(rowControlFlex);
    updateRowLabel();
    wrap.appendChild(rowControlWrap);

    const sheetsBtn = document.createElement('button');
    sheetsBtn.textContent = 'Send to Google Sheets';
    sheetsBtn.style.cssText = `
      margin-top: 8px;
      width: 100%;
      padding: 8px;
      background: #0f9d58;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    `;
    const sheetsStatus = document.createElement('div');
    sheetsStatus.style.cssText = 'font-size: 10px; color: #555; margin-top: 4px; min-height: 14px; word-break: break-word;';
    sheetsBtn.addEventListener('click', () => {
      const rows = scrapeListings();
      if (!rows.length) { sheetsStatus.textContent = 'No listings found on this page.'; return; }
      const type = modeSelect.value;
      const session = sessionInput.value.trim() || new Date().toISOString().slice(0, 10);
      const lotLabel = LOT_PRESETS.find(p => `${p.min}-${p.max}` === lotPresetSelect.value)?.label || 'All sizes';
      const meta = { lat: latInput.value, lng: lngInput.value, radius: radiusInput.value, lotLabel };
      if (type === 'sold_all') meta.soldAllWarning = true;
      if (targetRowInput.value) meta.targetRow = parseInt(targetRowInput.value, 10);
      sendToSheets(rows, meta, session, type, sheetsStatus, sheetsBtn);
    });
    wrap.appendChild(sheetsBtn);
    wrap.appendChild(sheetsStatus);

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear hidden listings';
    clearBtn.style.cssText = `
      margin-top: 6px;
      width: 100%;
      padding: 6px;
      background: #888;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
    `;
    clearBtn.addEventListener('click', () => {
      saveHidden(new Set());
      document.querySelectorAll('article[data-zpid], [data-test="property-card"]').forEach((c) => {
        c.style.display = '';
      });
    });
    wrap.appendChild(clearBtn);

    return wrap;
  }

  function init() {
    if (document.getElementById('zillow-circle-api-wrap')) return;
    document.body.appendChild(buildPanel());
    applyHidden();
    new MutationObserver(applyHidden).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
