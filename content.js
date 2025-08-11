(() => {
  // ========= Utilities =========
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  if (window.__X_RAFFLE_PANEL__) return;
  window.__X_RAFFLE_PANEL__ = true;

  // ========= Scope detection =========
  const PRIMARY = document.querySelector('[data-testid="primaryColumn"]')
               || document.querySelector('main')
               || document.body;

  const RETWEETS_SCOPE = (() => {
    const candidates = [
      '[aria-label*="Retweets"]',
      '[aria-label*="리포스트"]',
      '[aria-label*="재게시"]',
      '[role="region"] [data-testid="primaryColumn"]',
      '[data-testid="primaryColumn"] [role="region"]',
      '[data-testid="primaryColumn"] [data-testid="cellInnerDiv"]',
      '[data-testid="primaryColumn"]',
      'main [role="region"]',
      'main'
    ];
    for (const sel of candidates) {
      const el = PRIMARY.querySelector(sel);
      if (el) return el;
    }
    return PRIMARY;
  })();

  function isInExcludedArea(el) {
    return !!el.closest(
      [
        '[data-testid="sidebarColumn"]',
        'aside',
        '[aria-label*="Who to follow"]',
        '[aria-label*="팔로우 추천"]',
        '[aria-label*="팔로우"]',
        '[data-testid="InlineFollow"]',
      ].join(',')
    );
  }

  function getScrollTarget() {
    const el = RETWEETS_SCOPE;
    if (!el) return window;
    const canScroll = (n) =>
      n && (n.scrollHeight > n.clientHeight + 20 || getComputedStyle(n).overflowY === 'auto');
    let p = el;
    while (p && p !== document.documentElement) {
      if (canScroll(p)) return p;
      p = p.parentElement;
    }
    return window;
  }
  const SCROLLER = getScrollTarget();

  // ========= Shadow Panel =========
  const host = document.createElement('div');
  Object.assign(host.style, {
    all: 'unset', position: 'fixed', top: '12px', right: '12px',
    zIndex: 2147483647, width: '380px', pointerEvents: 'auto'
  });
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({mode: 'open'});

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    .card { background: rgba(17,24,39,.96); color:#e5e7eb; border:1px solid #1f2937; border-radius:14px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
    .row { display:flex; gap:8px; align-items:center; }
    .col { display:flex; flex-direction:column; gap:10px; }
    .btn { background:#374151; color:#e5e7eb; border:1px solid #4b5563; border-radius:10px; padding:8px 10px; cursor:pointer; }
    .btn.primary { background:#2563eb; border-color:#1d4ed8; }
    .btn.danger  { background:#7f1d1d; border-color:#991b1b; }
    .btn:disabled { opacity:.6; cursor:default; }
    .pill { font-size:12px; padding:3px 8px; border-radius:999px; border:1px solid #374151; background:#111827; }
    input, select { background:#111827; color:#e5e7eb; border:1px solid #374151; border-radius:10px; padding:8px 10px; width:100%; }
    h3 { margin:0; font-size:16px; font-weight:700; }
    small { color:#9ca3af; }
    .monospace { font-family: ui-monospace, Menlo, Consolas, monospace; }
    .list { max-height: 320px; overflow:auto; border:1px solid #1f2937; border-radius:10px; padding:6px; background:#0b1220; }
    .user { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; padding:8px; border-radius:8px; }
    .user:nth-child(odd) { background:#0f172a; }
    .tag { font-size:11px; padding:2px 6px; border-radius:999px; background:#374151; color:#c7d2fe; }
    a.clean { color:#93c5fd; text-decoration:none; }

    /* Overlay pulse animation (document에 붙는 요소지만 여기서 keyframes 정의) */
    @keyframes xraffle-pulse {
      0%   { opacity: 0;   box-shadow: 0 0 0 0 rgba(255, 230, 0, .9); }
      50%  { opacity: 1;   box-shadow: 0 0 20px 6px rgba(255, 230, 0, .9); }
      100% { opacity: 0;   box-shadow: 0 0 0 0 rgba(255, 230, 0, .0); }
    }
  `;

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `
    <div style="padding:12px" class="col">
      <div class="row" style="justify-content:space-between">
        <h3>X Reposts Raffle</h3>
        <button id="close" class="btn danger" title="Close">×</button>
      </div>

      <div class="col">
        <div class="row" style="flex-wrap:wrap">
          <button id="start" class="btn primary" title="Auto scroll & collect">Start</button>
          <button id="stop"  class="btn" disabled>Stop</button>
          <button id="clear" class="btn">Clear</button>
          <button id="point" class="btn" title="Highlight collection scope">Point</button>
        </div>
        <div class="row">
          <span class="pill">Found: <b id="count">0</b></span>
          <span class="pill">New/last tick: <b id="delta">0</b></span>
          <span class="pill">Status: <b id="status">idle</b></span>
        </div>
      </div>

      <div class="col">
        <div class="row">
          <select id="sort">
            <option value="handle">정렬: 핸들</option>
            <option value="nickname">정렬: 닉네임</option>
          </select>
          <input id="filter" placeholder="검색(핸들/닉네임/소개)" />
        </div>
        <div class="row">
          <input id="winners" type="number" min="1" value="1" style="width:90px"/>
          <button id="draw" class="btn">추첨</button>
          <button id="copy" class="btn">복사</button>
          <button id="csv" class="btn">CSV</button>
          <button id="json" class="btn">JSON</button>
        </div>
      </div>

      <div id="list" class="list"></div>
      <small>이 확장은 페이지 위에서만 동작하며, 외부 서버로 데이터 전송을 하지 않습니다.</small>
      <small>현재 스코프: <span class="monospace">${RETWEETS_SCOPE === PRIMARY ? 'PRIMARY' : 'RETWEETS_SCOPE'}</span> (사이드바/팔로우 추천은 자동 제외)</small>
      <small>© 2025 JTech CO. X Reposts Raffle Extension. All rights reserved. JTech_CO = Bryan M. = Sekhar</small>
    </div>
  `;
  shadow.append(style, wrap);

  const ui = {
    close: shadow.getElementById('close'),
    start: shadow.getElementById('start'),
    stop : shadow.getElementById('stop'),
    clear: shadow.getElementById('clear'),
    point: shadow.getElementById('point'),
    count: shadow.getElementById('count'),
    delta: shadow.getElementById('delta'),
    status: shadow.getElementById('status'),
    sort : shadow.getElementById('sort'),
    filter: shadow.getElementById('filter'),
    winners: shadow.getElementById('winners'),
    draw: shadow.getElementById('draw'),
    copy: shadow.getElementById('copy'),
    csv : shadow.getElementById('csv'),
    json: shadow.getElementById('json'),
    list: shadow.getElementById('list'),
  };

  // ========= State =========
  let running = false;
  let users = [];
  let seen = new Set();
  let lastCount = 0;
  let stableTicks = 0;
  const MAX_STABLE = 3;
  const PAUSE = 700;
  const MAX_TICKS = 200;

  // ========= Rendering & helpers =========
  function esc(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  function renderList() {
    const q = (ui.filter.value || '').trim().toLowerCase();
    const sorted = [...users];
    if (ui.sort.value === 'handle') sorted.sort((a,b)=>a.handle.localeCompare(b.handle));
    else sorted.sort((a,b)=>(a.nickname||'').localeCompare(b.nickname||''));

    const filtered = q
      ? sorted.filter(u =>
          (u.handle||'').toLowerCase().includes(q) ||
          (u.nickname||'').toLowerCase().includes(q) ||
          (u.description||'').toLowerCase().includes(q))
      : sorted;

    ui.list.innerHTML = filtered.map(u => `
      <div class="user">
        <div>
          <div><b>${esc(u.nickname || '(no name)')}</b> <span class="tag">@${esc(u.handle)}</span></div>
          <div style="font-size:12px; color:#cbd5e1; white-space:pre-wrap">${esc(u.description||'')}</div>
        </div>
        <a class="clean" href="https://x.com/${encodeURIComponent(u.handle)}" target="_blank">Open</a>
      </div>
    `).join('');

    ui.count.textContent = users.length;
  }

  function parseCells() {
    const cells = $$('[data-testid="UserCell"]', RETWEETS_SCOPE);
    let added = 0;

    for (const c of cells) {
      if (isInExcludedArea(c)) continue;

      try {
        let handle = "";
        const links = $$('a[href^="/"], a[href^="https://x.com/"]', c);
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          if (/^https?:\/\/x\.com\//.test(href)) {
            const seg = href.split('x.com/')[1].split('?')[0];
            if (seg && !seg.startsWith('i/') && !seg.includes('/status/')) { handle = seg.replace(/\/+$/,''); break; }
          } else if (href.startsWith('/')) {
            const seg = href.slice(1).split('?')[0];
            if (seg && !seg.startsWith('i/') && !seg.includes('/status/')) { handle = seg.replace(/\/+$/,''); break; }
          }
        }
        if (!handle) continue;

        let nickname = '';
        const nameEl = c.querySelector('div[dir="ltr"] span');
        if (nameEl) nickname = nameEl.textContent.trim();
        else nickname = (c.textContent||'').split('\n')[0].trim();

        let description = '';
        const descEl = c.querySelector('div[dir="auto"][lang]');
        if (descEl) description = descEl.textContent.trim();

        if (!seen.has(handle)) {
          users.push({ handle, nickname, description, followStatus: '팔로우' });
          seen.add(handle);
          added++;
        }
      } catch (e) {}
    }
    return added;
  }

  async function autoScrollCollect() {
    running = true; stableTicks = 0; lastCount = users.length;
    ui.status.textContent = 'running'; ui.start.disabled = true; ui.stop.disabled = false;

    for (let tick=0; running && tick<MAX_TICKS; tick++) {
      const added = parseCells();
      ui.delta.textContent = String(added);
      renderList();

      if (users.length === lastCount) {
        stableTicks++;
        if (stableTicks >= MAX_STABLE) break;
      } else {
        lastCount = users.length; stableTicks = 0;
      }

      if (SCROLLER === window) {
        window.scrollBy(0, Math.max(400, window.innerHeight * 0.9));
      } else {
        SCROLLER.scrollTop += Math.max(400, (SCROLLER.clientHeight || window.innerHeight) * 0.9);
      }
      await sleep(PAUSE);
    }

    ui.status.textContent = 'stopped';
    ui.start.disabled = false; ui.stop.disabled = true;
    running = false;
  }

  function stop() { running = false; }

  function clearAll() {
    users = []; seen = new Set(); renderList();
    ui.delta.textContent = '0'; ui.status.textContent = 'idle';
  }

  function drawWinners() {
    const n = Math.max(1, Math.min(parseInt(ui.winners.value||'1',10), users.length || 1));
    const pool = [...users];
    const picked = new Set();
    while (picked.size < n && pool.length) picked.add(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
    const res = Array.from(picked);
    alert(`당첨자 (${n}명)\n` + res.map(u => `${u.nickname} (@${u.handle})`).join('\n'));
  }

  function toCSV(rows) {
    const header = ['handle','nickname','description'];
    const escCSV = (s='') => `"${String(s).replace(/"/g,'""')}"`;
    return [header.join(','), ...rows.map(r => [r.handle, r.nickname, r.description].map(escCSV).join(','))].join('\n');
  }
  function copyText(txt) {
    navigator.clipboard.writeText(txt).then(()=> {
      ui.status.textContent = 'copied';
      setTimeout(()=> ui.status.textContent = 'idle', 1200);
    });
  }

  // ========= NEW: Scope Pulse Overlay =========
  function pulseScope(durationMs = 500) {
    if (!RETWEETS_SCOPE || !document.body) return;
    const rect = RETWEETS_SCOPE.getBoundingClientRect();
    // 화면 밖이면 스크롤로 대충 맞춰주기(선택)
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      RETWEETS_SCOPE.scrollIntoView({behavior: 'instant', block: 'center'});
    }
    const r = RETWEETS_SCOPE.getBoundingClientRect();

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      left: `${Math.max(0, r.left)}px`,
      top: `${Math.max(0, r.top)}px`,
      width: `${Math.max(0, Math.min(window.innerWidth - r.left, r.width))}px`,
      height:`${Math.max(0, Math.min(window.innerHeight - r.top, r.height))}px`,
      border: '3px solid #FFE600',
      borderRadius: '8px',
      background: 'rgba(255,230,0,0.12)',
      pointerEvents: 'none',
      zIndex: 2147483646,
      animation: `xraffle-pulse ${durationMs}ms ease-in-out 1`
    });
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), durationMs);
  }

  // ========= Wire UI =========
  ui.start.onclick = autoScrollCollect;
  ui.stop.onclick  = stop;
  ui.clear.onclick = clearAll;
  ui.point.onclick = () => pulseScope(500); // Point 버튼: 0.5초 펄스
  ui.sort.onchange = renderList;
  ui.filter.oninput = renderList;
  ui.draw.onclick   = drawWinners;
  ui.copy.onclick   = () => copyText(users.map(u=>`${u.nickname} (@${u.handle})`).join('\n'));
  ui.csv.onclick    = () => copyText(toCSV(users));
  ui.json.onclick   = () => copyText(JSON.stringify({count: users.length, users}, null, 2));
  ui.close.onclick  = () => { host.remove(); window.__X_RAFFLE_PANEL__ = false; };

  // 초기 화면에 이미 보이는 셀도 반영
  parseCells(); renderList();
})();
