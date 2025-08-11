(() => {
  // ===== Utility =====
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // ===== Guard: only once per tab =====
  if (window.__X_RAFFLE_PANEL__) return;
  window.__X_RAFFLE_PANEL__ = true;

  // ===== Shadow Panel Mount =====
  const host = document.createElement('div');
  host.style.all = 'unset';
  host.style.position = 'fixed';
  host.style.top = '12px';
  host.style.right = '12px';
  host.style.zIndex = '2147483647';
  host.style.width = '360px';
  host.style.pointerEvents = 'auto';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({mode: 'open'});

  // ===== Styles =====
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    .card { background: rgba(17,24,39,.96); color:#e5e7eb; border:1px solid #1f2937; border-radius:14px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
    .row { display:flex; gap:8px; align-items:center; }
    .col { display:flex; flex-direction:column; gap:10px; }
    .btn { background:#374151; color:#e5e7eb; border:1px solid #4b5563; border-radius:10px; padding:8px 10px; cursor:pointer; }
    .btn.primary { background:#2563eb; border-color:#1d4ed8; }
    .btn.danger { background:#7f1d1d; border-color:#991b1b; }
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
  `;

  // ===== Panel UI =====
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `
    <div style="padding:12px" class="col">
      <div class="row" style="justify-content:space-between">
        <h3>X Reposts Raffle</h3>
        <button id="close" class="btn danger">×</button>
      </div>

      <div class="col">
        <div class="row">
          <button id="start" class="btn primary" title="Auto scroll & collect">Start</button>
          <button id="stop"  class="btn" disabled>Stop</button>
          <button id="clear" class="btn">Clear</button>
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
      <small>이 패널은 페이지 위에만 뜨는 클라이언트 확장 프로그램으로, 외부 서버로 데이터를 전송하지 않습니다.</small>
      <small>이 페이지는 <span class="monospace">/status/.../retweets</span> 이어야 합니다. 아닌 경우 해당 링크로 이동하세요.</small>
      <small>X Reposts Raffle 확장 프로그램의 제작자는 JTech_CO / Bryan M. / Sekhar (모두 동일 인물)입니다.</small>
    </div>
  `;
  shadow.append(style, wrap);

  const ui = {
    close: shadow.getElementById('close'),
    start: shadow.getElementById('start'),
    stop: shadow.getElementById('stop'),
    clear: shadow.getElementById('clear'),
    count: shadow.getElementById('count'),
    delta: shadow.getElementById('delta'),
    status: shadow.getElementById('status'),
    sort: shadow.getElementById('sort'),
    filter: shadow.getElementById('filter'),
    winners: shadow.getElementById('winners'),
    draw: shadow.getElementById('draw'),
    copy: shadow.getElementById('copy'),
    csv: shadow.getElementById('csv'),
    json: shadow.getElementById('json'),
    list: shadow.getElementById('list'),
  };

  // ===== State =====
  let running = false;
  let users = [];              // raw unique
  let seen = new Set();        // set of handles
  let lastCount = 0;           // for delta & stop condition
  let stableTicks = 0;         // stop after N ticks with no new users
  const MAX_STABLE = 3;
  const PAUSE = 700;           // ms between scrolls
  const MAX_TICKS = 200;       // hard cap

  // ===== Helpers =====
  function renderList() {
    const q = (ui.filter.value || '').trim().toLowerCase();
    const sorted = [...users];
    if (ui.sort.value === 'handle') sorted.sort((a,b)=>a.handle.localeCompare(b.handle));
    else sorted.sort((a,b)=> (a.nickname||'').localeCompare(b.nickname||''));

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
  function esc(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  function parseCells() {
    const cells = $$('[data-testid="UserCell"]', document);
    let added = 0;
    for (const c of cells) {
      try {
        // handle from profile link
        let handle = "";
        const links = $$('a[href^="/"]', c);
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          // profile link only (skip /status, /i, /hashtag ...)
          if (/^https?:\/\/x\.com\//.test(href)) {
            // absolute URL case
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
        if (stableTicks >= MAX_STABLE) break; // no more new entries
      } else {
        lastCount = users.length; stableTicks = 0;
      }

      // scroll
      window.scrollBy(0, Math.max(400, window.innerHeight * 0.9));
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
    while (picked.size < n && pool.length) {
      picked.add(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
    }
    const res = Array.from(picked);
    alert(`당첨자 (${n}명)\n` + res.map(u => `${u.nickname} (@${u.handle})`).join('\n'));
  }

  function toCSV(rows) {
    const header = ['handle','nickname','description'];
    const escapeCSV = (s='') => `"${String(s).replace(/"/g,'""')}"`;
    return [header.join(','), ...rows.map(r => [r.handle, r.nickname, r.description].map(escapeCSV).join(','))].join('\n');
  }

  function copyText(txt) {
    navigator.clipboard.writeText(txt).then(()=> {
      ui.status.textContent = 'copied';
      setTimeout(()=> ui.status.textContent = 'idle', 1200);
    });
  }

  // ===== Wire UI =====
  ui.start.onclick = autoScrollCollect;
  ui.stop.onclick = stop;
  ui.clear.onclick = clearAll;
  ui.sort.onchange = renderList;
  ui.filter.oninput = renderList;
  ui.draw.onclick = drawWinners;
  ui.copy.onclick = () => copyText(users.map(u=>`${u.nickname} (@${u.handle})`).join('\n'));
  ui.csv.onclick = () => copyText(toCSV(users));
  ui.json.onclick = () => copyText(JSON.stringify({count: users.length, users}, null, 2));
  ui.close.onclick = () => { host.remove(); window.__X_RAFFLE_PANEL__ = false; };

  // ===== Initial parse (if items already in view) =====
  parseCells(); renderList();
})();

