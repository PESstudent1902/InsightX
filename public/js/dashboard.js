'use strict';
/* ═══════════════════════════════════════════════════════════════
   FLIGHT 404 — DASHBOARD.JS
   Handles: layer polling, countdowns, modals, SQL console, toasts
   ═══════════════════════════════════════════════════════════════ */

let layers       = [];
let startTime    = null;
let activeTab    = 'table';
let activeLayerId= null;
let tableCache   = {};    // layerId → {data, columns}
let prevUnlocked = new Set();

// ── TOAST ────────────────────────────────────────────────────
function toast(msg, type='', duration=4000){
  const box = document.getElementById('toasts');
  const t   = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(()=>{ t.classList.add('dying'); setTimeout(()=>t.remove(), 500); }, duration);
}

// ── UNLOCK FLASH ──────────────────────────────────────────────
function doFlash(){
  const el = document.getElementById('unlock-flash');
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
  setTimeout(()=> el.classList.remove('go'), 650);
}

// ── FORMAT TIME ───────────────────────────────────────────────
function fmtHMS(secs){
  if(secs<=0) return '00:00:00';
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = Math.floor(secs%60);
  return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':');
}

// ── NAV TIMER ────────────────────────────────────────────────
function tickNavTimer(){
  if(!startTime) return;
  const elapsed = Math.floor((Date.now()-startTime)/1000);
  document.getElementById('nav-timer').textContent = fmtHMS(elapsed);
}
setInterval(tickNavTimer, 1000);

// ── BUILD LAYER CARD ─────────────────────────────────────────
function buildCard(layer, wasUnlocked){
  const card = document.createElement('div');
  card.className = `layer-card ${layer.unlocked?'unlocked':'locked'} scanlines`;
  card.id = `card-${layer.id}`;
  if(layer.unlocked && !wasUnlocked) card.classList.add('just-unlocked');

  // Corner ribbon
  card.innerHTML = `
    <div class="card-corner"></div>
    <div class="card-layer-lbl">LAYER ${layer.id.toUpperCase()}</div>
    <div class="card-bg-num">${layer.id.toUpperCase()}</div>
    <div class="card-icon">${layer.icon}</div>
    <div class="card-name">${layer.name}</div>
    <div class="card-desc">${layer.desc}</div>
    <div class="card-stamp">${layer.unlocked?'DECLASSIFIED':'CLASSIFIED'}</div>
  `;

  if(layer.unlocked){
    const btn = document.createElement('button');
    btn.className = 'card-btn';
    btn.textContent = '▶  VIEW EVIDENCE';
    btn.onclick = ()=> openModal(layer.id);
    card.appendChild(btn);
  } else {
    const cdLbl = document.createElement('div');
    cdLbl.className = 'card-countdown-lbl';
    cdLbl.textContent = 'UNLOCKS IN';
    const cd = document.createElement('div');
    cd.className  = 'card-countdown';
    cd.id = `cd-${layer.id}`;
    cd.textContent = fmtHMS(layer.unlocksIn||0);
    card.appendChild(cdLbl);
    card.appendChild(cd);
  }

  return card;
}

// ── RENDER / REFRESH CARDS ────────────────────────────────────
function renderCards(){
  const grid = document.getElementById('layers-grid');
  layers.forEach(layer=>{
    const existing = document.getElementById(`card-${layer.id}`);
    const wasUnlocked = prevUnlocked.has(layer.id);

    if(!existing){
      grid.appendChild(buildCard(layer, false));
    } else {
      // check if state changed → unlocked just now
      if(layer.unlocked && !wasUnlocked){
        existing.replaceWith(buildCard(layer, true));
        doFlash();
        toast(`🔓 LAYER ${layer.id.toUpperCase()} — ${layer.name} — DECLASSIFIED`, 'ok', 6000);
      }
    }
  });

  // update locked card countdowns
  layers.filter(l=>!l.unlocked).forEach(l=>{
    const cdEl = document.getElementById(`cd-${l.id}`);
    if(cdEl) cdEl.textContent = fmtHMS(l.unlocksIn||0);
  });

  // nav unlock count
  const unlockedCount = layers.filter(l=>l.unlocked).length;
  document.getElementById('unlock-count').textContent = `${unlockedCount}/${layers.length} UNLOCKED`;

  // progress bar (max 3 hours = 180 mins)
  if(startTime){
    const elMins = (Date.now()-startTime)/60000;
    const pct    = Math.min(100, (elMins/180)*100);
    document.getElementById('prog-fill').style.width = pct+'%';
  }

  // next layer countdown
  const nextLocked = layers.filter(l=>!l.unlocked).sort((a,b)=>(a.unlocksIn||0)-(b.unlocksIn||0))[0];
  document.getElementById('next-unlock').textContent = nextLocked ? fmtHMS(nextLocked.unlocksIn||0) : 'ALL UNLOCKED';
}

// ── POLL SERVER ───────────────────────────────────────────────
async function pollLayers(){
  try{
    const r = await fetch('/api/layers');
    const d = await r.json();
    startTime = d.startTime;
    const newLayers = d.layers||[];

    // detect newly unlocked
    newLayers.forEach(l=>{
      if(l.unlocked) prevUnlocked.add(l.id);
    });

    layers = newLayers;
    renderCards();
  } catch(e){
    document.getElementById('nav-live').textContent = 'OFFLINE';
    document.getElementById('nav-live').style.color='var(--red)';
  }
}

// ── COUNTDOWN TICK (client-side, per second) ──────────────────
function tickCountdowns(){
  layers.filter(l=>!l.unlocked).forEach(l=>{
    if(l.unlocksIn > 0){
      l.unlocksIn--;
      const el = document.getElementById(`cd-${l.id}`);
      if(el) el.textContent = fmtHMS(l.unlocksIn);
      if(l.unlocksIn === 0) pollLayers(); // re-poll immediately on zero
    }
  });
  // next unlock label
  const nextLocked = layers.filter(l=>!l.unlocked).sort((a,b)=>(a.unlocksIn||0)-(b.unlocksIn||0))[0];
  document.getElementById('next-unlock').textContent = nextLocked ? fmtHMS(nextLocked.unlocksIn||0) : 'ALL UNLOCKED';
}

// ═══════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════
async function openModal(layerId){
  activeLayerId = layerId;
  const layer   = layers.find(l=>l.id===layerId);
  if(!layer || !layer.unlocked) return;

  document.getElementById('modal-title').textContent  = `LAYER ${layerId.toUpperCase()} — ${layer.name}`;
  document.getElementById('modal-rowcount').textContent = '';
  document.getElementById('modal-overlay').classList.add('open');
  activeTab = 'table';
  highlightTab('table');

  await loadTableData(layerId);
}

function closeModal(e){
  if(e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('open');
  activeLayerId = null;
}
// ESC key
document.addEventListener('keydown', e=>{ if(e.key==='Escape') document.getElementById('modal-overlay').classList.remove('open'); });

function switchTab(tab){
  activeTab = tab;
  highlightTab(tab);
  if(tab==='table' && activeLayerId) renderTableTab(activeLayerId);
  if(tab==='sql')                    renderSQLTab();
}

function highlightTab(tab){
  ['table','sql'].forEach(t=>{
    document.getElementById(`tab-${t}`).classList.toggle('active', t===tab);
  });
}

// ── TABLE TAB ─────────────────────────────────────────────────
async function loadTableData(layerId){
  if(!tableCache[layerId]){
    try{
      const r = await fetch(`/api/layer/${layerId}/data`);
      const d = await r.json();
      if(d.data && d.data.length){
        const cols = Object.keys(d.data[0]);
        tableCache[layerId] = { data:d.data, cols };
      } else {
        tableCache[layerId] = { data:[], cols:[] };
      }
    } catch(e){
      toast('Failed to load layer data.','err');
      return;
    }
  }
  renderTableTab(layerId);
}

function renderTableTab(layerId){
  const cache = tableCache[layerId];
  if(!cache){ document.getElementById('modal-body').innerHTML='<p class="no-data">Loading…</p>'; return; }

  const {data, cols} = cache;
  document.getElementById('modal-rowcount').textContent = `${data.length} ROWS`;

  let html = `
    <div style="margin-bottom:.8rem;display:flex;align-items:center;gap:1rem;">
      <input class="tbl-filter" type="text" placeholder="🔍 Filter rows…" oninput="filterTable(this.value,'${layerId}')" id="tbl-filter-${layerId}">
      <button class="btn-clr" onclick="exportCSV('${layerId}')">↓ EXPORT CSV</button>
    </div>
    <div class="tbl-wrap">
      <table class="data-tbl" id="tbl-${layerId}">
        <thead><tr>
          ${cols.map(c=>`<th>${c.toUpperCase()}</th>`).join('')}
        </tr></thead>
        <tbody id="tbody-${layerId}">
          ${buildTbody(data, cols)}
        </tbody>
      </table>
    </div>`;

  document.getElementById('modal-body').innerHTML = html;
}

function buildTbody(data, cols){
  return data.map(row=>{
    // flag rows with anomaly_flag=1, flagged=1, authorized=0
    const isFlag = row.anomaly_flag===1 || row.flagged===1 || row.authorized===0;
    const cells = cols.map(c=>`<td title="${String(row[c]||'').replace(/"/g,'&quot;')}">${esc(row[c]) }</td>`).join('');
    return `<tr class="${isFlag?'row-flagged':''}">${cells}</tr>`;
  }).join('');
}

function esc(v){
  if(v===null||v===undefined) return '<em style="color:var(--txt3)">null</em>';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function filterTable(q, layerId){
  const cache = tableCache[layerId];
  if(!cache) return;
  const lq = q.toLowerCase();
  const filtered = cache.data.filter(row=>
    Object.values(row).some(v=> String(v||'').toLowerCase().includes(lq))
  );
  document.getElementById(`tbody-${layerId}`).innerHTML = buildTbody(filtered, cache.cols);
  document.getElementById('modal-rowcount').textContent = `${filtered.length} / ${cache.data.length} ROWS`;
}

function exportCSV(layerId){
  const cache = tableCache[layerId];
  if(!cache||!cache.data.length) return;
  const {data,cols}=cache;
  const rows=[cols.join(','), ...data.map(r=>cols.map(c=>JSON.stringify(r[c]??'')).join(','))];
  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`layer_${layerId}.csv`;
  a.click();
}

// ── SQL TAB ───────────────────────────────────────────────────
async function renderSQLTab(){
  // get available tables
  let tablesHint='';
  try{
    const r=await fetch('/api/tables');
    const d=await r.json();
    if(d.tables&&d.tables.length){
      tablesHint=d.tables.map(t=>`<span>${t.table}</span>`).join(' &nbsp;·&nbsp; ');
    }
  }catch(e){}

  const layerId = activeLayerId;
  const layer   = layers.find(l=>l.id===layerId);
  const defaultSQL = layer ? `SELECT * FROM ${layer.table} LIMIT 50;` : 'SELECT * FROM flight_telemetry LIMIT 50;';

  document.getElementById('modal-body').innerHTML=`
    <div class="sql-box">
      <div class="sql-box-hdr">
        <div class="sql-dot" style="background:#ff5f57"></div>
        <div class="sql-dot" style="background:#ffbd2e"></div>
        <div class="sql-dot" style="background:#28c840"></div>
        &nbsp; SQL QUERY CONSOLE &nbsp;—&nbsp; F404 EVIDENCE DATABASE
      </div>
      <textarea class="sql-input" id="sql-input" spellcheck="false">${defaultSQL}</textarea>
      <div class="sql-actions">
        <button class="btn-run" onclick="runSQL()">▶ RUN QUERY</button>
        <button class="btn-clr" onclick="document.getElementById('sql-input').value=''">CLEAR</button>
        <span class="sql-hint">Only SELECT statements permitted &nbsp;·&nbsp; Ctrl+Enter to run</span>
      </div>
    </div>
    <div class="tables-hint" style="margin-top:.8rem;">
      UNLOCKED TABLES: ${tablesHint||'<em style="color:var(--txt3)">none yet</em>'}
    </div>
    <div id="sql-results"></div>`;

  // Ctrl+Enter shortcut
  document.getElementById('sql-input').addEventListener('keydown', e=>{
    if(e.ctrlKey && e.key==='Enter'){ e.preventDefault(); runSQL(); }
  });
}

async function runSQL(){
  const sqlEl = document.getElementById('sql-input');
  const resEl = document.getElementById('sql-results');
  const sql   = sqlEl.value.trim();
  if(!sql){ toast('Enter a SQL query first.','err'); return; }

  resEl.innerHTML=`<div class="sql-ok"><span class="loader"></span> &nbsp;Running…</div>`;

  try{
    const r = await fetch('/api/query',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({sql})
    });
    const d = await r.json();
    if(d.error){ resEl.innerHTML=`<div class="sql-err">ERROR: ${esc(d.error)}</div>`; return; }

    if(!d.data||!d.data.length){
      resEl.innerHTML=`<div class="sql-ok">✓ Query returned 0 rows.</div>`;
      return;
    }

    const cols=Object.keys(d.data[0]);
    resEl.innerHTML=`
      <div class="sql-ok">✓ ${d.rowCount} row${d.rowCount!==1?'s':''} returned</div>
      <div class="tbl-wrap">
        <table class="data-tbl">
          <thead><tr>${cols.map(c=>`<th>${c.toUpperCase()}</th>`).join('')}</tr></thead>
          <tbody>${buildTbody(d.data,cols)}</tbody>
        </table>
      </div>`;
  } catch(e){
    resEl.innerHTML=`<div class="sql-err">Network error. Is the server running?</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// SUBMIT
// ═══════════════════════════════════════════════════════════════
async function submitFindings(){
  const team     = document.getElementById('f-team').value.trim();
  const culprit  = document.getElementById('f-culprit').value.trim();
  const motive   = document.getElementById('f-motive').value.trim();
  const method   = document.getElementById('f-method').value.trim();
  const evidence = document.getElementById('f-evidence').value.trim();

  if(!team)    { toast('Please enter your team name.','err'); return; }
  if(!culprit) { toast('Please enter your primary suspect.','err'); return; }

  try{
    const r=await fetch('/api/submit',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({team_name:team, culprit, motive, method, evidence})
    });
    const d=await r.json();
    if(d.success){
      toast(`✅ Report filed successfully, ${team}! Your findings are on record.`,'ok',7000);
      ['f-team','f-culprit','f-motive','f-method','f-evidence'].forEach(id=>{
        document.getElementById(id).value='';
      });
    } else {
      toast(d.error||'Submission failed.','err');
    }
  } catch(e){
    toast('Network error submitting report.','err');
  }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
(async function init(){
  await pollLayers();
  setInterval(pollLayers, 10000);     // re-poll every 10 s
  setInterval(tickCountdowns, 1000);  // tick counters every second
  setInterval(tickNavTimer, 1000);
})();
