let APP = document.querySelector('#app');
const MODAL = document.querySelector('#modal');
const IMPORT_FILE = document.querySelector('#import-file');
const VAULT_KEY = 'mi-control-streaming-vault-v1';
const DEFAULT_SERVICES = ['HBO Max', 'Disney+', 'Prime Video', 'Netflix', 'Spotify'];
let data = null;
let cryptoKey = null;
let currentView = 'inicio';
let accountFilter = 'Todos';
let chargeStatusFilter = 'pendiente';
let chargeDayFilter = 'todos';
let revealedPasswords = new Set();

const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
  accounts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.3"/><path d="M3 20v-1.4a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5V20M16 5.2a3.3 3.3 0 0 1 0 6.4m2 2.3a5 5 0 0 1 3 4.6V20"/></svg>',
  bills: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="12" cy="12" r="3"/><path d="M6 9H5m14 6h-1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 4.9c0-.75.82-1.22 1.47-.84l11.3 6.65a1.5 1.5 0 0 1 0 2.58l-11.3 6.65A.98.98 0 0 1 6 19.1V4.9Z" fill="currentColor"/></svg>'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
function money(value) {
  return new Intl.NumberFormat('es-MX', { style:'currency', currency:data?.currency || 'MXN', maximumFractionDigits:2 }).format(Number(value) || 0);
}
function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}
function monthDate(month) {
  const [year, index] = String(month).split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (index || 1)-1, 1);
}
function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function nextMonth(month) {
  const date = monthDate(month); date.setMonth(date.getMonth()+1); return monthKey(date);
}
function monthName(month) {
  return monthDate(month).toLocaleDateString('es-MX', { month:'long', year:'numeric' });
}
function defaultDueDay(service) { return /spotify/i.test(String(service || '')) ? 11 : 15; }
function normalizeDueDay(value, service) { const day = Number(value); return [11,15,30].includes(day) ? day : defaultDueDay(service); }
function makeLegacyProfiles(rawAccounts, accounts) {
  const mapped = new Map(accounts.map(account => [account.id,account]));
  return rawAccounts.flatMap(raw => {
    const accountId = String(raw.id || '');
    const account = mapped.get(accountId);
    if (!account || !Array.isArray(raw.profiles)) return [];
    return raw.profiles.map(profile => ({
      id:uid(), name:String(profile.name || 'Perfil'),
      links:[{ id:uid(), accountId, amount:Number(profile.amount)||0, dueDay:normalizeDueDay(profile.dueDay,account.service), startMonth:currentMonth() }]
    }));
  });
}
function cleanData(value) {
  if (!value || !Array.isArray(value.accounts)) throw new Error('El respaldo no contiene cuentas válidas.');
  const rawAccounts = value.accounts;
  const accounts = rawAccounts.map(account => ({
    id:String(account.id || uid()), service:String(account.service || 'Otro'), label:String(account.label || account.alias || account.email || account.service || 'Cuenta'),
    email:String(account.email || ''), password:String(account.password || ''), limit:Math.max(1,Number(account.limit)||1),
    monthlyCost:Number(account.monthlyCost ?? account.cost)||0, expenseId:account.expenseId ? String(account.expenseId) : null
  }));
  const accountById = new Map(accounts.map(account => [account.id,account]));
  let profiles;
  if (Array.isArray(value.profiles)) {
    profiles = value.profiles.map(profile => ({
      id:String(profile.id || uid()), name:String(profile.name || 'Perfil'),
      links:(Array.isArray(profile.links) ? profile.links : Array.isArray(profile.accesses) ? profile.accesses : []).map(link => {
        const account = accountById.get(String(link.accountId));
        return {
          id:String(link.id || uid()), accountId:String(link.accountId || ''), amount:Number(link.amount ?? link.charge)||0,
          dueDay:normalizeDueDay(link.dueDay,account?.service), startMonth:/^\d{4}-\d{2}$/.test(link.startMonth || '') ? link.startMonth : currentMonth()
        };
      })
    }));
  } else profiles = makeLegacyProfiles(rawAccounts,accounts);

  const expenses = Array.isArray(value.expenses) ? value.expenses.map(expense => ({
    id:String(expense.id || uid()), name:String(expense.name || 'Costo mensual'), amount:Number(expense.amount)||0,
    services:[...new Set((Array.isArray(expense.services) ? expense.services : expense.service ? [expense.service] : []).map(String))],
    accountIds:(Array.isArray(expense.accountIds) ? expense.accountIds : expense.accountId ? [expense.accountId] : []).map(String).filter(id => accountById.has(id)),
    bundle:Boolean(expense.bundle || expense.type === 'bundle')
  })) : [];
  for (const account of accounts) {
    if (account.monthlyCost <= 0) continue;
    const existing = expenses.find(expense => expense.id === account.expenseId || (!expense.bundle && expense.accountIds.includes(account.id)));
    if (existing) { account.expenseId = existing.id; continue; }
    const id = uid(); account.expenseId = id;
    expenses.push({ id, name:`${account.service} · ${account.label}`, amount:account.monthlyCost, services:[account.service], accountIds:[account.id], bundle:false });
  }
  const charges = (Array.isArray(value.charges) ? value.charges : []).map(charge => ({
    id:String(charge.id || uid()), linkId:String(charge.linkId || ''), profileId:String(charge.profileId || ''), profileName:String(charge.profileName || 'Perfil'),
    accountId:String(charge.accountId || ''), accountLabel:String(charge.accountLabel || charge.email || ''), accountEmail:String(charge.accountEmail || accountById.get(String(charge.accountId||''))?.email || ''), service:String(charge.service || 'Servicio'),
    amount:Number(charge.amount)||0, dueDay:normalizeDueDay(charge.dueDay,charge.service), month:/^\d{4}-\d{2}$/.test(charge.month || '') ? charge.month : currentMonth(),
    status:charge.status === 'paid' ? 'paid' : 'pending', paidAt:charge.paidAt || null
  }));
  const services = [...new Set([...(Array.isArray(value.services) ? value.services.map(String) : []), ...DEFAULT_SERVICES,
    ...accounts.map(account => account.service), ...expenses.flatMap(expense => expense.services)])];
  return { currency:value.currency || 'MXN', services, accounts, profiles, expenses, charges };
}
function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function unb64(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
async function deriveKey(passphrase,salt) {
  const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encryptAndSave() {
  const prior = JSON.parse(localStorage.getItem(VAULT_KEY));
  const salt = unb64(prior.salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,new TextEncoder().encode(JSON.stringify(data)));
  localStorage.setItem(VAULT_KEY,JSON.stringify({version:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext)}));
}
async function unlockWith(passphrase) {
  const envelope = JSON.parse(localStorage.getItem(VAULT_KEY));
  const key = await deriveKey(passphrase,unb64(envelope.salt));
  const clear = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv)},key,unb64(envelope.ciphertext));
  cryptoKey = key; data = cleanData(JSON.parse(new TextDecoder().decode(clear)));
  const changed = syncMonthlyCharges();
  if (changed) await encryptAndSave();
}
function formatError(error) {
  if (error?.name === 'OperationError') return 'La clave no es correcta o el archivo está dañado.';
  return error?.message || 'No se pudo completar la operación.';
}
function showAuth(message='') {
  const exists = Boolean(localStorage.getItem(VAULT_KEY));
  const secure = Boolean(globalThis.crypto?.subtle);
  APP.outerHTML = `<main id="app" class="auth-shell"><section class="auth-card">
    <div class="brand"><div class="brand-mark">${icons.play}</div><div><h1>Mi control de streaming</h1><p>Tu panel privado de cuentas</p></div></div>
    <p class="eyebrow">${exists ? 'Bienvenido de vuelta' : 'Configura tu espacio'}</p><h2>${exists ? 'Desbloquea tu panel' : 'Crea tu clave maestra'}</h2>
    <p>${exists ? 'Ingresa tu clave maestra para ver cuentas, perfiles y cobros.' : 'Elige una clave para cifrar tus datos en este dispositivo. La necesitarás cada vez que abras el panel.'}</p>
    ${!secure ? '<div class="message error">El cifrado requiere abrir la aplicación desde una dirección HTTPS segura.</div>' : ''}
    ${message ? `<div class="message error">${escapeHtml(message)}</div>` : ''}
    <form id="auth-form"><div class="field"><label for="master-pass">Clave maestra</label><input id="master-pass" name="password" type="password" minlength="8" autocomplete="${exists?'current-password':'new-password'}" required placeholder="Mínimo 8 caracteres"></div>
      ${exists ? '' : '<div class="field"><label for="confirm-pass">Confirma tu clave</label><input id="confirm-pass" name="confirm" type="password" minlength="8" autocomplete="new-password" required placeholder="Escríbela otra vez"></div>'}
      <button class="button" type="submit" ${secure?'':'disabled'}>${exists?'Desbloquear':'Crear panel'}</button></form>
    <p class="auth-foot">Los datos se cifran en este dispositivo. La clave maestra no se puede recuperar. Conserva una copia del respaldo cifrado.</p></section></main>`;
  APP = document.querySelector('#app');
  document.querySelector('#auth-form').addEventListener('submit',async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const password = String(form.get('password'));
    try {
      if (exists) await unlockWith(password);
      else {
        if (password !== form.get('confirm')) throw new Error('Las claves no coinciden.');
        if (password.length < 8) throw new Error('Usa al menos 8 caracteres.');
        const salt = crypto.getRandomValues(new Uint8Array(16)); cryptoKey = await deriveKey(password,salt);
        data = {currency:'MXN',services:[...DEFAULT_SERVICES],accounts:[],profiles:[],expenses:[],charges:[]};
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,new TextEncoder().encode(JSON.stringify(data)));
        localStorage.setItem(VAULT_KEY,JSON.stringify({version:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext)}));
      }
      currentView='inicio'; render();
    } catch (error) { showAuth(formatError(error)); }
  });
}

function accessCount(accountId, excludingProfileId='') {
  return data.profiles.filter(profile => profile.id !== excludingProfileId).reduce((sum,profile) => sum + profile.links.filter(link => link.accountId === accountId).length,0);
}
function accountLabel(account) {
  return `${account.service} · ${account.label}${account.email && account.email !== account.label ? ` (${account.email})` : ''}`;
}
function suggestedAccountLabel(service) {
  const count=data.accounts.filter(account=>account.service.toLowerCase()===String(service||'').trim().toLowerCase()).length;
  return `${String(service||'Cuenta').trim()} cuenta ${count+1}`;
}
function accountOptions(selectedId='',excludingProfileId='') {
  return data.accounts.map(account => {
    const selected = account.id === selectedId;
    const full = !selected && accessCount(account.id,excludingProfileId) >= account.limit;
    return `<option value="${escapeHtml(account.id)}" ${selected?'selected':''} ${full?'disabled':''}>${escapeHtml(accountLabel(account))}${full?' · lleno':''}</option>`;
  }).join('');
}
function syncMonthlyCharges() {
  let changed = false;
  const thisMonth = currentMonth();
  const existing = new Map(data.charges.map(charge => [`${charge.linkId}:${charge.month}`,charge]));
  for (const profile of data.profiles) for (const link of profile.links) {
    const account = data.accounts.find(item => item.id === link.accountId);
    if (!account) continue;
    let month = link.startMonth || thisMonth;
    let guard = 0;
    while (month <= thisMonth && guard++ < 120) {
      const id = `${link.id}:${month}`;
      let charge = existing.get(id);
      if (!charge) {
        charge = {id,linkId:link.id,profileId:profile.id,profileName:profile.name,accountId:account.id,accountLabel:account.label,accountEmail:account.email,service:account.service,amount:link.amount,dueDay:link.dueDay,month,status:'pending',paidAt:null};
        data.charges.push(charge); existing.set(id,charge); changed = true;
      } else if (charge.status === 'pending') {
        const next = {profileName:profile.name};
        if (month === thisMonth) Object.assign(next,{accountId:account.id,accountLabel:account.label,accountEmail:account.email,service:account.service,amount:link.amount,dueDay:link.dueDay});
        if (Object.entries(next).some(([key,value]) => charge[key] !== value)) { Object.assign(charge,next); changed = true; }
      }
      month = nextMonth(month);
    }
  }
  return changed;
}
function expenseIsStandalone(expense) {
  if (expense.bundle) return false;
  const packagedAccounts=new Set(data.expenses.filter(item=>item.bundle).flatMap(item=>item.accountIds));
  return !expense.accountIds.some(accountId=>packagedAccounts.has(accountId));
}
function totalExpenses() { return data.expenses.filter(expense=>expense.bundle||expenseIsStandalone(expense)).reduce((sum,expense)=>sum+expense.amount,0); }
function chargeTotals(charges=data.charges) {
  const current = currentMonth();
  return charges.reduce((sum,charge) => {
    if (charge.month === current) sum.expected += charge.amount;
    if (charge.status === 'pending') sum.pending += charge.amount;
    if (charge.month === current && charge.status === 'paid') sum.paid += charge.amount;
    return sum;
  },{expected:0,pending:0,paid:0});
}
function serviceBadge(name) {
  const text=String(name).toLowerCase(); const short=text.includes('disney')?'D+':text.includes('prime')?'P':text.includes('netflix')?'N':text.includes('spotify')?'S':text.includes('hbo')?'H':text.slice(0,2).toUpperCase();
  return `<span class="service-logo" aria-hidden="true">${escapeHtml(short)}</span>`;
}
function topbar() {
  return `<header class="topbar"><div class="brand"><div class="brand-mark">${icons.play}</div><div><h1>Mi control de streaming</h1><p>Panel privado · ${escapeHtml(data.currency)}</p></div></div><button class="icon-button" data-action="lock" aria-label="Bloquear panel" title="Bloquear panel">${icons.lock}</button></header>`;
}
const VIEWS=[['inicio','Inicio',icons.home],['cuentas','Cuentas',icons.accounts],['perfiles','Perfiles',icons.people],['cobros','Cobros',icons.bills],['dinero','Dinero',icons.money]];
function nav() {
  return `<nav class="bottom-nav" aria-label="Secciones">${VIEWS.map(([id,label,icon])=>`<button class="nav-button ${currentView===id?'active':''}" data-view="${id}">${icon}<span>${label}</span>${id==='cobros'&&data.charges.some(charge=>charge.status==='pending')?'<i class="nav-dot"></i>':''}</button>`).join('')}</nav>`;
}
function statCard(title,value,note,featured=false) {
  return `<article class="stat-card ${featured?'featured':''}"><div class="stat-label"><span class="stat-dot"></span>${title}</div><div class="stat-value">${value}</div><p class="stat-note">${note}</p></article>`;
}
function emptyState(title,body,action='') {
  return `<div class="empty-state"><div class="empty-icon">${icons.play}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>${action?`<button class="button" data-action="${action}">${icons.plus}${action==='new-account'?'Agregar cuenta':action==='new-profile'?'Agregar perfil':action==='new-expense'?'Agregar promoción':'Agregar'}</button>`:''}</div>`;
}
function dueDateFor(charge) {
  const first=monthDate(charge.month); const last=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  return new Date(first.getFullYear(),first.getMonth(),Math.min(charge.dueDay,last));
}
function chargeIsOverdue(charge) {
  if (charge.status==='paid') return false;
  const today=new Date(); today.setHours(0,0,0,0);
  return dueDateFor(charge)<today;
}
function chargeCard(charge,showAction=true) {
  const paid=charge.status==='paid';
  const marker=paid?'<span class="status-chip paid">Pagado</span>':chargeIsOverdue(charge)?'<span class="status-chip overdue">Vencido</span>':'<span class="status-chip upcoming">Por cobrar</span>';
  return `<article class="charge-card ${paid?'is-paid':''}"><div class="charge-main"><div class="charge-person"><strong>${escapeHtml(charge.profileName)}</strong><span>${serviceBadge(charge.service)} ${escapeHtml(charge.service)} · ${escapeHtml(charge.accountLabel)}${charge.accountEmail?` · ${escapeHtml(charge.accountEmail)}`:''}</span><small>Día ${charge.dueDay} · ${escapeHtml(monthName(charge.month))}</small></div><div class="charge-amount">${money(charge.amount)}${marker}</div></div>${showAction?`<button class="tiny-button ${paid?'':'mark-paid'}" data-action="toggle-charge" data-id="${escapeHtml(charge.id)}">${paid?'Marcar pendiente':'Marcar pagado'}</button>`:''}</article>`;
}
function profileAccessSummaries(profile) {
  return profile.links.map(link=>{
    const account=data.accounts.find(item=>item.id===link.accountId);
    return {link,account};
  }).filter(item=>item.account);
}
function dashboard() {
  const finance=chargeTotals(); const expenses=totalExpenses();
  const services=[...new Set(data.accounts.map(account=>account.service))];
  const serviceCards=services.length?`<div class="service-grid">${services.map(service=>{
    const accounts=data.accounts.filter(account=>account.service===service);
    const income=data.charges.filter(charge=>charge.service===service&&charge.month===currentMonth()).reduce((sum,charge)=>sum+charge.amount,0);
    return `<button class="service-card" data-service="${escapeHtml(service)}"><div class="service-top">${serviceBadge(service)}<div><div class="service-name">${escapeHtml(service)}</div><div class="service-accounts">${accounts.length} ${accounts.length===1?'cuenta':'cuentas'}</div></div></div><strong>${money(income)}</strong><small>cobros previstos este mes</small></button>`;
  }).join('')}</div>`:emptyState('Aún no hay cuentas','Registra una cuenta de servicio para empezar a vincular perfiles.','new-account');
  const pending=data.charges.filter(charge=>charge.status==='pending').sort((a,b)=>a.month.localeCompare(b.month)||a.dueDay-b.dueDay).slice(0,4);
  return `<section><div class="page-heading"><div><p class="eyebrow">Panel principal</p><h2>Tu negocio, de un vistazo.</h2><p class="subhead">Cuentas, perfiles, cobros y gastos en un solo lugar.</p></div><button class="button" data-action="new-account">${icons.plus}<span>Cuenta</span></button></div>
    <div class="stats-grid">${statCard('Cobros previstos',money(finance.expected),`${monthName(currentMonth())}`)}${statCard('Por cobrar',money(finance.pending),'Incluye saldos pendientes',true)}${statCard('Gastos mensuales',money(expenses),`${data.expenses.length} suscripciones o paquetes`)}</div>
    <div class="section-head"><h3>Servicios y cuentas</h3><button class="text-link" data-view="cuentas">Ver cuentas</button></div>${serviceCards}
    <div class="section-head"><h3>Cobros pendientes</h3><button class="text-link" data-view="cobros">Ver cobros</button></div>${pending.length?`<div class="charge-list">${pending.map(charge=>chargeCard(charge,false)).join('')}</div>`:emptyState('Sin cobros pendientes','Los cobros pendientes aparecerán aquí hasta que los marques como pagados.')}
  </section>`;
}
function accountExpenseText(account) {
  const linked=data.expenses.filter(expense=>expense.accountIds.includes(account.id));
  if (!linked.length) return 'Costo aún no configurado';
  const packages=linked.filter(expense=>expense.bundle);
  if(packages.length)return `Incluida en ${packages.map(expense=>`${expense.name} · ${money(expense.amount)} total`).join(', ')}`;
  return `Costo mensual ${money(linked.filter(expense=>!expense.bundle).reduce((sum,expense)=>sum+expense.amount,0))}`;
}
function accountCard(account) {
  const used=accessCount(account.id); const isRevealed=revealedPasswords.has(account.id);
  const users=data.profiles.flatMap(profile=>profile.links.filter(link=>link.accountId===account.id).map(()=>profile.name));
  return `<article class="account-card"><div class="account-header"><div class="account-title">${serviceBadge(account.service)}<div class="min-width"><h3>${escapeHtml(account.service)} · ${escapeHtml(account.label)}</h3><p>${escapeHtml(account.email)}</p></div></div><div class="account-menu"><button class="tiny-button" data-action="edit-account" data-id="${escapeHtml(account.id)}">Editar</button><button class="tiny-button" data-action="delete-account" data-id="${escapeHtml(account.id)}">Borrar</button></div></div>
    <div class="account-meta"><span class="pill">Perfiles <strong>${used}/${account.limit}</strong></span><span class="pill">Libres <strong>${Math.max(0,account.limit-used)}</strong></span><span class="pill">${escapeHtml(accountExpenseText(account))}</span></div>
    <div class="credential-row"><span class="muted" style="font-size:10px">Contraseña</span><code>${isRevealed?escapeHtml(account.password):'••••••••••••'}</code><button data-action="reveal" data-id="${escapeHtml(account.id)}">${isRevealed?'Ocultar':'Mostrar'}</button><button data-action="copy-password" data-id="${escapeHtml(account.id)}">Copiar</button></div>
    ${users.length?`<div class="linked-users"><strong>Perfiles vinculados</strong><span>${users.map(escapeHtml).join(' · ')}</span></div>`:'<p class="account-empty-note">Todavía no hay perfiles vinculados.</p>'}</article>`;
}
function accountsPage() {
  const options=['Todos',...new Set(data.accounts.map(account=>account.service))];
  const shown=data.accounts.filter(account=>accountFilter==='Todos'||account.service===accountFilter);
  return `<section><div class="page-heading"><div><p class="eyebrow">Accesos</p><h2>Cuentas de servicio</h2><p class="subhead">Cada correo identifica una cuenta; los perfiles se vinculan desde su propia sección.</p></div><button class="button" data-action="new-account">${icons.plus}<span>Agregar</span></button></div>
    ${data.accounts.length?`<div class="filter-row"><div class="field"><label for="account-filter">Filtrar servicio</label><select id="account-filter">${options.map(service=>`<option ${service===accountFilter?'selected':''}>${escapeHtml(service)}</option>`).join('')}</select></div></div><div class="account-list">${shown.map(accountCard).join('')||emptyState('Sin cuentas en este servicio','Elige otro servicio o registra una cuenta.','new-account')}</div>`:emptyState('Tu inventario está vacío','Registra servicios y cuentas con un identificador claro, como “Netflix cuenta 1”.','new-account')}
  </section>`;
}
function profileCard(profile) {
  const access=profileAccessSummaries(profile);
  const total=access.reduce((sum,item)=>sum+item.link.amount,0);
  return `<article class="profile-card"><div class="profile-card-head"><div class="avatar">${escapeHtml((profile.name.trim()[0]||'?').toUpperCase())}</div><div class="profile-card-title"><h3>${escapeHtml(profile.name)}</h3><p>${access.length} ${access.length===1?'cuenta vinculada':'cuentas vinculadas'} · ${money(total)} / mes</p></div><div class="account-menu"><button class="tiny-button" data-action="edit-profile" data-id="${escapeHtml(profile.id)}">Editar</button><button class="tiny-button" data-action="delete-profile" data-id="${escapeHtml(profile.id)}">Eliminar</button></div></div>
    <div class="profile-access-list">${access.map(({link,account})=>`<div class="profile-access-row">${serviceBadge(account.service)}<div class="access-label"><strong>${escapeHtml(account.service)} · ${escapeHtml(account.label)}</strong><small>${escapeHtml(account.email)} · cobra día ${link.dueDay}</small></div><span>${money(link.amount)} / mes</span></div>`).join('')}</div></article>`;
}
function profilesPage() {
  return `<section><div class="page-heading"><div><p class="eyebrow">Personas</p><h2>Perfiles registrados</h2><p class="subhead">Una persona puede tener acceso a varias cuentas; cada vínculo guarda su cobro y fecha.</p></div><button class="button" data-action="new-profile">${icons.plus}<span>Agregar</span></button></div>
    ${data.profiles.length?`<div class="profile-list-cards">${data.profiles.map(profileCard).join('')}</div>`:emptyState('Aún no hay perfiles','Registra a una persona y vincúlala a una o varias cuentas de servicio.','new-profile')}
  </section>`;
}
function chargeFilters() {
  return `<div class="collection-filters"><div class="filter-row"><div class="field"><label for="charge-status">Estado de pago</label><select id="charge-status"><option value="pendiente" ${chargeStatusFilter==='pendiente'?'selected':''}>Pendientes</option><option value="pagado" ${chargeStatusFilter==='pagado'?'selected':''}>Pagados</option><option value="todos" ${chargeStatusFilter==='todos'?'selected':''}>Todos</option></select></div><div class="field"><label for="charge-day">Día de cobro</label><select id="charge-day"><option value="todos" ${chargeDayFilter==='todos'?'selected':''}>Todos los días</option>${[11,15,30].map(day=>`<option value="${day}" ${chargeDayFilter===String(day)?'selected':''}>Día ${day}</option>`).join('')}</select></div></div></div>`;
}
function collectionsPage() {
  const totals=chargeTotals();
  const charges=data.charges.filter(charge=>(chargeStatusFilter==='todos'||(chargeStatusFilter==='pendiente'?charge.status==='pending':charge.status==='paid'))&&(chargeDayFilter==='todos'||charge.dueDay===Number(chargeDayFilter))).sort((a,b)=>a.month.localeCompare(b.month)||a.dueDay-b.dueDay||a.profileName.localeCompare(b.profileName));
  const groups=[11,15,30].filter(day=>chargeDayFilter==='todos'||day===Number(chargeDayFilter));
  const body=charges.length?groups.map(day=>{const group=charges.filter(charge=>charge.dueDay===day);return group.length?`<div class="collection-group"><div class="section-head"><h3>Día ${day}</h3><span class="muted small-text">${group.length} cobros</span></div><div class="charge-list">${group.map(charge=>chargeCard(charge,true)).join('')}</div></div>`:'';}).join(''):emptyState(chargeStatusFilter==='pendiente'?'No hay cobros pendientes':'No hay cobros para mostrar','Los cobros se generan cada mes por cada perfil vinculado. Los pendientes siguen aquí hasta marcarlos como pagados.');
  return `<section><div class="page-heading"><div><p class="eyebrow">Seguimiento mensual</p><h2>Cobros</h2><p class="subhead">Los saldos vencidos permanecen pendientes hasta que los marques como pagados.</p></div></div>
    <div class="stats-grid compact-stats">${statCard('Pendiente acumulado',money(totals.pending),'Incluye meses anteriores',true)}${statCard('Pagado este mes',money(totals.paid),monthName(currentMonth()))}${statCard('Por cobrar este mes',money(totals.expected),`${data.charges.filter(charge=>charge.month===currentMonth()).length} cargos`)}</div>
    ${chargeFilters()}${body}
  </section>`;
}
function financePage() {
  const totals=chargeTotals(); const costs=totalExpenses();
  const byService=new Map();
  for (const expense of data.expenses.filter(item=>expenseIsStandalone(item))) {
    const service=expense.services[0]||'Sin servicio'; byService.set(service,(byService.get(service)||0)+expense.amount);
  }
  const serviceRows=[...byService].map(([service,amount])=>`<div class="money-service-row">${serviceBadge(service)}<strong>${escapeHtml(service)}</strong><span>${money(amount)} / mes</span></div>`).join('');
  const packages=data.expenses.filter(expense=>expense.bundle);
  const packageCards=packages.map(expense=>`<article class="expense-card"><div class="expense-card-main"><div><p class="eyebrow">Promoción / paquete</p><h3>${escapeHtml(expense.name)}</h3><p>${expense.services.map(escapeHtml).join(' · ')||'Servicios no especificados'}</p>${expense.accountIds.length?`<small>Cuentas: ${expense.accountIds.map(id=>{const a=data.accounts.find(x=>x.id===id);return a?escapeHtml(a.label):'';}).filter(Boolean).join(', ')}</small>`:''}</div><strong>${money(expense.amount)}<small> / mes</small></strong></div><div class="account-menu"><button class="tiny-button" data-action="edit-expense" data-id="${escapeHtml(expense.id)}">Editar</button><button class="tiny-button" data-action="delete-expense" data-id="${escapeHtml(expense.id)}">Eliminar</button></div></article>`).join('');
  return `<section><div class="page-heading"><div><p class="eyebrow">Ingresos y costos</p><h2>Dinero</h2><p class="subhead">Separa costos individuales, promociones y el gasto general.</p></div><button class="button" data-action="new-expense">${icons.plus}<span>Paquete</span></button></div>
    <div class="stats-grid">${statCard('Cobros previstos',money(totals.expected),monthName(currentMonth()))}${statCard('Gasto total',money(costs),`${data.expenses.length} costos registrados`)}${statCard('Neto estimado',money(totals.expected-costs),'Cobros del mes menos suscripciones',true)}</div>
    <div class="finance-columns"><article class="finance-panel"><div class="section-head"><h3>Costos individuales por servicio</h3></div>${serviceRows?`<div class="money-service-list">${serviceRows}</div>`:emptyState('Sin costos individuales','Al registrar una cuenta, indica el costo mensual si se paga por separado.')}</article>
      <article class="finance-panel"><div class="section-head"><h3>Promociones y paquetes</h3><button class="text-link" data-action="new-expense">Agregar</button></div>${packageCards?`<div class="expense-list">${packageCards}</div>`:emptyState('Sin promociones registradas','Agrega un costo de paquete y vincula los servicios que incluye.','new-expense')}</article></div>
    <div class="section-head"><h3>Gasto general de plataformas</h3></div><div class="total-expense-row"><div><strong>Gasto mensual total</strong><small>Cada promoción se cuenta una sola vez.</small></div><strong>${money(costs)}</strong></div>
    <div class="section-head"><h3>Moneda y respaldo</h3></div><div class="settings-grid"><div class="settings-card"><h3>Moneda</h3><p>Los montos se muestran en esta moneda.</p><div class="field" style="max-width:220px"><label for="currency-select">Moneda</label><select id="currency-select">${['MXN','USD','EUR','COP','ARS','CLP'].map(code=>`<option value="${code}" ${data.currency===code?'selected':''}>${code}</option>`).join('')}</select></div></div><div class="settings-card"><h3>Respaldo cifrado</h3><p>Guarda una copia cifrada para poder restaurar tus datos en otro dispositivo.</p><div class="settings-actions"><button class="button secondary small" data-action="export">Descargar respaldo</button><button class="button secondary small" data-action="import">Restaurar respaldo</button></div></div></div>
  </section>`;
}
function render() {
  if (!data||!cryptoKey) { showAuth(); return; }
  const page=currentView==='inicio'?dashboard():currentView==='cuentas'?accountsPage():currentView==='perfiles'?profilesPage():currentView==='cobros'?collectionsPage():financePage();
  APP.className='app-shell'; APP.innerHTML=`${topbar()}${nav()}${page}<div class="toast" id="toast"></div>`;
  APP.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{currentView=button.dataset.view;render();window.scrollTo(0,0);}));
  APP.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>handleAction(button.dataset.action,button.dataset.id)));
  APP.querySelectorAll('[data-service]').forEach(button=>button.addEventListener('click',()=>{accountFilter=button.dataset.service;currentView='cuentas';render();window.scrollTo(0,0);}));
  document.querySelector('#account-filter')?.addEventListener('change',event=>{accountFilter=event.target.value;render();});
  document.querySelector('#charge-status')?.addEventListener('change',event=>{chargeStatusFilter=event.target.value;render();});
  document.querySelector('#charge-day')?.addEventListener('change',event=>{chargeDayFilter=event.target.value;render();});
  document.querySelector('#currency-select')?.addEventListener('change',async event=>{data.currency=event.target.value;await persist();render();toast('Moneda actualizada.');});
}
async function persist() { await encryptAndSave(); }
function toast(message) {
  const node=document.querySelector('#toast'); if(!node)return; node.textContent=message; node.classList.add('show'); setTimeout(()=>node.classList.remove('show'),2200);
}
function showModal(content) {
  MODAL.innerHTML=content; MODAL.showModal(); MODAL.querySelector('[data-close]')?.addEventListener('click',()=>MODAL.close());
}
MODAL.addEventListener('click',event=>{if(event.target===MODAL)MODAL.close();});

function accountModal(account=null) {
  const editing=Boolean(account); const services=[...new Set([...DEFAULT_SERVICES,...data.services,...data.accounts.map(item=>item.service)])];
  showModal(`<form id="account-form" class="modal-content"><div class="modal-head"><div><p class="eyebrow">${editing?'Editar cuenta':'Nueva cuenta'}</p><h2>${editing?'Actualiza el acceso':'Registra una cuenta'}</h2><p>El identificador permite distinguir cuentas del mismo servicio.</p></div><button type="button" class="close-button" data-close aria-label="Cerrar">×</button></div>
    <div class="form-grid"><div class="field"><label for="account-service">Servicio</label><input id="account-service" name="service" list="service-options" value="${escapeHtml(account?.service||'')}" placeholder="Ej. Netflix" required><datalist id="service-options">${services.map(service=>`<option value="${escapeHtml(service)}"></option>`).join('')}</datalist></div>
      <div class="field"><label for="account-label">Identificador de cuenta</label><input id="account-label" name="label" value="${escapeHtml(account?.label||'')}" placeholder="Netflix cuenta 1" required></div>
      <div class="field"><label for="account-email">Correo de acceso</label><input id="account-email" name="email" type="email" autocomplete="off" value="${escapeHtml(account?.email||'')}" placeholder="netflixcuenta1@gmail.com" required></div>
      <div class="field"><label for="account-password">Contraseña</label><input id="account-password" name="password" type="password" autocomplete="new-password" value="${escapeHtml(account?.password||'')}" required></div>
      <div class="field"><label for="account-limit">Límite de perfiles</label><input id="account-limit" name="limit" type="number" min="1" step="1" value="${escapeHtml(account?.limit??1)}" required><span class="field-hint">Número total de espacios de perfil para esta cuenta.</span></div>
      <div class="field"><label for="account-cost">Costo mensual individual (${data.currency})</label><input id="account-cost" name="monthlyCost" type="number" min="0" step="0.01" value="${escapeHtml(account?.monthlyCost??0)}"><span class="field-hint">Si la cuenta va en un paquete, puedes dejarlo en 0.</span></div></div>
    <div class="modal-actions"><button type="button" class="button secondary" data-close>Cancelar</button><button type="submit" class="button">${editing?'Guardar cambios':'Crear cuenta'}</button></div></form>`);
  const form=MODAL.querySelector('#account-form');
  if(!editing) form.elements.service.addEventListener('input',()=>{if(!form.elements.label.dataset.touched)form.elements.label.value=suggestedAccountLabel(form.elements.service.value);});
  form.elements.label.addEventListener('input',()=>{form.elements.label.dataset.touched='true';});
  if (!editing) form.elements.service.addEventListener('change',()=>{if(!form.elements.label.dataset.touched)form.elements.label.value=suggestedAccountLabel(form.elements.service.value);});
  form.addEventListener('submit',async event=>{
    event.preventDefault(); const fields=new FormData(form);
    const next={id:account?.id||uid(),service:String(fields.get('service')).trim(),label:String(fields.get('label')).trim(),email:String(fields.get('email')).trim(),password:String(fields.get('password')),limit:Math.max(1,Number(fields.get('limit'))||1),monthlyCost:Number(fields.get('monthlyCost'))||0,expenseId:account?.expenseId||null};
    if (!next.service||!next.label)return;
    const index=data.accounts.findIndex(item=>item.id===next.id); const previous=index>=0?data.accounts[index]:null;
    if (previous&&next.limit<accessCount(next.id)) return alert('El límite no puede ser menor al número de perfiles vinculados.');
    if (previous&&previous.service!==next.service) {
      for(const expense of data.expenses.filter(item=>item.bundle&&item.accountIds.includes(next.id))){
        if(!data.accounts.some(item=>item.id!==next.id&&expense.accountIds.includes(item.id)&&item.service===previous.service)) expense.services=expense.services.filter(service=>service!==previous.service);
        if(!expense.services.includes(next.service))expense.services.push(next.service);
      }
    }
    if(index>=0)data.accounts[index]=next;else data.accounts.unshift(next);
    data.services=[...new Set([...data.services,next.service])]; syncDirectExpense(next);
    try{await persist();MODAL.close();render();toast(editing?'Cuenta actualizada.':'Cuenta registrada.');}catch(error){alert(`No se pudo guardar: ${formatError(error)}`);}
  });
}
function syncDirectExpense(account) {
  let expense=data.expenses.find(item=>item.id===account.expenseId&&!item.bundle);
  if(account.monthlyCost<=0){
    if(expense)data.expenses=data.expenses.filter(item=>item.id!==expense.id);
    account.expenseId=null;return;
  }
  if(!expense){expense={id:uid(),name:'',amount:0,services:[],accountIds:[account.id],bundle:false};data.expenses.push(expense);account.expenseId=expense.id;}
  expense.name=`${account.service} · ${account.label}`;expense.amount=account.monthlyCost;expense.services=[account.service];expense.accountIds=[account.id];
}
function accessRows(links,excludingProfileId='') {
  const values=links.length?links:[{id:'',accountId:'',amount:'',dueDay:15,startMonth:''}];
  return values.map((link,index)=>{
    const account=data.accounts.find(item=>item.id===link.accountId); const dueDay=normalizeDueDay(link.dueDay,account?.service);
    return `<div class="access-form-row"><select name="access-account" aria-label="Cuenta vinculada ${index+1}" required><option value="">Elige una cuenta</option>${accountOptions(link.accountId,excludingProfileId)}</select><input name="access-amount" type="number" min="0" step="0.01" value="${escapeHtml(link.amount)}" placeholder="Cobro mensual" aria-label="Cobro mensual ${index+1}" required><select class="access-due-select" name="access-due-day" aria-label="Día de cobro ${index+1}" data-user-set="${dueDay!==defaultDueDay(account?.service)?'true':'false'}">${[11,15,30].map(day=>`<option value="${day}" ${day===dueDay?'selected':''}>Día ${day}</option>`).join('')}</select><input type="hidden" name="access-id" value="${escapeHtml(link.id||'')}"><input type="hidden" name="access-start" value="${escapeHtml(link.startMonth||'')}"><button class="remove-profile" type="button" data-remove-access aria-label="Quitar cuenta vinculada" ${values.length===1?'disabled':''}>×</button></div>`;
  }).join('');
}
function profileModal(profile=null) {
  const editing=Boolean(profile);
  if(!data.accounts.length)return alert('Primero registra una cuenta de servicio para poder vincular perfiles.');
  showModal(`<form id="profile-form" class="modal-content"><div class="modal-head"><div><p class="eyebrow">${editing?'Editar perfil':'Nuevo perfil'}</p><h2>${editing?'Actualiza a la persona':'Registra una persona'}</h2><p>Vincúlala a una o varias cuentas. Cada vínculo puede tener monto y día distintos.</p></div><button type="button" class="close-button" data-close aria-label="Cerrar">×</button></div>
    <div class="field"><label for="profile-name">Nombre de la persona</label><input id="profile-name" name="name" value="${escapeHtml(profile?.name||'')}" placeholder="Ej. Ana López" required></div>
    <div class="profiles-heading"><div><h3>Cuentas y cobros de esta persona</h3><span class="field-hint">Spotify inicia el día 11; los demás, el 15. Elige 11, 15 o 30.</span></div><button type="button" class="text-link" id="add-access">+ Otra cuenta</button></div>
    <div id="access-rows">${accessRows(profile?.links||[],profile?.id||'')}</div>
    <div class="message info compact-message">Los cobros pendientes anteriores permanecen en la lista aunque edites o elimines un vínculo.</div>
    <div class="modal-actions"><button type="button" class="button secondary" data-close>Cancelar</button><button type="submit" class="button">${editing?'Guardar cambios':'Crear perfil'}</button></div></form>`);
  const form=MODAL.querySelector('#profile-form'); const rows=MODAL.querySelector('#access-rows');
  rows.addEventListener('change',event=>{
    if(event.target.matches('select[name="access-account"]')){
      const row=event.target.closest('.access-form-row'); const account=data.accounts.find(item=>item.id===event.target.value); const due=row.querySelector('.access-due-select');
      if(due.dataset.userSet!=='true'&&account)due.value=String(defaultDueDay(account.service));
    }
    if(event.target.matches('.access-due-select'))event.target.dataset.userSet='true';
  });
  MODAL.querySelector('#add-access').addEventListener('click',()=>{rows.insertAdjacentHTML('beforeend',accessRows([{id:'',accountId:'',amount:'',dueDay:15,startMonth:''}],profile?.id||''));updateAccessButtons();});
  rows.addEventListener('click',event=>{if(event.target.matches('[data-remove-access]')&&rows.querySelectorAll('.access-form-row').length>1){event.target.closest('.access-form-row').remove();updateAccessButtons();}});
  form.addEventListener('submit',async event=>{
    event.preventDefault(); const fields=new FormData(form); const chosen=fields.getAll('access-account').map(String);
    if(new Set(chosen).size!==chosen.length)return alert('Vincula una cuenta solo una vez a este perfil.');
    for(const accountId of chosen){
      const account=data.accounts.find(item=>item.id===accountId); if(!account)return alert('Selecciona una cuenta válida.');
      if(accessCount(accountId,profile?.id||'')>=account.limit)return alert(`La cuenta “${account.label}” ya llegó a su límite de perfiles.`);
    }
    const amounts=fields.getAll('access-amount').map(Number); const days=fields.getAll('access-due-day').map(Number); const ids=fields.getAll('access-id').map(String); const starts=fields.getAll('access-start').map(String);
    const links=chosen.map((accountId,index)=>({id:ids[index]||uid(),accountId,amount:amounts[index]||0,dueDay:normalizeDueDay(days[index],data.accounts.find(item=>item.id===accountId)?.service),startMonth:/^\d{4}-\d{2}$/.test(starts[index])?starts[index]:currentMonth()}));
    const next={id:profile?.id||uid(),name:String(fields.get('name')).trim(),links}; if(!next.name)return;
    const index=data.profiles.findIndex(item=>item.id===next.id); if(index>=0)data.profiles[index]=next;else data.profiles.unshift(next);
    syncMonthlyCharges();
    try{await persist();MODAL.close();currentView='perfiles';render();toast(editing?'Perfil actualizado.':'Perfil registrado.');}catch(error){alert(`No se pudo guardar: ${formatError(error)}`);}
  });
  function updateAccessButtons(){const buttons=[...rows.querySelectorAll('[data-remove-access]')];buttons.forEach(button=>button.disabled=buttons.length===1);}
}
function expenseModal(expense=null) {
  const editing=Boolean(expense);
  const services=[...new Set([...DEFAULT_SERVICES,...data.services,...data.accounts.map(account=>account.service)])];
  const selectedServices=new Set(expense?.services||[]); const selectedAccounts=new Set(expense?.accountIds||[]);
  const servicesHtml=services.map(service=>`<label class="check-option"><input type="checkbox" name="expense-service" value="${escapeHtml(service)}" ${selectedServices.has(service)?'checked':''}><span>${escapeHtml(service)}</span></label>`).join('');
  const accountHtml=data.accounts.map(account=>{
    const inOtherBundle=data.expenses.some(item=>item.bundle&&item.id!==expense?.id&&item.accountIds.includes(account.id));
    return `<label class="check-option ${inOtherBundle?'disabled':''}"><input type="checkbox" name="expense-account" value="${escapeHtml(account.id)}" ${selectedAccounts.has(account.id)?'checked':''} ${inOtherBundle?'disabled':''}><span>${escapeHtml(accountLabel(account))}${inOtherBundle?' · ya vinculada a un paquete':''}</span></label>`;
  }).join('');
  showModal(`<form id="expense-form" class="modal-content"><div class="modal-head"><div><p class="eyebrow">Promoción o paquete</p><h2>${editing?'Editar costo agrupado':'Registra un costo agrupado'}</h2><p>El precio completo se cuenta una vez en el gasto general.</p></div><button type="button" class="close-button" data-close aria-label="Cerrar">×</button></div>
    <div class="form-grid"><div class="field"><label for="expense-name">Nombre de promoción o paquete</label><input id="expense-name" name="name" value="${escapeHtml(expense?.name||'')}" placeholder="Ej. Paquete MEGA" required></div><div class="field"><label for="expense-amount">Costo total mensual (${data.currency})</label><input id="expense-amount" name="amount" type="number" min="0" step="0.01" value="${escapeHtml(expense?.amount??'')}" placeholder="299.00" required></div></div>
    <div class="section-head compact-head"><h3>Servicios que incluye</h3></div><div class="check-grid">${servicesHtml}</div>
    ${data.accounts.length?`<div class="section-head compact-head"><h3>Cuentas cubiertas por este costo (opcional)</h3></div><div class="check-list">${accountHtml}</div>`:''}
    <div class="modal-actions"><button type="button" class="button secondary" data-close>Cancelar</button><button type="submit" class="button">${editing?'Guardar paquete':'Guardar costo'}</button></div></form>`);
  const form=MODAL.querySelector('#expense-form');
  form.addEventListener('submit',async event=>{
    event.preventDefault();const fields=new FormData(form);const included=[...new Set(fields.getAll('expense-service').map(String))];
    if(!included.length)return alert('Selecciona al menos un servicio incluido.');
    const id=expense?.id||uid();const accountIds=[...new Set(fields.getAll('expense-account').map(String))];
    const next={id,name:String(fields.get('name')).trim(),amount:Number(fields.get('amount'))||0,services:included,accountIds,bundle:true};
    if(!next.name)return;
    for(const accountId of accountIds){
      const account=data.accounts.find(item=>item.id===accountId);if(!account)continue;
      if(!next.services.includes(account.service))next.services.push(account.service);
    }
    const index=data.expenses.findIndex(item=>item.id===id);if(index>=0)data.expenses[index]=next;else data.expenses.push(next);
    data.services=[...new Set([...data.services,...next.services])];
    try{await persist();MODAL.close();currentView='dinero';render();toast(editing?'Costo actualizado.':'Promoción registrada.');}catch(error){alert(`No se pudo guardar: ${formatError(error)}`);}
  });
}
async function handleAction(action,id) {
  const account=data.accounts.find(item=>item.id===id); const profile=data.profiles.find(item=>item.id===id); const expense=data.expenses.find(item=>item.id===id); const charge=data.charges.find(item=>item.id===id);
  if(action==='new-account')return accountModal();
  if(action==='edit-account'&&account)return accountModal(account);
  if(action==='delete-account'&&account){
    if(!confirm(`¿Eliminar ${account.service} · ${account.label}? Los cobros ya generados se conservarán como historial.`))return;
    data.accounts=data.accounts.filter(item=>item.id!==id);data.expenses=data.expenses.flatMap(item=>{
      if(item.accountIds.includes(id)){item.accountIds=item.accountIds.filter(accountId=>accountId!==id);if(!item.bundle)return [];}
      return [item];
    });
    for(const person of data.profiles)person.links=person.links.filter(link=>link.accountId!==id);
    revealedPasswords.delete(id);await persist();render();toast('Cuenta eliminada.');return;
  }
  if(action==='new-profile')return profileModal();
  if(action==='edit-profile'&&profile)return profileModal(profile);
  if(action==='delete-profile'&&profile){if(!confirm(`¿Eliminar el perfil de ${profile.name}? Los cobros generados permanecerán en pendientes o historial.`))return;data.profiles=data.profiles.filter(item=>item.id!==id);await persist();render();toast('Perfil eliminado.');return;}
  if(action==='new-expense')return expenseModal();
  if(action==='edit-expense'&&expense)return expenseModal(expense);
  if(action==='delete-expense'&&expense){if(!confirm(`¿Eliminar el costo “${expense.name}”?`))return;data.expenses=data.expenses.filter(item=>item.id!==id);await persist();render();toast('Costo eliminado.');return;}
  if(action==='toggle-charge'&&charge){charge.status=charge.status==='paid'?'pending':'paid';charge.paidAt=charge.status==='paid'?new Date().toISOString():null;await persist();render();toast(charge.status==='paid'?'Cobro marcado como pagado.':'Cobro marcado como pendiente.');return;}
  if(action==='reveal'&&account){revealedPasswords.has(id)?revealedPasswords.delete(id):revealedPasswords.add(id);render();return;}
  if(action==='copy-password'&&account){try{await navigator.clipboard.writeText(account.password);toast('Contraseña copiada.');}catch{toast('No se pudo copiar en este navegador.');}return;}
  if(action==='lock'){data=null;cryptoKey=null;revealedPasswords.clear();showAuth();return;}
  if(action==='export'){const blob=new Blob([localStorage.getItem(VAULT_KEY)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=Object.assign(document.createElement('a'),{href:url,download:`respaldo-streaming-${currentMonth()}.json`});link.click();URL.revokeObjectURL(url);toast('Respaldo cifrado descargado.');return;}
  if(action==='import'){IMPORT_FILE.click();return;}
}
IMPORT_FILE.addEventListener('change',async()=>{
  const file=IMPORT_FILE.files?.[0];IMPORT_FILE.value='';if(!file)return;
  try{
    const envelope=JSON.parse(await file.text());if(!envelope.salt||!envelope.iv||!envelope.ciphertext)throw new Error('El archivo no parece un respaldo cifrado válido.');
    const passphrase=prompt('Escribe la clave maestra con la que se creó este respaldo:');if(!passphrase)return;
    const key=await deriveKey(passphrase,unb64(envelope.salt));const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv)},key,unb64(envelope.ciphertext));
    const restored=cleanData(JSON.parse(new TextDecoder().decode(clear)));
    if(!confirm(`Se restaurarán ${restored.accounts.length} cuentas y ${restored.profiles.length} perfiles. Esto reemplazará los datos de este dispositivo.`))return;
    localStorage.setItem(VAULT_KEY,JSON.stringify(envelope));data=restored;cryptoKey=key;syncMonthlyCharges();await persist();render();toast('Respaldo restaurado.');
  }catch(error){alert(`No se pudo restaurar: ${formatError(error)}`);}
});
if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
showAuth();
