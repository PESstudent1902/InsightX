'use strict';
/* ═══════════════════════════════════════════════════════════════
   FLIGHT 404 — ADMIN.JS
   Volunteer control panel logic
   ═══════════════════════════════════════════════════════════════ */

let adminLayers    = [];
let adminStartTime = null;

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg, type='', duration=4000){
  const box = document.getElementById('toasts');
  const t   = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(()=>{ t.classList.add('dying'); setTimeout(()=>t.remove(),500); }, duration);
}

function fmtHMS(secs){
  if(secs<=0) return '00:00:00';
  const h=Math.floor(secs/3600), m=Math.floor((secs%3600)/60), s=Math.floor(secs%60);
  return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':');
}

// ── AUTH ──────────────────────────────────────────────────────
async function checkAuth(){
  const r = await fetch('/api/admin/check');
  const d = await r.json();
  if(d.authenticated) showPanel();
}

async function doLogin(){
  const user = document.getElementById('l-user').value.trim();
  const pass = document.getElementById('l-pass').value;
  const errEl= document.getElementById('login-err');
  errEl.classList.remove('show');

  try{
    const r = await fetch('/api/admin/login',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({username:user, password:pass})
    });
    const d = await r.json();
    if(d.success){
      showPanel();
    } else {
      errEl.classList.add('show');
    }
  } catch(e){
    errEl.textContent = '⚠ Cannot reach server.';
    errEl.classList.add('show');
  }
}

async function doLogout(){
  await fetch('/api/admin/logout',{method:'POST'});
  document.getElementById('admin-panel').style.display='none';
  document.getElementById('login-screen').style.display='flex';
}

function showPanel(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('admin-panel').style.display='block';
  loadAdmin();
  setInterval(loadAdmin, 8000);
  setInterval(tickAdminClock, 1000);
}

// ── CLOCK TICK ────────────────────────────────────────────────
function tickAdminClock(){
  if(!adminStartTime) return;
  const elapsed = Math.floor((Date.now()-adminStartTime)/1000);
  const txt = fmtHMS(elapsed);
  document.getElementById('a-clock').textContent = txt;
  document.getElementById('admin-clock').textContent = txt;
}
setInterval(tickAdminClock, 1000);

// ── LOAD ADMIN DATA ───────────────────────────────────────────
async function loadAdmin(){
  try{
    const r = await fetch('/api/admin/status');
    if(r.status===401){ doLogout(); return; }
    const d = await r.json();
    adminStartTime = d.state ? Number(d.state.start_time) : null;
    adminLayers    = d.layers || [];
    renderAdminLayers();
    renderSubmissions(d.submissions||[]);
  } catch(e){
    toast('Failed to load admin data.','err');
  }
}

async function syncNow(){ await loadAdmin(); toast('Synced.','ok',2000); }

// ── RENDER LAYER CARDS ────────────────────────────────────────
function renderAdminLayers(){
  const grid = document.getElementById('admin-layers');
  grid.innerHTML = '';
  adminLayers.forEach(layer=>{
    const card = document.createElement('div');
    let statusClass = 'locked';
    let badgeClass  = 'locked';
    let badgeText   = 'LOCKED';
    if(layer.manualOverride && layer.unlocked)  { statusClass='override'; badgeClass='override'; badgeText='OVERRIDE ↑ UNLOCKED'; }
    else if(layer.manualOverride && !layer.unlocked){ statusClass=''; badgeClass='locked'; badgeText='OVERRIDE ↓ LOCKED'; }
    else if(layer.unlocked)                     { statusClass='unlocked'; badgeClass='unlocked'; badgeText='TIMER UNLOCKED'; }

    let timerTxt = '';
    if(!layer.unlocked){
      timerTxt = layer.unlocksIn > 0
        ? `Unlocks in ${fmtHMS(layer.unlocksIn)}`
        : 'Scheduled to unlock now';
    } else {
      timerTxt = `Unlocked (scheduled at T+${layer.unlockMins} min)`;
    }

    card.className = `alayer ${statusClass}`;
    card.innerHTML = `
      <div class="alayer-hdr">
        <div class="alayer-name">${layer.icon} &nbsp; ${layer.name}</div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div style="font-family:var(--M);font-size:.52rem;color:var(--txt3);letter-spacing:2px;margin-bottom:.4rem;">
        LAYER ${String(layer.id).toUpperCase()} &nbsp;·&nbsp; TABLE: ${layer.table}
      </div>
      <div class="alayer-timer">${timerTxt}</div>
      <div class="alayer-btns">
        <button class="b-unlock" onclick="overrideLayer('${layer.id}',true)">🔓 FORCE UNLOCK</button>
        <button class="b-lock"   onclick="overrideLayer('${layer.id}',false)">🔒 FORCE LOCK</button>
        <button class="b-reset"  onclick="clearOverride('${layer.id}')">↺ REVERT TO TIMER</button>
      </div>`;
    grid.appendChild(card);
  });
}

// ── LAYER OVERRIDE ACTIONS ────────────────────────────────────
async function overrideLayer(layerId, unlock){
  try{
    const r = await fetch(`/api/admin/layer/${layerId}/override`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({force_unlocked: unlock})
    });
    const d = await r.json();
    if(d.success){
      const layerName = adminLayers.find(l=>l.id===layerId)?.name || layerId;
      toast(`${unlock?'🔓 UNLOCKED':'🔒 LOCKED'}: Layer ${String(layerId).toUpperCase()} — ${layerName}`, unlock?'ok':'warn', 5000);
      await loadAdmin();
    }
  } catch(e){
    toast('Override failed.','err');
  }
}

async function clearOverride(layerId){
  try{
    await fetch(`/api/admin/layer/${layerId}/override`,{method:'DELETE'});
    toast(`↺ Layer ${String(layerId).toUpperCase()} reverted to timer control.`,'',3000);
    await loadAdmin();
  } catch(e){
    toast('Failed to clear override.','err');
  }
}

async function unlockAll(){
  if(!confirm('Unlock ALL layers for ALL participants?')) return;
  await fetch('/api/admin/unlock-all',{method:'POST'});
  toast('🔓 ALL LAYERS UNLOCKED.','ok',5000);
  await loadAdmin();
}

async function lockAll(){
  if(!confirm('Lock ALL layers? Participants will lose access until re-unlocked.')) return;
  await fetch('/api/admin/lock-all',{method:'POST'});
  toast('🔒 ALL LAYERS LOCKED.','warn',5000);
  await loadAdmin();
}

async function resetGame(){
  if(!confirm('FULL RESET: This clears all submissions and restarts the clock. Are you sure?')) return;
  const r = await fetch('/api/admin/reset',{method:'POST'});
  const d = await r.json();
  if(d.success){
    adminStartTime = d.startTime;
    toast('↺ Game reset. Clock restarted.','ok',5000);
    await loadAdmin();
  }
}

async function shiftClock(){
  const mins  = parseInt(document.getElementById('shift-mins').value,10);
  if(isNaN(mins)) return;
  const shift = mins * 60000;
  const newStart = (adminStartTime||Date.now()) - shift;
  const r = await fetch('/api/admin/start-time',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({startTime: newStart})
  });
  const d = await r.json();
  if(d.success){
    adminStartTime = newStart;
    toast(`Clock shifted ${mins > 0 ? '+' : ''}${mins} minutes.`,'ok',3000);
    await loadAdmin();
  }
}

// ── SUBMISSIONS ───────────────────────────────────────────────
let latestSubs = [];

function renderSubmissions(subs){
  latestSubs = subs;
  document.getElementById('sub-count').textContent = `${subs.length} submission${subs.length!==1?'s':''}`;
  const el = document.getElementById('submissions-table');

  if(!subs.length){
    el.innerHTML='<p class="no-data">No submissions yet.</p>';
    return;
  }

  const rows = subs.map(s=>{
    const dt = new Date(Number(s.submitted_at)).toLocaleTimeString();
    return `<tr>
      <td>${esc(s.id)}</td>
      <td style="color:var(--cyan)">${esc(s.team_name)}</td>
      <td style="color:var(--gold)">${esc(s.culprit)}</td>
      <td>${esc(s.motive)}</td>
      <td>${esc(s.method)}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(s.evidence)}">${esc(s.evidence)}</td>
      <td style="color:var(--txt3)">${dt}</td>
    </tr>`;
  }).join('');

  el.innerHTML=`
    <div style="overflow-x:auto;">
      <table class="sub-tbl">
        <thead><tr>
          <th>#</th><th>TEAM</th><th>CULPRIT</th><th>MOTIVE</th><th>METHOD</th><th>EVIDENCE</th><th>TIME</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function exportSubmissions(){
  if(!latestSubs.length){ toast('No submissions to export.','err'); return; }
  const cols=['id','team_name','culprit','motive','method','evidence','submitted_at'];
  const rows=[cols.join(','), ...latestSubs.map(s=>cols.map(c=>JSON.stringify(s[c]??'')).join(','))];
  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='f404_submissions.csv';
  a.click();
}

function esc(v){
  if(v===null||v===undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── ENTER key on login ────────────────────────────────────────
document.addEventListener('keydown', e=>{
  if(e.key==='Enter' && document.getElementById('login-screen').style.display!=='none') doLogin();
});

// ── INIT ──────────────────────────────────────────────────────
checkAuth();
