/* ============================================================
   FINIA — dashboard.js  (complete clean rewrite)
   ============================================================ */

const API = 'http://localhost:3001/api';
const token = () => localStorage.getItem('finia_token');
const authHeaders = () => ({ 'Content-Type':'application/json', 'Authorization':'Bearer '+token() });

/* ── App state ── */
const state = {
  user: null, budget: null, expenses: [],
  groups: [], selectedGroupType: 'trip', selectedSeCategory: 'food', selectedSplitMethod: 'equal',
  grpMembers: [], settlements: []
};

const CAT = {
  savings:       { emoji:'💰', color:'#6EE7B7' },
  snacks:        { emoji:'🍕', color:'#F59E0B' },
  entertainment: { emoji:'🎭', color:'#A78BFA' },
  rent:          { emoji:'🏠', color:'#3B82F6' },
  bills:         { emoji:'⚡', color:'#EF4444' },
  others:        { emoji:'📦', color:'#9CA3AF' }
};
const GRPICON = { trip:'✈️', home:'🏠', food:'🍕', party:'🎉', office:'💼', other:'📦' };
const SECAT   = { food:'🍕', transport:'🚗', hotel:'🏨', activity:'🎯', drinks:'🍺', other:'📦' };
const CUR = { IN:'₹',US:'$',UK:'£',CA:'CA$',AU:'A$',DE:'€',FR:'€',JP:'¥',SG:'S$',AE:'AED',OTHER:'$' };
let pieChart=null, lineChart=null, barChart=null, yearChart=null;

/* ─── helpers ─── */
const sym  = () => CUR[state.user?.country] || '₹';
const cap  = s => s ? s[0].toUpperCase()+s.slice(1) : '';
const esc  = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
const fnum = n => { n=parseFloat(n)||0; if(n>=100000) return (n/100000).toFixed(1)+'L'; if(n>=1000) return (n/1000).toFixed(1)+'K'; return n%1?n.toFixed(2):String(n); };
const isSaving = e => e.category === 'savings';
const spent    = () => state.expenses.filter(e=>!isSaving(e)).reduce((s,e)=>s+e.amount,0);
const saved    = () => state.expenses.filter(isSaving).reduce((s,e)=>s+e.amount,0);

function showToast(msg, type='success', ms=3500) {
  const c=document.getElementById('toastContainer');
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  t.innerHTML=`<span>${{success:'✅',error:'❌',warning:'⚠️'}[type]}</span><span>${msg}</span>`;
  c.appendChild(t);
  const id=setTimeout(()=>rm(t),ms);
  t.onclick=()=>{clearTimeout(id);rm(t);};
}
function rm(t){t.style.animation='toastIn .3s ease reverse forwards';t.addEventListener('animationend',()=>t.remove(),{once:true});}
function markInvalid(el){el.classList.add('invalid');el.addEventListener('input',()=>el.classList.remove('invalid'),{once:true});}

/* ═══════════════════════════════
   BOOT
═══════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const u = localStorage.getItem('finia_user');
  if (!u || !token()) { window.location.href='index.html'; return; }
  state.user = JSON.parse(u);
  applyTheme();
  initUI();
  loadDashboard();
  wireEvents();
});

function initUI() {
  const u=state.user, ini=(u.name||'U')[0].toUpperCase();
  document.getElementById('userAvatar').textContent    = ini;
  document.getElementById('topbarAvatar').textContent  = ini;
  document.getElementById('sidebarUserName').textContent  = u.name||'User';
  document.getElementById('sidebarUserEmail').textContent = u.email||'';
  document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
  ['currencySymbol','expCurrencyIcon','seCurrIcon'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=sym();});
}

function applyTheme() {
  const th=localStorage.getItem('finia_theme')||'dark';
  const co=localStorage.getItem('finia_color')||'emerald';
  document.documentElement.setAttribute('data-theme',th);
  document.documentElement.setAttribute('data-color-theme',co);
  const ic=document.getElementById('themeIcon');
  if(ic) ic.textContent=th==='dark'?'☀️':'🌙';
  document.querySelectorAll('.theme-dot').forEach(d=>d.classList.toggle('active',d.dataset.color===co));
}

/* ═══════════════════════════════
   DATA LOAD
═══════════════════════════════ */
async function loadDashboard() {
  /* Show loading spinner in stat cards while fetching */
  ['statBudgetVal','statSpentVal','statRemainingVal','statSavingsVal'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.textContent='...';
  });

  await loadBudget();
  await loadExpenses();
  await loadGroups();

  console.log('[Finia] ── Load complete ──');
  console.log('  budget:  ', state.budget ? JSON.stringify({monthly:state.budget.monthly}) : 'null (not set yet)');
  console.log('  expenses:', state.expenses.length, 'records');
  console.log('  groups:  ', state.groups.length, 'records');

  if (!state.budget && state.expenses.length === 0) {
    /* Brand new account — show welcome message, not demo data */
    showToast('Welcome! Set up your budget to get started 🎉', 'success', 5000);
  }

  renderOverview();
}

async function loadBudget() {
  try {
    const r = await fetch(`${API}/budget`, { headers: authHeaders() });
    if (r.status === 401) { handleSessionExpired(); return; }
    const d = await r.json();
    console.log('[Finia] loadBudget response:', r.status, d.budget ? 'has budget' : 'no budget yet');
    if (r.ok) state.budget = d.budget;
  } catch(e) {
    console.warn('[Finia] loadBudget network error:', e.message);
  }
}

async function loadExpenses() {
  try {
    const r = await fetch(`${API}/budget/expenses`, { headers: authHeaders() });
    if (r.status === 401) { handleSessionExpired(); return; }
    const d = await r.json();
    console.log('[Finia] loadExpenses response:', r.status, (d.expenses||[]).length, 'expenses');
    if (r.ok) state.expenses = d.expenses || [];
  } catch(e) {
    console.warn('[Finia] loadExpenses network error:', e.message);
    state.expenses = [];
  }
}

async function loadGroups() {
  try {
    const r = await fetch(`${API}/budget/groups`, { headers: authHeaders() });
    if (r.status === 401) { handleSessionExpired(); return; }
    const d = await r.json();
    if (r.ok) state.groups = d.groups || [];
  } catch(e) {
    console.warn('[Finia] loadGroups failed:', e.message);
    state.groups = [];
  }
}

function handleSessionExpired() {
  showToast('Session expired. Please log in again.', 'error', 4000);
  setTimeout(() => {
    localStorage.removeItem('finia_token');
    localStorage.removeItem('finia_user');
    window.location.href = 'index.html';
  }, 2000);
}
function loadDemo() {
  state.budget={monthly:50000,categories:{savings:{pct:20,amount:10000},snacks:{pct:10,amount:5000},entertainment:{pct:15,amount:7500},rent:{pct:30,amount:15000},bills:{pct:15,amount:7500},others:{pct:10,amount:5000}}};
  state.expenses=[
    {id:1,description:'Netflix',category:'entertainment',amount:649,date:new Date().toISOString()},
    {id:2,description:'Groceries',category:'snacks',amount:1200,date:new Date(Date.now()-86400000).toISOString()},
    {id:3,description:'Electricity',category:'bills',amount:2500,date:new Date(Date.now()-172800000).toISOString()},
    {id:4,description:'Monthly Rent',category:'rent',amount:15000,date:new Date(Date.now()-259200000).toISOString()},
    {id:5,description:'SIP Investment',category:'savings',amount:5000,date:new Date(Date.now()-345600000).toISOString()},
  ];
}

/* ═══════════════════════════════
   OVERVIEW
═══════════════════════════════ */
function renderOverview() {
  renderStats(); renderPie(); renderLine('weekly');
  renderRecent(); renderProgress(); checkAlerts();
}

function renderStats() {
  const b=state.budget?.monthly||0, sp=spent(), sv=saved(), rem=b-sp;
  const pct=b>0?Math.round(sp/b*100):0;
  document.getElementById('statBudgetVal').textContent   = sym()+fnum(b);
  document.getElementById('statSpentVal').textContent    = sym()+fnum(sp);
  document.getElementById('statRemainingVal').textContent= sym()+fnum(Math.max(rem,0));
  document.getElementById('statSavingsVal').textContent  = sym()+fnum(sv);
  document.getElementById('statSpentPct').textContent    = pct+'% used';
  const remEl=document.getElementById('statRemainingPct');
  remEl.textContent=rem>=0?(100-pct)+'% left':'Over budget';
  remEl.className='stat-trend '+(rem>=0?'up':'down');
}

function renderPie() {
  const cats=state.budget?.categories||{};
  const byCat={};
  state.expenses.forEach(e=>{byCat[e.category]=(byCat[e.category]||0)+e.amount;});
  const labels=[],data=[],colors=[];
  Object.entries(cats).forEach(([k,v])=>{
    labels.push((CAT[k]?.emoji||'')+ ' '+cap(k));
    data.push(byCat[k]||v.amount||0);
    colors.push(CAT[k]?.color||'#9CA3AF');
  });
  const ctx=document.getElementById('pieChart').getContext('2d');
  if(pieChart) pieChart.destroy();
  pieChart=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors.map(c=>c+'CC'),borderColor:colors,borderWidth:2,hoverOffset:10}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom',labels:{color:'#9CA3AF',padding:12,font:{size:11,family:'DM Sans'}}},tooltip:{callbacks:{label:c=>` ${sym()}${fnum(c.parsed)}`}}},animation:{duration:800,easing:'easeOutBounce'}}});
}

function renderLine(period='weekly') {
  const ctx=document.getElementById('lineChart').getContext('2d');
  if(lineChart) lineChart.destroy();
  const {labels,data}=chartData(period,true);
  lineChart=new Chart(ctx,{type:period==='weekly'?'bar':'line',data:{labels,datasets:[{label:'Spending',data,backgroundColor:period==='weekly'?labels.map((_,i)=>`rgba(110,231,183,${0.3+(i%3)*0.15})`):'rgba(110,231,183,0.1)',borderColor:'#6EE7B7',borderWidth:2,borderRadius:period==='weekly'?8:0,fill:period!=='weekly',tension:0.4,pointBackgroundColor:'#6EE7B7',pointRadius:period!=='weekly'?4:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${sym()}${fnum(c.parsed.y)}`}}},scales:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#9CA3AF',font:{size:11}}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#9CA3AF',font:{size:11},callback:v=>sym()+fnum(v)}}},animation:{duration:700}}});
}

function chartData(period,excludeSavings=false) {
  const now=new Date();
  const src=excludeSavings?state.expenses.filter(e=>!isSaving(e)):state.expenses;
  if(period==='weekly'){
    const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],data=days.map(()=>0);
    src.forEach(e=>{const d=new Date(e.date);if((now-d)/86400000<7)data[d.getDay()===0?6:d.getDay()-1]+=e.amount;});
    return {labels:days,data};
  }
  if(period==='monthly'){
    const w=['Week 1','Week 2','Week 3','Week 4'],data=[0,0,0,0];
    src.forEach(e=>{const d=new Date(e.date);if(d.getMonth()===now.getMonth())data[Math.min(Math.floor((d.getDate()-1)/7),3)]+=e.amount;});
    return {labels:w,data};
  }
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],data=months.map(()=>0);
  src.forEach(e=>{const d=new Date(e.date);if(d.getFullYear()===now.getFullYear())data[d.getMonth()]+=e.amount;});
  return {labels:months,data};
}

function renderRecent() {
  const c=document.getElementById('recentExpenses');
  renderExpItems(c,[...state.expenses].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5),false);
}
function renderAllExpenses(filterCat='') {
  const c=document.getElementById('allExpenses');
  let list=[...state.expenses].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(filterCat) list=list.filter(e=>e.category===filterCat);
  renderExpItems(c,list,true);
}
function renderExpItems(container,list,showDel) {
  if(!list.length){container.innerHTML=`<div class="empty-state"><span>📭</span><p>No entries yet</p></div>`;return;}
  container.innerHTML=list.map(e=>{
    const cat=CAT[e.category]||{emoji:'📦',color:'#9CA3AF'};
    const sv=isSaving(e);
    const dt=new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const label=e.description||cap(e.category);
    const amtHtml=sv
      ?`<span class="exp-amount" style="color:#6EE7B7">+${sym()}${fnum(e.amount)}</span>`
      :`<span class="exp-amount" style="color:${cat.color}">-${sym()}${fnum(e.amount)}</span>`;
    return `<div class="expense-item">
      <span class="exp-emoji">${cat.emoji}</span>
      <div class="exp-info">
        <div class="exp-desc">${esc(label)}</div>
        <div class="exp-meta">${cap(e.category)} · ${dt}${sv?' · <span style="color:#6EE7B7;font-weight:600">Saved ✓</span>':''}</div>
      </div>
      ${amtHtml}
      ${showDel?`<button class="exp-delete" onclick="deleteExpense('${e.id}')">🗑</button>`:''}
    </div>`;
  }).join('');
}

function renderProgress() {
  const c=document.getElementById('progressList'), cats=state.budget?.categories;
  if(!cats){return;}
  const byCat={};
  state.expenses.forEach(e=>{byCat[e.category]=(byCat[e.category]||0)+e.amount;});
  c.innerHTML=Object.entries(cats).map(([k,v])=>{
    const amt=byCat[k]||0, bud=v.amount||0, pct=bud>0?Math.min(amt/bud*100,100):0;
    const sv=k==='savings';
    const cls=sv?'ok':pct>=100?'over':pct>=80?'warn':'ok';
    return `<div class="progress-item">
      <div class="progress-header"><span>${CAT[k]?.emoji} ${cap(k)}</span><span>${sym()}${fnum(amt)} / ${sym()}${fnum(bud)}</span></div>
      <div class="progress-track"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="progress-pct">${Math.round(pct)}% ${sv?'of goal':'used'}</span>
    </div>`;
  }).join('');
}

function checkAlerts() {
  const b=state.budget?.monthly||0; if(!b) return;
  const sp=spent(), pct=sp/b;
  const al=document.getElementById('budgetAlert'), msg=document.getElementById('alertMsg');
  if(pct>=1){msg.textContent=`⚠️ Spending exceeded budget by ${sym()}${fnum(sp-b)}!`;al.classList.remove('hidden');}
  else if(pct>=0.8){msg.textContent=`You've used ${Math.round(pct*100)}% of your spending budget.`;al.classList.remove('hidden');}
  else al.classList.add('hidden');
}

/* ═══════════════════════════════
   ANALYTICS
═══════════════════════════════ */
function renderBarChart() {
  const ctx=document.getElementById('barChart').getContext('2d');
  if(barChart) barChart.destroy();
  const cats=state.budget?.categories||{}, byCat={};
  state.expenses.forEach(e=>{byCat[e.category]=(byCat[e.category]||0)+e.amount;});
  barChart=new Chart(ctx,{type:'bar',data:{labels:Object.keys(cats).map(cap),datasets:[{label:'Budgeted',data:Object.values(cats).map(v=>v.amount||0),backgroundColor:'rgba(59,130,246,0.4)',borderColor:'#3B82F6',borderWidth:1,borderRadius:6},{label:'Actual',data:Object.keys(cats).map(k=>byCat[k]||0),backgroundColor:'rgba(110,231,183,0.5)',borderColor:'#6EE7B7',borderWidth:1,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#9CA3AF',font:{size:11}}}},scales:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#9CA3AF',font:{size:11}}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#9CA3AF',font:{size:11},callback:v=>sym()+fnum(v)}}}}});
}
function renderYearChart() {
  const ctx=document.getElementById('yearChart').getContext('2d');
  if(yearChart) yearChart.destroy();
  const {labels,data}=chartData('yearly',true);
  yearChart=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Monthly Spending',data,backgroundColor:'rgba(167,139,250,0.15)',borderColor:'#A78BFA',borderWidth:2,fill:true,tension:0.4,pointBackgroundColor:'#A78BFA',pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#9CA3AF',font:{size:11}}},y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#9CA3AF',font:{size:11},callback:v=>sym()+fnum(v)}}}}});
}

/* ═══════════════════════════════
   BUDGET SETUP
═══════════════════════════════ */
function proceedToCategories() {
  const v=parseFloat(document.getElementById('monthlyBudgetInput').value);
  if(!v||v<=0){showToast('Enter a valid amount.','error');return;}
  document.getElementById('step1').classList.add('hidden');
  document.getElementById('step2').classList.remove('hidden');
  buildCatGrid(v);
}
function goBackToStep1(){document.getElementById('step2').classList.add('hidden');document.getElementById('step1').classList.remove('hidden');}

function buildCatGrid(total) {
  const defs={savings:20,snacks:10,entertainment:15,rent:30,bills:15,others:10};
  document.getElementById('categoryGrid').innerHTML=Object.keys(CAT).map(k=>{
    const pct=defs[k]||10, amt=Math.round(pct/100*total);
    return `<div class="cat-item">
      <div class="cat-header">
        <span class="cat-emoji">${CAT[k].emoji}</span>
        <span class="cat-name">${cap(k)}</span>
        <div class="mode-toggle-group">
          <button class="mode-btn active" id="mb-pct-${k}" onclick="setCatMode('${k}','pct',${total})">%</button>
          <button class="mode-btn" id="mb-amt-${k}" onclick="setCatMode('${k}','amt',${total})">${sym()}</button>
        </div>
      </div>
      <div class="cat-input-row" id="row-pct-${k}">
        <input type="number" class="cat-pct" id="pct-${k}" value="${pct}" min="0" max="100" oninput="onPctIn('${k}',${total})"/>
        <span class="cat-pct-label">% = ${sym()}<span id="da-${k}">${fnum(amt)}</span></span>
      </div>
      <div class="cat-input-row hidden" id="row-amt-${k}">
        <span class="cat-pct-label">${sym()}</span>
        <input type="number" class="cat-pct" id="amtv-${k}" value="${amt}" min="0" oninput="onAmtIn('${k}',${total})"/>
        <span class="cat-pct-label" id="dp-${k}">(${pct}%)</span>
      </div>
    </div>`;
  }).join('');
  updateAllocBar(total);
}

function setCatMode(k,mode,total){
  document.getElementById(`mb-pct-${k}`).classList.toggle('active',mode==='pct');
  document.getElementById(`mb-amt-${k}`).classList.toggle('active',mode==='amt');
  document.getElementById(`row-pct-${k}`).classList.toggle('hidden',mode!=='pct');
  document.getElementById(`row-amt-${k}`).classList.toggle('hidden',mode!=='amt');
  updateAllocBar(total);
}
function onPctIn(k,total){
  const pct=parseFloat(document.getElementById(`pct-${k}`).value)||0;
  const amt=Math.round(pct/100*total);
  document.getElementById(`da-${k}`).textContent=fnum(amt);
  document.getElementById(`amtv-${k}`).value=amt;
  updateAllocBar(total);
}
function onAmtIn(k,total){
  const amt=parseFloat(document.getElementById(`amtv-${k}`).value)||0;
  const pct=total>0?Math.round(amt/total*1000)/10:0;
  document.getElementById(`dp-${k}`).textContent=`(${pct}%)`;
  document.getElementById(`pct-${k}`).value=pct;
  document.getElementById(`da-${k}`).textContent=fnum(amt);
  updateAllocBar(total);
}
function updateAllocBar(total){
  let tp=0;
  Object.keys(CAT).forEach(k=>{tp+=parseFloat(document.getElementById(`pct-${k}`)?.value||0);});
  tp=Math.round(tp*10)/10;
  const fill=document.getElementById('allocBarFill');
  fill.style.width=Math.min(tp,100)+'%';
  fill.style.background=tp>100?'#EF4444':'linear-gradient(90deg,var(--theme-a),var(--theme-b))';
  document.getElementById('allocPct').textContent=tp+'%';
  const rem=total-Math.round(tp/100*total);
  const re=document.getElementById('allocRemaining');
  re.textContent=rem>=0?`· ${sym()}${fnum(rem)} unallocated`:`· ${sym()}${fnum(Math.abs(rem))} over`;
  re.style.color=rem>=0?'var(--theme-a)':'var(--accent-4)';
}
async function saveBudget(){
  const monthly=parseFloat(document.getElementById('monthlyBudgetInput').value);
  const categories={};let tp=0;
  Object.keys(CAT).forEach(k=>{
    const pct=parseFloat(document.getElementById(`pct-${k}`)?.value||0);
    const amt=parseFloat(document.getElementById(`amtv-${k}`)?.value||0);
    const fa=amt>0?amt:Math.round(pct/100*monthly);
    const fp=pct>0?pct:monthly>0?Math.round(fa/monthly*100):0;
    categories[k]={pct:fp,amount:fa};tp+=fp;
  });
  if(tp>100.5){showToast(`Total ${Math.round(tp)}% exceeds 100%.`,'error');return;}
  try{
    const r=await fetch(`${API}/budget`,{method:'POST',headers:authHeaders(),body:JSON.stringify({monthly,categories})});
    const d=await r.json();
    if(!r.ok){
      console.error('[Finia] Budget save failed:', d.message);
      showToast('Budget save failed: '+d.message,'error');
      return;
    }
    state.budget={monthly,categories};
    console.log('[Finia] Budget saved to Neo4j ✅');
    showToast('Budget saved! 🎉','success');
  } catch(err){
    console.error('[Finia] Budget save error:', err.message);
    showToast('Cannot reach server. Check backend is running.','error');
    return;  /* Don't pretend it saved if it didn't */
  }
  switchSection('overview'); renderOverview();
}

/* ═══════════════════════════════
   EXPENSES
═══════════════════════════════ */
document.getElementById('expenseForm').addEventListener('submit', async e => {
  e.preventDefault();
  const amount=document.getElementById('expAmount'), cat=document.getElementById('expCategory'), date=document.getElementById('expDate');
  let ok=true;
  if(!amount.value||+amount.value<=0){markInvalid(amount);ok=false;}
  if(!cat.value){markInvalid(cat);ok=false;}
  if(!date.value){markInvalid(date);ok=false;}
  if(!ok){showToast('Fill Amount, Category and Date.','error');return;}

  const desc=document.getElementById('expDesc').value.trim();
  const exp={description:desc||cap(cat.value),amount:parseFloat(amount.value),category:cat.value,date:date.value};
  try{
    const r=await fetch(`${API}/budget/expenses`,{method:'POST',headers:authHeaders(),body:JSON.stringify(exp)});
    const d=await r.json();
    if(!r.ok){ console.warn('[Finia] Expense not saved to DB:', d.message); }
    else { exp.id=d.expense?.id||Date.now(); console.log('[Finia] Expense saved to Neo4j ✅'); }
  } catch(err){ console.warn('[Finia] Server unreachable, expense saved locally only'); exp.id=Date.now(); }

  state.expenses.unshift({...exp,date:new Date(exp.date).toISOString()});
  showToast(isSaving(exp)?`Saved ${sym()}${fnum(exp.amount)} 💰`:`${sym()}${fnum(exp.amount)} logged 💸`,'success');
  e.target.reset(); document.getElementById('expDate').value=new Date().toISOString().split('T')[0];
  renderAllExpenses(); renderOverview();
  if(!isSaving(exp)) catAlert(exp.category);
});

document.getElementById('quickExpenseForm').addEventListener('submit', async e => {
  e.preventDefault();
  const amount=parseFloat(document.getElementById('qAmount').value), cat=document.getElementById('qCategory').value;
  const desc=document.getElementById('qDesc').value.trim();
  if(!amount){showToast('Enter an amount.','error');return;}
  const exp={description:desc||cap(cat),amount,category:cat,date:new Date().toISOString()};
  try{
    const r=await fetch(`${API}/budget/expenses`,{method:'POST',headers:authHeaders(),body:JSON.stringify(exp)});
    const d=await r.json();
    if(r.ok){ exp.id=d.expense?.id||Date.now(); console.log('[Finia] Quick expense saved to Neo4j ✅'); }
    else { console.warn('[Finia] Quick expense not saved:', d.message); exp.id=Date.now(); }
  } catch(err){ console.warn('[Finia] Server unreachable:', err.message); exp.id=Date.now(); }
  state.expenses.unshift({...exp});
  showToast(isSaving(exp)?`Saved ${sym()}${fnum(amount)} 💰`:`${sym()}${fnum(amount)} logged 💸`,'success');
  document.getElementById('quickModal').classList.add('hidden');
  document.getElementById('quickExpenseForm').reset();
  renderOverview();
  if(!isSaving(exp)) catAlert(cat);
});

function catAlert(cat){
  if(cat==='savings') return;
  const bud=state.budget?.categories?.[cat]?.amount||0; if(!bud) return;
  const sp=state.expenses.filter(e=>e.category===cat).reduce((s,e)=>s+e.amount,0);
  const p=sp/bud;
  if(p>=1) showToast(`⚠️ Over budget in ${cap(cat)}!`,'error',5000);
  else if(p>=0.8) showToast(`⚠️ ${Math.round(p*100)}% of ${cap(cat)} budget used`,'warning',4000);
}

async function deleteExpense(id) {
  state.expenses=state.expenses.filter(e=>String(e.id)!==String(id));
  try{await fetch(`${API}/budget/expenses/${id}`,{method:'DELETE',headers:authHeaders()});}catch{}
  renderAllExpenses(document.getElementById('filterCategory').value);
  renderOverview(); showToast('Entry removed','warning');
}

/* ═══════════════════════════════
   FRIENDS & GROUPS
═══════════════════════════════ */
function addGroupMember() {
  const inp=document.getElementById('grpMemberInput'), name=inp.value.trim();
  if(!name) return;
  const me=state.user?.name||'You';
  if(!state.grpMembers.includes(me)) state.grpMembers.unshift(me);
  if(state.grpMembers.includes(name)){showToast('Already added.','warning');return;}
  state.grpMembers.push(name); inp.value=''; renderGrpMembers();
}
function removeGrpMember(name){
  const me=state.user?.name||'You';
  if(name===me){showToast("Can't remove yourself.",'warning');return;}
  state.grpMembers=state.grpMembers.filter(m=>m!==name); renderGrpMembers();
}
function renderGrpMembers(){
  const me=state.user?.name||'You';
  document.getElementById('grpMembersList').innerHTML=state.grpMembers.map(m=>`
    <div class="friend-tag">
      <span>${m===me?'👤 '+m+' (you)':m}</span>
      <button class="tag-remove" onclick="removeGrpMember('${esc(m)}')">✕</button>
    </div>`).join('');
}
async function createGroup(){
  const name=document.getElementById('grpName').value.trim();
  if(!name){showToast('Enter group name.','error');return;}
  const me=state.user?.name||'You';
  if(!state.grpMembers.includes(me)) state.grpMembers.unshift(me);
  if(state.grpMembers.length<2){showToast('Add at least one other member.','error');return;}

  const payload={name,type:state.selectedGroupType,members:[...state.grpMembers]};
  let group;
  try{
    const r=await fetch(`${API}/budget/groups`,{method:'POST',headers:authHeaders(),body:JSON.stringify(payload)});
    const d=await r.json();
    if(!r.ok) throw new Error(d.message);
    group=d.group;
    console.log('[Finia] Group saved to Neo4j ✅', group.id);
  }catch(err){
    console.warn('[Finia] Could not save group to server:', err.message);
    group={id:'g'+Date.now(),name,type:state.selectedGroupType,members:[...state.grpMembers],expenses:[],createdAt:new Date().toISOString()};
  }

  state.groups.push(group);
  document.getElementById('grpName').value=''; state.grpMembers=[]; renderGrpMembers();
  renderGroupsList(); syncGroupSelects();
  showToast(`Group "${name}" created! 🎉`,'success');
}
function renderGroupsList(){
  const c=document.getElementById('groupsList');
  if(!state.groups.length){c.innerHTML=`<div class="empty-state"><span>🏕</span><p>No groups yet</p></div>`;return;}
  c.innerHTML=state.groups.map(g=>{
    const tot=g.expenses.reduce((s,e)=>s+e.amount,0);
    return `<div class="group-item" onclick="openGroupBalances('${g.id}')">
      <div class="gi-icon">${GRPICON[g.type]||'📦'}</div>
      <div class="gi-body"><div class="gi-name">${esc(g.name)}</div><div class="gi-meta">${g.members.length} members · ${g.expenses.length} expenses</div></div>
      <div class="gi-right"><span class="gi-total">${sym()}${fnum(tot)}</span><span style="color:var(--text-muted);font-size:20px">›</span></div>
    </div>`;
  }).join('');
}
function openGroupBalances(id){
  switchSTab('balances');
  document.getElementById('balGroup').value=id;
  renderBalances();
}
function syncGroupSelects(){
  ['seGroup','balGroup','actGroup'].forEach(id=>{
    const sel=document.getElementById(id); if(!sel) return;
    const cur=sel.value;
    const opts=state.groups.map(g=>`<option value="${g.id}">${GRPICON[g.type]} ${esc(g.name)}</option>`).join('');
    sel.innerHTML=(id==='seGroup'?'<option value="">Select group…</option>':'<option value="">All groups</option>')+opts;
    if(cur) sel.value=cur;
  });
}
function onGroupSelect(){
  const gid=document.getElementById('seGroup').value;
  const g=state.groups.find(g=>g.id===gid); if(!g) return;
  const pb=document.getElementById('sePaidBy');
  pb.innerHTML='<option value="">Who paid?</option>'+g.members.map(m=>`<option value="${esc(m)}">${m}</option>`).join('');
  renderMethodPanel(); updateSplitPreview();
}
function renderMethodPanel(){
  const gid=document.getElementById('seGroup').value, g=state.groups.find(g=>g.id===gid);
  const panel=document.getElementById('splitMethodPanel'), m=state.selectedSplitMethod;
  if(!g||m==='equal'){panel.innerHTML='';return;}
  if(m==='custom'){
    panel.innerHTML=`<div class="method-label">Custom % per person (total must = 100%)</div>`+
      g.members.map(mb=>`<div class="method-row"><span class="method-name">${mb}</span><input type="number" class="method-input" id="cp-${safeId(mb)}" value="${Math.round(100/g.members.length)}" min="0" max="100" oninput="updateSplitPreview()"/><span class="method-unit">%</span></div>`).join('');
  } else if(m==='exact'){
    panel.innerHTML=`<div class="method-label">Exact amount per person (must total bill)</div>`+
      g.members.map(mb=>`<div class="method-row"><span class="method-name">${mb}</span><span class="method-unit">${sym()}</span><input type="number" class="method-input" id="ea-${safeId(mb)}" value="0" min="0" oninput="updateSplitPreview()"/></div>`).join('');
  } else if(m==='exclude'){
    panel.innerHTML=`<div class="method-label">Uncheck to exclude from this expense</div>`+
      g.members.map(mb=>`<div class="method-row"><input type="checkbox" id="ex-${safeId(mb)}" checked onchange="updateSplitPreview()"/><span class="method-name">${mb}</span></div>`).join('');
  }
}
function safeId(n){return n.replace(/[^a-zA-Z0-9]/g,'_');}
function computeShares(g,total,method){
  if(method==='equal') return g.members.map(m=>({name:m,amount:total/g.members.length}));
  if(method==='custom') return g.members.map(m=>({name:m,amount:total*(parseFloat(document.getElementById(`cp-${safeId(m)}`)?.value)||0)/100}));
  if(method==='exact')  return g.members.map(m=>({name:m,amount:parseFloat(document.getElementById(`ea-${safeId(m)}`)?.value)||0}));
  if(method==='exclude'){
    const inc=g.members.filter(m=>document.getElementById(`ex-${safeId(m)}`)?.checked!==false);
    const each=inc.length?total/inc.length:0;
    return g.members.map(m=>({name:m,amount:document.getElementById(`ex-${safeId(m)}`)?.checked!==false?each:0}));
  }
  return g.members.map(m=>({name:m,amount:total/g.members.length}));
}
function updateSplitPreview(){
  const gid=document.getElementById('seGroup').value, g=state.groups.find(g=>g.id===gid);
  const total=parseFloat(document.getElementById('seAmount').value)||0;
  const prev=document.getElementById('splitPreview');
  if(!g||!total){prev.innerHTML=`<div class="empty-state"><span>💡</span><p>Select a group and enter amount</p></div>`;return;}
  const shares=computeShares(g,total,state.selectedSplitMethod);
  let warn='';
  if(state.selectedSplitMethod==='custom'){const tp=shares.reduce((s,sh)=>s+sh.amount/total*100,0);if(Math.abs(tp-100)>1)warn=`<div class="method-warning">⚠️ Total is ${Math.round(tp)}% — must be 100%</div>`;}
  if(state.selectedSplitMethod==='exact'){const te=shares.reduce((s,sh)=>s+sh.amount,0);if(Math.abs(te-total)>0.01)warn=`<div class="method-warning">⚠️ Total is ${sym()}${fnum(te)} — bill is ${sym()}${fnum(total)}</div>`;}
  prev.innerHTML=warn+`<div class="preview-total-row"><span>Total</span><strong>${sym()}${fnum(total)}</strong></div>`+
    shares.map(s=>`<div class="preview-row">
      <div class="prev-av">${s.name[0].toUpperCase()}</div>
      <div class="prev-info"><span class="prev-name">${s.name}</span>
        <div class="prev-bar-track"><div class="prev-bar-fill" style="width:${total>0?s.amount/total*100:0}%"></div></div>
      </div>
      <span class="prev-amt">${sym()}${fnum(s.amount)}</span>
    </div>`).join('');
}
async function addGroupExpense(){
  const gid=document.getElementById('seGroup').value, g=state.groups.find(g=>g.id===gid);
  const amount=parseFloat(document.getElementById('seAmount').value);
  const paidBy=document.getElementById('sePaidBy').value;
  if(!g){showToast('Select a group.','error');return;}
  if(!amount){showToast('Enter an amount.','error');return;}
  if(!paidBy){showToast('Select who paid.','error');return;}

  const shares=computeShares(g,amount,state.selectedSplitMethod);
  const payload={
    description:document.getElementById('seDesc').value.trim()||cap(state.selectedSeCategory),
    amount, paidBy,
    category:state.selectedSeCategory,
    method:state.selectedSplitMethod,
    shares,
    date:new Date().toISOString()
  };

  let exp={id:'gexp'+Date.now(),...payload};
  try{
    const r=await fetch(`${API}/budget/groups/${gid}/expenses`,{method:'POST',headers:authHeaders(),body:JSON.stringify(payload)});
    const d=await r.json();
    if(!r.ok) throw new Error(d.message);
    exp=d.expense||exp;
    console.log('[Finia] Group expense saved to Neo4j ✅', exp.id);
  }catch(err){
    console.warn('[Finia] Could not save group expense to server:', err.message);
  }

  g.expenses.push(exp);
  showToast(`${sym()}${fnum(amount)} logged for "${g.name}" 💸`,'success');
  document.getElementById('seDesc').value=''; document.getElementById('seAmount').value='';
  document.getElementById('splitPreview').innerHTML=`<div class="empty-state"><span>💡</span><p>Select a group and enter amount</p></div>`;
  renderGroupsList(); syncGroupSelects();
}
function renderBalances(){
  const gid=document.getElementById('balGroup').value;
  const groups=gid?state.groups.filter(g=>g.id===gid):state.groups;
  const me=state.user?.name||'You';
  const net={};
  groups.forEach(g=>g.expenses.forEach(exp=>{
    net[exp.paidBy]=(net[exp.paidBy]||0)+exp.amount;
    exp.shares.forEach(sh=>{net[sh.name]=(net[sh.name]||0)-sh.amount;});
  }));
  state.settlements.forEach(s=>{net[s.from]=(net[s.from]||0)+s.amount;net[s.to]=(net[s.to]||0)-s.amount;});
  const myNet=net[me]||0;
  const totalExp=groups.reduce((s,g)=>s+g.expenses.reduce((a,e)=>a+e.amount,0),0);
  const settles=simplifyDebts(net);
  document.getElementById('balCardsRow').innerHTML=`
    <div class="bal-card ${myNet>=0?'bal-pos':'bal-neg'}">
      <div class="bal-label">Your net balance</div>
      <div class="bal-val">${myNet>=0?'+':''}${sym()}${fnum(Math.abs(myNet))}</div>
      <div class="bal-sub">${myNet>0?'You are owed':'You owe'}</div>
    </div>
    <div class="bal-card">
      <div class="bal-label">Total group spend</div>
      <div class="bal-val">${sym()}${fnum(totalExp)}</div>
      <div class="bal-sub">${groups.reduce((s,g)=>s+g.expenses.length,0)} transactions</div>
    </div>
    <div class="bal-card">
      <div class="bal-label">Pending settlements</div>
      <div class="bal-val">${settles.length}</div>
      <div class="bal-sub">transactions needed</div>
    </div>`;
  const sl=document.getElementById('settleList');
  sl.innerHTML=settles.length?settles.map((s,i)=>`
    <div class="settle-item" style="animation-delay:${i*0.06}s">
      <div class="settle-av">${s.from[0].toUpperCase()}</div>
      <div class="settle-body"><span class="settle-from">${s.from}</span><span class="settle-arrow">→</span><span class="settle-to">${s.to}</span></div>
      <span class="settle-amt">${sym()}${fnum(s.amount)}</span>
      <button class="settle-btn" onclick="markSettled('${esc(s.from)}','${esc(s.to)}',${s.amount})">Settle ✓</button>
    </div>`).join(''):`<div class="empty-state"><span>🎉</span><p>All settled up!</p></div>`;
  const allMembers=[...new Set(groups.flatMap(g=>g.members))];
  document.getElementById('perPersonList').innerHTML=allMembers.length?allMembers.map(m=>{
    const b=net[m]||0;
    const paid=groups.flatMap(g=>g.expenses).filter(e=>e.paidBy===m).reduce((s,e)=>s+e.amount,0);
    const owes=groups.flatMap(g=>g.expenses).flatMap(e=>e.shares).filter(s=>s.name===m).reduce((s,sh)=>s+sh.amount,0);
    return `<div class="pp-row">
      <div class="pp-av">${m[0].toUpperCase()}</div>
      <div class="pp-info"><span class="pp-name">${m}${m===me?' (you)':''}</span><span class="pp-meta">Paid ${sym()}${fnum(paid)} · Owes ${sym()}${fnum(owes)}</span></div>
      <span class="pp-bal ${b>=0?'pp-pos':'pp-neg'}">${b>=0?'+':''}${sym()}${fnum(Math.abs(b))}</span>
    </div>`;
  }).join(''):`<div class="empty-state"><span>👥</span><p>No data</p></div>`;
}
function simplifyDebts(net){
  const cred=[],debt=[];
  Object.entries(net).forEach(([n,b])=>{if(b>0.01)cred.push({name:n,amount:b});if(b<-0.01)debt.push({name:n,amount:-b});});
  cred.sort((a,b)=>b.amount-a.amount); debt.sort((a,b)=>b.amount-a.amount);
  const out=[]; let ci=0,di=0;
  while(ci<cred.length&&di<debt.length){
    const t=Math.min(cred[ci].amount,debt[di].amount);
    out.push({from:debt[di].name,to:cred[ci].name,amount:t});
    cred[ci].amount-=t; debt[di].amount-=t;
    if(cred[ci].amount<0.01)ci++; if(debt[di].amount<0.01)di++;
  }
  return out;
}
function markSettled(from,to,amount){
  state.settlements.push({from,to,amount,date:new Date().toISOString()});
  showToast(`${from} → ${to}: ${sym()}${fnum(amount)} settled! 🎉`,'success');
  renderBalances(); renderActivity();
}
function renderActivity(){
  const gid=document.getElementById('actGroup').value;
  const sort=document.getElementById('actSort').value;
  const me=state.user?.name||'You';
  const groups=gid?state.groups.filter(g=>g.id===gid):state.groups;
  let entries=groups.flatMap(g=>g.expenses.map(e=>({...e,groupName:g.name,groupType:g.type,type:'expense'})));
  entries=entries.concat(state.settlements.map(s=>({...s,type:'settlement'})));
  entries.sort((a,b)=>{
    if(sort==='newest') return new Date(b.date)-new Date(a.date);
    if(sort==='oldest') return new Date(a.date)-new Date(b.date);
    if(sort==='high')   return (b.amount||0)-(a.amount||0);
    return (a.amount||0)-(b.amount||0);
  });
  const feed=document.getElementById('activityFeed');
  if(!entries.length){feed.innerHTML=`<div class="empty-state"><span>📋</span><p>No activity yet</p></div>`;return;}
  feed.innerHTML=entries.map((e,i)=>{
    const dt=new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    if(e.type==='settlement') return `<div class="activity-item settle-act" style="animation-delay:${i*0.04}s">
      <div class="act-icon">🤝</div>
      <div class="act-body"><span class="act-title">${esc(e.from)} paid ${esc(e.to)}</span><span class="act-meta">Settlement · ${dt}</span></div>
      <span class="act-amt" style="color:#6EE7B7">${sym()}${fnum(e.amount)}</span>
    </div>`;
    const myShare=(e.shares||[]).find(s=>s.name===me)?.amount||0;
    const iPaid=e.paidBy===me;
    const tag=iPaid?`<span class="act-tag tag-paid">You paid</span>`:myShare>0?`<span class="act-tag tag-owe">You owe ${sym()}${fnum(myShare)}</span>`:'';
    return `<div class="activity-item" style="animation-delay:${i*0.04}s">
      <div class="act-icon">${SECAT[e.category]||'📦'}</div>
      <div class="act-body">
        <span class="act-title">${esc(e.description||e.category)}</span>
        <span class="act-meta">${GRPICON[e.groupType]||''} ${esc(e.groupName||'')} · Paid by ${esc(e.paidBy||'')} · ${dt}</span>
        <div style="margin-top:4px">${tag}</div>
      </div>
      <span class="act-amt">${sym()}${fnum(e.amount)}</span>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════
   NAVIGATION
═══════════════════════════════ */
function switchSection(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(`section-${name}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');
  const titles={overview:'Overview',budget:'Budget Setup',expenses:'Add Expense',split:'Friends & Groups',analytics:'Analytics'};
  document.getElementById('topbarTitle').textContent=titles[name]||'';
  if(name==='analytics'){renderBarChart();renderYearChart();renderProgress();}
  if(name==='expenses') renderAllExpenses();
  if(name==='split'){syncGroupSelects();renderGroupsList();}
  if(name==='budget'&&state.budget) document.getElementById('monthlyBudgetInput').value=state.budget.monthly;
  if(window.innerWidth<=768) closeSidebar();
}
function switchSTab(name){
  document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.stab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelector(`.stab[data-stab="${name}"]`)?.classList.add('active');
  document.getElementById(`stab-${name}`)?.classList.add('active');
  if(name==='balances'){syncGroupSelects();renderBalances();}
  if(name==='activity'){syncGroupSelects();renderActivity();}
  if(name==='addexp') syncGroupSelects();
}

/* ═══════════════════════════════
   EVENTS
═══════════════════════════════ */
function wireEvents(){
  /* nav */
  document.querySelectorAll('.nav-item').forEach(el=>{
    el.addEventListener('click',e=>{e.preventDefault();switchSection(el.dataset.section);});
  });
  document.querySelectorAll('.view-all-btn').forEach(el=>{
    el.addEventListener('click',()=>switchSection(el.dataset.section));
  });
  /* chart tabs */
  document.querySelectorAll('.ctab').forEach(el=>{
    el.addEventListener('click',()=>{
      document.querySelectorAll('.ctab').forEach(b=>b.classList.remove('active'));
      el.classList.add('active'); renderLine(el.dataset.chart);
    });
  });
  /* split top tabs */
  document.querySelectorAll('.stab').forEach(el=>{
    el.addEventListener('click',()=>switchSTab(el.dataset.stab));
  });
  /* group type buttons */
  document.querySelectorAll('[data-grptype]').forEach(el=>{
    el.addEventListener('click',()=>{
      document.querySelectorAll('[data-grptype]').forEach(b=>b.classList.remove('active'));
      el.classList.add('active'); state.selectedGroupType=el.dataset.grptype;
    });
  });
  /* expense category buttons */
  document.querySelectorAll('[data-secat]').forEach(el=>{
    el.addEventListener('click',()=>{
      document.querySelectorAll('[data-secat]').forEach(b=>b.classList.remove('active'));
      el.classList.add('active'); state.selectedSeCategory=el.dataset.secat;
    });
  });
  /* split method buttons */
  document.querySelectorAll('.method-btn').forEach(el=>{
    el.addEventListener('click',()=>{
      document.querySelectorAll('.method-btn').forEach(b=>b.classList.remove('active'));
      el.classList.add('active'); state.selectedSplitMethod=el.dataset.method;
      renderMethodPanel(); updateSplitPreview();
    });
  });
  /* group actions */
  document.getElementById('addMemberBtn').addEventListener('click', addGroupMember);
  document.getElementById('grpMemberInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addGroupMember();}});
  document.getElementById('createGroupBtn').addEventListener('click', createGroup);
  document.getElementById('addGroupExpBtn').addEventListener('click', addGroupExpense);
  /* expense filter */
  document.getElementById('filterCategory').addEventListener('change',e=>renderAllExpenses(e.target.value));
  /* quick add */
  document.getElementById('addExpenseQuick').addEventListener('click',()=>document.getElementById('quickModal').classList.remove('hidden'));
  document.getElementById('quickModalClose').addEventListener('click',()=>{document.getElementById('quickModal').classList.add('hidden');document.getElementById('quickExpenseForm').reset();});
  document.getElementById('quickModal').addEventListener('click',e=>{if(e.target===e.currentTarget){document.getElementById('quickModal').classList.add('hidden');document.getElementById('quickExpenseForm').reset();}});
  /* sidebar */
  document.getElementById('menuBtn').addEventListener('click',openSidebar);
  document.getElementById('sidebarClose').addEventListener('click',closeSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click',closeSidebar);
  /* theme */
  document.getElementById('themeToggle').addEventListener('click',()=>{
    const cur=document.documentElement.getAttribute('data-theme');
    const nxt=cur==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',nxt);
    localStorage.setItem('finia_theme',nxt);
    document.getElementById('themeIcon').textContent=nxt==='dark'?'☀️':'🌙';
  });
  document.querySelectorAll('.theme-dot').forEach(el=>{
    el.addEventListener('click',()=>{
      document.querySelectorAll('.theme-dot').forEach(d=>d.classList.remove('active'));
      el.classList.add('active');
      document.documentElement.setAttribute('data-color-theme',el.dataset.color);
      localStorage.setItem('finia_color',el.dataset.color);
    });
  });
  /* logout */
  document.getElementById('logoutBtn').addEventListener('click',()=>{
    localStorage.removeItem('finia_token'); localStorage.removeItem('finia_user');
    window.location.href='index.html';
  });
}
function openSidebar(){document.getElementById('sidebar').classList.add('open');document.getElementById('sidebarOverlay').classList.add('visible');document.body.style.overflow='hidden';}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebarOverlay').classList.remove('visible');document.body.style.overflow='';}

/* expose for inline handlers */
window.deleteExpense=deleteExpense; window.onGroupSelect=onGroupSelect; window.updateSplitPreview=updateSplitPreview;
window.renderBalances=renderBalances; window.renderActivity=renderActivity; window.markSettled=markSettled;
window.openGroupBalances=openGroupBalances; window.removeGrpMember=removeGrpMember;
window.proceedToCategories=proceedToCategories; window.goBackToStep1=goBackToStep1;
window.saveBudget=saveBudget; window.setCatMode=setCatMode; window.onPctIn=onPctIn; window.onAmtIn=onAmtIn;

/* ═══════════════════════════════════════════════════════════
   NETWORK GRAPH — Force-directed interactive canvas
   Nodes: Budget (center) → Categories → Expenses / Savings
   Features: physics, drag, zoom, pan, hover tooltips,
             click info panel, filter views, fit view
═══════════════════════════════════════════════════════════ */

const NET = {
  canvas: null, ctx: null,
  nodes: [], edges: [],
  // viewport
  scale: 1, offsetX: 0, offsetY: 0,
  // interaction
  dragging: null, dragStartX: 0, dragStartY: 0,
  panning: false, panStartX: 0, panStartY: 0, panOriginX: 0, panOriginY: 0,
  hoveredNode: null, selectedNode: null,
  // physics
  physicsOn: true, animFrame: null,
  // filter
  currentView: 'all',
  // animation
  tick: 0,
};

const NODE_COLORS = {
  budget:        { fill:'#6EE7B7', stroke:'#34D399', glow:'rgba(110,231,183,0.5)' },
  category:      { fill:'#3B82F6', stroke:'#60A5FA', glow:'rgba(59,130,246,0.5)'  },
  expense:       { fill:'#F59E0B', stroke:'#FBBF24', glow:'rgba(245,158,11,0.4)'  },
  savings:       { fill:'#A78BFA', stroke:'#C4B5FD', glow:'rgba(167,139,250,0.5)' },
  overbudget:    { fill:'#EF4444', stroke:'#F87171', glow:'rgba(239,68,68,0.5)'   },
  group:         { fill:'#EC4899', stroke:'#F472B6', glow:'rgba(236,72,153,0.5)'  },
  member:        { fill:'#06B6D4', stroke:'#22D3EE', glow:'rgba(6,182,212,0.5)'   },
  grpexpense:    { fill:'#F97316', stroke:'#FB923C', glow:'rgba(249,115,22,0.4)'   },
};

const CAT_COLORS_NET = {
  savings:'#A78BFA', snacks:'#F59E0B', entertainment:'#EC4899',
  rent:'#3B82F6', bills:'#EF4444', others:'#9CA3AF'
};

/* ─── Build graph from state ─── */
function buildNetworkGraph(viewFilter='all') {
  NET.nodes = []; NET.edges = [];
  const W = NET.canvas.width / NET.scale;
  const H = NET.canvas.height / NET.scale;
  const cx = W / 2, cy = H / 2;

  /* ── BUDGET + CATEGORIES + EXPENSES (left half) ── */
  if (viewFilter !== 'groups') {
    const budget = state.budget?.monthly || 0;
    NET.nodes.push({
      id:'budget', type:'budget', label:'Budget',
      sublabel: sym()+fnum(budget),
      x: cx - (viewFilter==='all'?180:0), y: cy,
      vx:0, vy:0, radius:38, pinned:true,
      data:{ amount:budget }
    });

    const cats = state.budget?.categories || {};
    const catKeys = Object.keys(cats);
    catKeys.forEach((k,i) => {
      const angle = (i/catKeys.length)*Math.PI*2 - Math.PI/2;
      const dist  = 150;
      const bx    = viewFilter==='all' ? cx-180 : cx;
      const spent = state.expenses.filter(e=>e.category===k).reduce((s,e)=>s+e.amount,0);
      const isOver = k!=='savings' && spent>(cats[k]?.amount||0) && cats[k]?.amount>0;
      NET.nodes.push({
        id:'cat_'+k, type:isOver?'overbudget':'category',
        label:cap(k), sublabel:sym()+fnum(cats[k]?.amount||0),
        x:bx+Math.cos(angle)*dist, y:cy+Math.sin(angle)*dist,
        vx:0, vy:0, radius:26, category:k,
        data:{ budget:cats[k]?.amount||0, spent, pct:cats[k]?.amount>0?Math.round(spent/cats[k].amount*100):0 }
      });
      NET.edges.push({ source:'budget', target:'cat_'+k, label:'ALLOCATES', weight:cats[k]?.amount||0, color:null });
    });

    if (viewFilter !== 'budget') {
      const expsBycat = {};
      state.expenses.forEach(e=>{ (expsBycat[e.category]=expsBycat[e.category]||[]).push(e); });
      Object.entries(expsBycat).forEach(([cat, exps]) => {
        const catNode = NET.nodes.find(n=>n.id==='cat_'+cat);
        if (!catNode) return;
        const show = viewFilter==='all'||(viewFilter==='expenses'&&cat!=='savings')||(viewFilter==='savings'&&cat==='savings');
        if (!show) return;
        const limit = Math.min(exps.length, 7);
        for (let i=0;i<limit;i++) {
          const e = exps[i];
          const angle = (i/limit)*Math.PI*2;
          const dist  = 65 + (i%2)*15;
          NET.nodes.push({
            id:'exp_'+e.id, type:e.category==='savings'?'savings':'expense',
            label:e.description||cap(e.category), sublabel:sym()+fnum(e.amount),
            x:catNode.x+Math.cos(angle)*dist, y:catNode.y+Math.sin(angle)*dist,
            vx:(Math.random()-.5)*2, vy:(Math.random()-.5)*2,
            radius:15, category:e.category,
            data:{ amount:e.amount, date:e.date, category:e.category }
          });
          NET.edges.push({ source:'cat_'+cat, target:'exp_'+e.id, label:'CONTAINS', weight:e.amount, color:null });
        }
      });
    }
  }

  /* ── GROUPS + MEMBERS + GROUP EXPENSES (right half) ── */
  if (viewFilter === 'all' || viewFilter === 'groups') {
    const groups = state.groups || [];
    const gOffX  = viewFilter==='all' ? cx+220 : cx;
    const gOffY  = cy;

    groups.forEach((g, gi) => {
      const totalExp = g.expenses.reduce((s,e)=>s+e.amount,0);
      /* Place groups in a vertical column or arc */
      const angle  = groups.length > 1 ? (gi/groups.length)*Math.PI*2 - Math.PI/2 : -Math.PI/2;
      const gDist  = groups.length > 1 ? 160 : 0;
      const gx     = gOffX + Math.cos(angle)*gDist;
      const gy     = gOffY + Math.sin(angle)*gDist;

      NET.nodes.push({
        id:'grp_'+g.id, type:'group',
        label: g.name, sublabel: sym()+fnum(totalExp)+' · '+g.members.length+' members',
        x:gx, y:gy, vx:0, vy:0, radius:32,
        data:{ name:g.name, type:g.type, members:g.members, expenses:g.expenses.length, total:totalExp }
      });

      /* Member nodes orbit the group */
      g.members.forEach((m, mi) => {
        const mAngle = (mi/g.members.length)*Math.PI*2;
        const mDist  = 80;
        NET.nodes.push({
          id:'mbr_'+g.id+'_'+mi, type:'member',
          label: m, sublabel: 'Member',
          x: gx+Math.cos(mAngle)*mDist, y: gy+Math.sin(mAngle)*mDist,
          vx:(Math.random()-.5), vy:(Math.random()-.5), radius:18,
          data:{ name:m, group:g.name }
        });
        NET.edges.push({
          source:'grp_'+g.id, target:'mbr_'+g.id+'_'+mi,
          label:'MEMBER_OF', weight:0, color:'rgba(6,182,212,0.6)'
        });
      });

      /* Group expense nodes */
      const expLimit = Math.min(g.expenses.length, 6);
      g.expenses.slice(0, expLimit).forEach((e, ei) => {
        const eAngle = (ei/expLimit)*Math.PI*2 + Math.PI/4;
        const eDist  = 130;
        NET.nodes.push({
          id:'gexp_'+e.id, type:'grpexpense',
          label: e.description||e.category, sublabel: sym()+fnum(e.amount),
          x: gx+Math.cos(eAngle)*eDist, y: gy+Math.sin(eAngle)*eDist,
          vx:(Math.random()-.5), vy:(Math.random()-.5), radius:14,
          data:{ amount:e.amount, paidBy:e.paidBy, category:e.category, date:e.date, group:g.name }
        });
        NET.edges.push({
          source:'grp_'+g.id, target:'gexp_'+e.id,
          label:'PAID', weight:e.amount, color:'rgba(249,115,22,0.6)'
        });
        /* Edge from payer member to group expense */
        const payerNode = NET.nodes.find(n=>n.id.startsWith('mbr_'+g.id+'_') && n.data?.name===e.paidBy);
        if (payerNode) {
          NET.edges.push({
            source:payerNode.id, target:'gexp_'+e.id,
            label:'PAID_BY', weight:0, color:'rgba(236,72,153,0.5)'
          });
        }
      });

      /* If "all" view: connect group to budget node */
      if (viewFilter==='all' && NET.nodes.find(n=>n.id==='budget')) {
        NET.edges.push({
          source:'budget', target:'grp_'+g.id,
          label:'TRACKS', weight:0, color:'rgba(110,231,183,0.25)'
        });
      }
    });

    /* If no groups yet, show hint node */
    if (!groups.length) {
      NET.nodes.push({
        id:'no_groups', type:'member',
        label:'No groups yet', sublabel:'Create a group!',
        x:gOffX, y:gOffY, vx:0, vy:0, radius:22,
        data:{}
      });
    }
  }
}

/* ─── Physics simulation (force-directed) ─── */
function tickPhysics() {
  if (!NET.physicsOn) return;
  const nodes = NET.nodes, edges = NET.edges;
  const repulsion = 3500, attraction = 0.03, damping = 0.85, centerPull = 0.005;
  const W = NET.canvas.width, H = NET.canvas.height;
  const cx = W/2/NET.scale - NET.offsetX/NET.scale;
  const cy = H/2/NET.scale - NET.offsetY/NET.scale;

  /* Repulsion between all node pairs */
  for (let i=0;i<nodes.length;i++) {
    for (let j=i+1;j<nodes.length;j++) {
      const a=nodes[i], b=nodes[j];
      const dx=b.x-a.x, dy=b.y-a.y;
      const dist=Math.sqrt(dx*dx+dy*dy)||1;
      const minDist=a.radius+b.radius+40;
      if (dist < minDist*3) {
        const force = repulsion/(dist*dist);
        const nx=dx/dist, ny=dy/dist;
        if (!a.pinned){a.vx-=nx*force;a.vy-=ny*force;}
        if (!b.pinned){b.vx+=nx*force;b.vy+=ny*force;}
      }
    }
  }

  /* Attraction along edges */
  edges.forEach(e=>{
    const a=nodes.find(n=>n.id===e.source);
    const b=nodes.find(n=>n.id===e.target);
    if (!a||!b) return;
    const dx=b.x-a.x, dy=b.y-a.y;
    const dist=Math.sqrt(dx*dx+dy*dy)||1;
    const ideal = a.radius+b.radius+60;
    const force=(dist-ideal)*attraction;
    const nx=dx/dist, ny=dy/dist;
    if (!a.pinned){a.vx+=nx*force;a.vy+=ny*force;}
    if (!b.pinned){b.vx-=nx*force;b.vy-=ny*force;}
  });

  /* Center gravity */
  nodes.forEach(n=>{
    if (n.pinned) return;
    n.vx += (cx-n.x)*centerPull;
    n.vy += (cy-n.y)*centerPull;
    n.vx*=damping; n.vy*=damping;
    n.x+=n.vx; n.y+=n.vy;
  });
}

/* ─── Drawing ─── */
function drawNetwork() {
  const canvas=NET.canvas, ctx=NET.ctx;
  if (!canvas||!ctx) return;

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.translate(NET.offsetX, NET.offsetY);
  ctx.scale(NET.scale, NET.scale);

  NET.tick++;

  /* Draw edges first */
  NET.edges.forEach(e=>{
    const a=NET.nodes.find(n=>n.id===e.source);
    const b=NET.nodes.find(n=>n.id===e.target);
    if (!a||!b) return;

    const isDark = document.documentElement.getAttribute('data-theme')==='dark';
    const alpha = NET.hoveredNode && (NET.hoveredNode.id===e.source||NET.hoveredNode.id===e.target) ? 0.9 : 0.3;

    ctx.beginPath();
    ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
    const baseColor = e.color || (isDark ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`);
    ctx.strokeStyle = NET.hoveredNode && (NET.hoveredNode.id===e.source||NET.hoveredNode.id===e.target)
      ? (e.color ? e.color.replace(/[\d.]+\)$/, '0.95)') : (isDark?'rgba(255,255,255,0.9)':'rgba(0,0,0,0.9)'))
      : baseColor;
    ctx.lineWidth = NET.hoveredNode && (NET.hoveredNode.id===e.source||NET.hoveredNode.id===e.target) ? 2.5 : 1.5;
    ctx.stroke();

    /* Edge label */
    if (NET.scale > 0.6) {
      const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
      ctx.fillStyle = isDark ? 'rgba(156,163,175,0.8)' : 'rgba(100,100,100,0.8)';
      ctx.font = `${10/NET.scale}px DM Sans`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(e.label, mx, my-8);
    }

    /* Animated flow particles along edges */
    if (NET.physicsOn && NET.scale > 0.5) {
      const t = ((NET.tick * 0.015) % 1);
      const px = a.x + (b.x-a.x)*t, py = a.y + (b.y-a.y)*t;
      ctx.beginPath();
      ctx.arc(px, py, 3/NET.scale, 0, Math.PI*2);
      ctx.fillStyle = NODE_COLORS[a.type]?.fill || '#6EE7B7';
      ctx.globalAlpha=0.7; ctx.fill(); ctx.globalAlpha=1;
    }
  });

  /* Draw nodes */
  NET.nodes.forEach(n=>{
    const c = NODE_COLORS[n.type] || NODE_COLORS.expense;
    const isHov = NET.hoveredNode?.id === n.id;
    const isSel = NET.selectedNode?.id === n.id;
    const pulse = isSel ? Math.sin(NET.tick*0.1)*3 : 0;
    const r = n.radius + pulse + (isHov?4:0);

    /* Glow */
    if (isHov || isSel) {
      const grad = ctx.createRadialGradient(n.x,n.y,r*0.5,n.x,n.y,r*2.5);
      grad.addColorStop(0, c.glow);
      grad.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(n.x,n.y,r*2.5,0,Math.PI*2);
      ctx.fillStyle=grad; ctx.fill();
    }

    /* Shadow ring for selected */
    if (isSel) {
      ctx.beginPath(); ctx.arc(n.x,n.y,r+6,0,Math.PI*2);
      ctx.strokeStyle=c.fill; ctx.lineWidth=2.5; ctx.stroke();
    }

    /* Main circle */
    const grad2 = ctx.createRadialGradient(n.x-r*0.3,n.y-r*0.3,r*0.1,n.x,n.y,r);
    grad2.addColorStop(0, lighten(c.fill, 0.3));
    grad2.addColorStop(1, c.fill);
    ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2);
    ctx.fillStyle=grad2; ctx.fill();
    ctx.strokeStyle=c.stroke; ctx.lineWidth=isHov?2.5:1.5; ctx.stroke();

    /* Label */
    const fontSize = n.type==='budget' ? Math.max(11,14/NET.scale) : Math.max(8,10/NET.scale);
    ctx.fillStyle='#fff';
    ctx.font=`bold ${fontSize}px Syne`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const shortLabel = n.label.length>10 ? n.label.slice(0,9)+'…' : n.label;
    ctx.fillText(shortLabel, n.x, n.y - (n.radius>20?4:0));

    if (n.radius>20 && NET.scale>0.4) {
      ctx.font=`${Math.max(8,9/NET.scale)}px DM Sans`;
      ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.fillText(n.sublabel, n.x, n.y+10);
    }
  });

  ctx.restore();
  NET.animFrame = requestAnimationFrame(()=>{
    tickPhysics();
    drawNetwork();
  });
}

function lighten(hex, amt) {
  const n=parseInt(hex.slice(1),16);
  const r=Math.min(255,((n>>16)&255)+Math.round(amt*255));
  const g=Math.min(255,((n>>8)&255)+Math.round(amt*255));
  const b=Math.min(255,(n&255)+Math.round(amt*255));
  return `rgb(${r},${g},${b})`;
}

/* ─── Hit test ─── */
function nodeAtPoint(cx,cy) {
  const wx=(cx-NET.offsetX)/NET.scale, wy=(cy-NET.offsetY)/NET.scale;
  for (let i=NET.nodes.length-1;i>=0;i--) {
    const n=NET.nodes[i];
    const dx=wx-n.x, dy=wy-n.y;
    if (dx*dx+dy*dy <= (n.radius+4)*(n.radius+4)) return n;
  }
  return null;
}

/* ─── Tooltip ─── */
function showNetTooltip(node, cx, cy) {
  const tip=document.getElementById('netTooltip');
  if (!tip) return;
  let html='';
  if (node.type==='budget')   html=`<strong>Monthly Budget</strong><br>${sym()}${fnum(node.data.amount)}`;
  else if (node.type==='category'||node.type==='overbudget') html=`<strong>${node.label}</strong><br>Budget: ${sym()}${fnum(node.data.budget)}<br>Spent: ${sym()}${fnum(node.data.spent)}<br>${node.data.pct}% used${node.type==='overbudget'?'<br><span style="color:#FCA5A5">⚠️ Over budget!</span>':''}`;
  else html=`<strong>${node.label}</strong><br>${sym()}${fnum(node.data.amount)}<br>${cap(node.data.category)}<br>${new Date(node.data.date).toLocaleDateString()}`;
  tip.innerHTML=html;
  tip.style.left=(cx+14)+'px'; tip.style.top=(cy-10)+'px';
  tip.classList.remove('hidden');
}

/* ─── Info panel ─── */
function showNetInfo(node) {
  NET.selectedNode=node;
  const panel=document.getElementById('netInfoPanel');
  const content=document.getElementById('netInfoContent');
  if (!panel||!content) return;
  let html='';
  const icon={budget:'💰',category:'📁',overbudget:'⚠️',expense:'💸',savings:'🎯'}[node.type]||'📦';
  if (node.type==='budget') {
    const sp=spent(), sv=saved();
    html=`<div class="ni-icon">${icon}</div><div class="ni-title">${node.label}</div>
    <div class="ni-row"><span>Total Budget</span><strong>${sym()}${fnum(node.data.amount)}</strong></div>
    <div class="ni-row"><span>Spent</span><strong style="color:#FCA5A5">${sym()}${fnum(sp)}</strong></div>
    <div class="ni-row"><span>Saved</span><strong style="color:#6EE7B7">${sym()}${fnum(sv)}</strong></div>
    <div class="ni-row"><span>Remaining</span><strong style="color:#60A5FA">${sym()}${fnum(Math.max(node.data.amount-sp,0))}</strong></div>
    <div class="ni-row"><span>Expenses</span><strong>${state.expenses.filter(e=>!isSaving(e)).length}</strong></div>`;
  } else if (node.type==='category'||node.type==='overbudget') {
    const exps=state.expenses.filter(e=>e.category===node.category);
    html=`<div class="ni-icon">${icon}</div><div class="ni-title">${node.label}</div>
    <div class="ni-row"><span>Budget</span><strong>${sym()}${fnum(node.data.budget)}</strong></div>
    <div class="ni-row"><span>Spent</span><strong>${sym()}${fnum(node.data.spent)}</strong></div>
    <div class="ni-row"><span>Used</span><strong style="color:${node.data.pct>=100?'#FCA5A5':'#6EE7B7'}">${node.data.pct}%</strong></div>
    <div class="ni-row"><span>Transactions</span><strong>${exps.length}</strong></div>
    ${node.type==='overbudget'?'<div class="ni-warn">⚠️ Over budget!</div>':''}`;
  } else {
    html=`<div class="ni-icon">${icon}</div><div class="ni-title">${node.label}</div>
    <div class="ni-row"><span>Amount</span><strong>${sym()}${fnum(node.data.amount)}</strong></div>
    <div class="ni-row"><span>Category</span><strong>${cap(node.data.category)}</strong></div>
    <div class="ni-row"><span>Date</span><strong>${new Date(node.data.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</strong></div>`;
  }
  content.innerHTML=html;
  panel.classList.remove('hidden');
}

/* ─── Mini stats bar ─── */
function updateMiniStats() {
  const el=document.getElementById('netMiniStats');
  if (!el) return;
  el.innerHTML=`
    <span class="mstat"><span class="mstat-dot" style="background:#6EE7B7"></span>${NET.nodes.filter(n=>n.type==='budget').length} Budget</span>
    <span class="mstat"><span class="mstat-dot" style="background:#3B82F6"></span>${NET.nodes.filter(n=>n.type==='category'||n.type==='overbudget').length} Categories</span>
    <span class="mstat"><span class="mstat-dot" style="background:#F59E0B"></span>${NET.nodes.filter(n=>n.type==='expense').length} Expenses</span>
    <span class="mstat"><span class="mstat-dot" style="background:#EC4899"></span>${NET.nodes.filter(n=>n.type==='group').length} Groups</span>
    <span class="mstat"><span class="mstat-dot" style="background:#06B6D4"></span>${NET.nodes.filter(n=>n.type==='member').length} Members</span>
    <span class="mstat"><span class="mstat-dot" style="background:#9CA3AF"></span>${NET.edges.length} Links</span>
  `;
}

/* ─── Fit view ─── */
function netFitView() {
  if (!NET.nodes.length) return;
  const canvas=NET.canvas;
  const pad=60;
  const xs=NET.nodes.map(n=>n.x), ys=NET.nodes.map(n=>n.y);
  const minX=Math.min(...xs)-pad, maxX=Math.max(...xs)+pad;
  const minY=Math.min(...ys)-pad, maxY=Math.max(...ys)+pad;
  const scaleX=canvas.width/(maxX-minX), scaleY=canvas.height/(maxY-minY);
  NET.scale=Math.min(scaleX,scaleY,1.5);
  NET.offsetX=-minX*NET.scale+(canvas.width-(maxX-minX)*NET.scale)/2;
  NET.offsetY=-minY*NET.scale+(canvas.height-(maxY-minY)*NET.scale)/2;
}

/* ─── Init network ─── */
function initNetwork() {
  NET.canvas=document.getElementById('networkCanvas');
  if (!NET.canvas) return;
  NET.ctx=NET.canvas.getContext('2d');
  resizeNetCanvas();
  buildNetworkGraph('all');
  netFitView();
  updateMiniStats();

  /* Resize */
  window.addEventListener('resize', ()=>{resizeNetCanvas();netFitView();});

  /* Mouse events */
  NET.canvas.addEventListener('mousedown', onNetMouseDown);
  NET.canvas.addEventListener('mousemove', onNetMouseMove);
  NET.canvas.addEventListener('mouseup',   onNetMouseUp);
  NET.canvas.addEventListener('mouseleave',()=>{NET.panning=false;NET.dragging=null;document.getElementById('netTooltip')?.classList.add('hidden');});
  NET.canvas.addEventListener('wheel',     onNetWheel, {passive:false});
  NET.canvas.addEventListener('dblclick',  onNetDblClick);

  /* Touch */
  NET.canvas.addEventListener('touchstart', onNetTouchStart, {passive:false});
  NET.canvas.addEventListener('touchmove',  onNetTouchMove,  {passive:false});
  NET.canvas.addEventListener('touchend',   ()=>{NET.dragging=null;});

  /* Control buttons */
  document.getElementById('netViewAll')?.addEventListener('click',()=>{ setNetView('all'); });
  document.getElementById('netViewBudget')?.addEventListener('click',()=>{ setNetView('budget'); });
  document.getElementById('netViewExpenses')?.addEventListener('click',()=>{ setNetView('expenses'); });
  document.getElementById('netViewSavings')?.addEventListener('click',()=>{ setNetView('savings'); });
  document.getElementById('netViewGroups')?.addEventListener('click',()=>{ setNetView('groups'); });
  document.getElementById('netPhysics')?.addEventListener('click', togglePhysics);
  document.getElementById('netFitBtn')?.addEventListener('click',  netFitView);
  document.getElementById('netResetBtn')?.addEventListener('click', ()=>{
    NET.scale=1;NET.offsetX=0;NET.offsetY=0;
    buildNetworkGraph(NET.currentView); netFitView(); updateMiniStats();
    NET.selectedNode=null; document.getElementById('netInfoPanel')?.classList.add('hidden');
  });
  document.getElementById('netInfoClose')?.addEventListener('click',()=>{
    document.getElementById('netInfoPanel')?.classList.add('hidden'); NET.selectedNode=null;
  });

  if (NET.animFrame) cancelAnimationFrame(NET.animFrame);
  drawNetwork();
}

function resizeNetCanvas() {
  const wrap=NET.canvas?.parentElement;
  if (!wrap||!NET.canvas) return;
  NET.canvas.width  = wrap.clientWidth;
  NET.canvas.height = Math.max(520, wrap.clientHeight);
}

function setNetView(view) {
  NET.currentView=view;
  document.querySelectorAll('.net-btn').forEach(b=>{
    if (['netViewAll','netViewBudget','netViewExpenses','netViewSavings','netViewGroups'].includes(b.id))
      b.classList.toggle('active', b.id==='netView'+cap(view));
  });
  buildNetworkGraph(view);
  netFitView(); updateMiniStats();
  NET.selectedNode=null; document.getElementById('netInfoPanel')?.classList.add('hidden');
}

function togglePhysics() {
  NET.physicsOn=!NET.physicsOn;
  const btn=document.getElementById('netPhysics');
  if (btn) { btn.textContent=NET.physicsOn?'⚡ Physics On':'⚡ Physics Off'; btn.classList.toggle('active',NET.physicsOn); }
}

/* ─── Mouse handlers ─── */
function onNetMouseDown(e) {
  const rect=NET.canvas.getBoundingClientRect();
  const cx=e.clientX-rect.left, cy=e.clientY-rect.top;
  const hit=nodeAtPoint(cx,cy);
  if (hit) {
    NET.dragging=hit; NET.dragStartX=cx; NET.dragStartY=cy;
    hit.pinned=true; hit.vx=0; hit.vy=0;
    NET.canvas.style.cursor='grabbing';
  } else {
    NET.panning=true;
    NET.panStartX=cx; NET.panStartY=cy;
    NET.panOriginX=NET.offsetX; NET.panOriginY=NET.offsetY;
    NET.canvas.style.cursor='move';
  }
}
function onNetMouseMove(e) {
  const rect=NET.canvas.getBoundingClientRect();
  const cx=e.clientX-rect.left, cy=e.clientY-rect.top;
  if (NET.dragging) {
    const dx=(cx-NET.dragStartX)/NET.scale, dy=(cy-NET.dragStartY)/NET.scale;
    NET.dragging.x+=dx; NET.dragging.y+=dy;
    NET.dragStartX=cx; NET.dragStartY=cy;
    return;
  }
  if (NET.panning) {
    NET.offsetX=NET.panOriginX+(cx-NET.panStartX);
    NET.offsetY=NET.panOriginY+(cy-NET.panStartY);
    return;
  }
  const hit=nodeAtPoint(cx,cy);
  NET.hoveredNode=hit;
  NET.canvas.style.cursor=hit?'pointer':'default';
  const tip=document.getElementById('netTooltip');
  if (hit) showNetTooltip(hit,cx,cy);
  else tip?.classList.add('hidden');
}
function onNetMouseUp(e) {
  const rect=NET.canvas.getBoundingClientRect();
  const cx=e.clientX-rect.left, cy=e.clientY-rect.top;
  if (NET.dragging) {
    /* If barely moved = click */
    const moved=Math.abs(cx-NET.dragStartX)+Math.abs(cy-NET.dragStartY);
    if (moved<5) { showNetInfo(NET.dragging); }
    else { NET.dragging.pinned = NET.dragging.type==='budget'; }
    NET.dragging=null; NET.canvas.style.cursor='default'; return;
  }
  NET.panning=false; NET.canvas.style.cursor='default';
}
function onNetDblClick(e) {
  /* Double-click to re-home a node */
  const rect=NET.canvas.getBoundingClientRect();
  const hit=nodeAtPoint(e.clientX-rect.left,e.clientY-rect.top);
  if (hit) { hit.vx=(Math.random()-.5)*10; hit.vy=(Math.random()-.5)*10; hit.pinned=false; }
}
function onNetWheel(e) {
  e.preventDefault();
  const rect=NET.canvas.getBoundingClientRect();
  const cx=e.clientX-rect.left, cy=e.clientY-rect.top;
  const delta=e.deltaY>0?0.9:1.11;
  const newScale=Math.max(0.2, Math.min(4, NET.scale*delta));
  NET.offsetX=cx-(cx-NET.offsetX)*(newScale/NET.scale);
  NET.offsetY=cy-(cy-NET.offsetY)*(newScale/NET.scale);
  NET.scale=newScale;
}
function onNetTouchStart(e) {
  e.preventDefault();
  const t=e.touches[0], rect=NET.canvas.getBoundingClientRect();
  const cx=t.clientX-rect.left, cy=t.clientY-rect.top;
  const hit=nodeAtPoint(cx,cy);
  if (hit){NET.dragging=hit;NET.dragStartX=cx;NET.dragStartY=cy;hit.pinned=true;}
  else{NET.panning=true;NET.panStartX=cx;NET.panStartY=cy;NET.panOriginX=NET.offsetX;NET.panOriginY=NET.offsetY;}
}
function onNetTouchMove(e) {
  e.preventDefault();
  const t=e.touches[0], rect=NET.canvas.getBoundingClientRect();
  const cx=t.clientX-rect.left, cy=t.clientY-rect.top;
  if (NET.dragging){const dx=(cx-NET.dragStartX)/NET.scale,dy=(cy-NET.dragStartY)/NET.scale;NET.dragging.x+=dx;NET.dragging.y+=dy;NET.dragStartX=cx;NET.dragStartY=cy;}
  else if (NET.panning){NET.offsetX=NET.panOriginX+(cx-NET.panStartX);NET.offsetY=NET.panOriginY+(cy-NET.panStartY);}
}

/* ─── Hook into switchSection ─── */
const _origSwitch = switchSection;
window.switchSection = function(name) {
  _origSwitch(name);
  if (name==='network') {
    setTimeout(()=>{
      if (!NET.canvas) initNetwork();
      else { buildNetworkGraph(NET.currentView); resizeNetCanvas(); netFitView(); updateMiniStats(); }
    }, 80);
  }
};