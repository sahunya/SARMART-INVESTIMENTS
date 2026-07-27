const storageKey = 'sarmart-records-v2',
      contactsKey = 'sarmart-contacts-v1',
      stockKey = 'sarmart-out-of-stock-v1',
      stockPendingKey = 'sarmart-stock-pending-v1',
      assistantLoginsKey = 'sarmart-assistant-logins-v1',
      reconciliationKey = 'sarmart-reconciliation-v1',
      sessionKey = 'sarmart-current-user',
      remoteSessionKey = 'sarmart-remote-user-session',
      googleTokenKey = 'sarmart-google-sheet-token',
      appearanceKey = 'sarmart-appearance-v1',
      deletedKey = 'sarmart-pending-deletes-v1',
      pendingWritesKey = 'sarmart-pending-writes-v1';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxXgbQjKl8EndI1uHFjRdjg6r5p13DtJRSQfuUafz6VcnksroKjxXnYR7sIEGCb-OqQRw/exec';
const accounts = { admin: { username: 'sam', password: '123', label: 'Administrator' } };
const categories = ['Inventory / stock', 'Rent', 'Utilities', 'Phone & internet', 'Transport', 'Salaries & wages', 'Marketing', 'Office supplies', 'Repairs & maintenance', 'Professional services', 'Taxes & licences', 'Other'];

const readJson = (storage, key, fallback) => {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

let records = readJson(localStorage, storageKey, []),
    contacts = readJson(localStorage, contactsKey, []),
    outOfStock = readJson(localStorage, stockKey, []),
    assistantLogins = readJson(localStorage, assistantLoginsKey, []),
    reconciliation = readJson(localStorage, reconciliationKey, {}),
    currentUser = readJson(sessionStorage, sessionKey, null),
    pendingDeletes = new Set(readJson(localStorage, deletedKey, [])),
    pendingWrites = new Set(readJson(localStorage, pendingWritesKey, [])),
    pendingStockWrites = new Set(readJson(localStorage, stockPendingKey, [])),
    notificationFeed = [],
    cashMode = 'out',
    undoHistory = [],
    redoHistory = [],
    newStockPhoto = '',
    editStockPhoto = '';

const $ = s => document.querySelector(s),
      $$ = s => [...document.querySelectorAll(s)];

function applyAppearance(settings = readJson(localStorage, appearanceKey, { size: '15px', font: 'system' })) {
  const fonts = {
    system: 'Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif',
    arial: 'Arial,Helvetica,sans-serif',
    verdana: 'Verdana,Geneva,sans-serif',
    serif: 'Georgia,serif'
  };
  const size = settings.size || '15px',
        font = fonts[settings.font] || fonts.system;
  document.documentElement.style.setProperty('--user-font-size', size);
  document.documentElement.style.setProperty('--user-font-family', font);
  document.body?.style.setProperty('font-size', size, 'important');
  document.body?.style.setProperty('font-family', font, 'important');
}

document.addEventListener('click', event => {
  if (event.target.closest('#stock-sign-out')) $('#sign-out').click();
  if (event.target.closest('#sign-out')) sessionStorage.removeItem(remoteSessionKey);
});

document.addEventListener('click', event => {
  const edit = event.target.closest('[data-edit]'),
        remove = event.target.closest('[data-delete],[data-delete-imported]');
  if (remove && currentUser?.role !== 'admin') {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (edit && currentUser?.role !== 'admin') {
    const record = records.find(item => item.id === edit.dataset.edit),
          role = String(currentUser?.role || ''),
          normalAssistant = role === 'assistant' || role.startsWith('assistant-');
    if (!normalAssistant || !record || record.type === 'expense') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}, true);

document.addEventListener('click', event => {
  const button = event.target.closest('[data-payment]'),
        role = String(currentUser?.role || ''),
        normalAssistant = role === 'assistant' || role.startsWith('assistant-');
  if (!button || !normalAssistant) return;
  const record = records.find(item => item.id === button.dataset.payment);
  if (!record) return;
  $('#payment-record-id').value = record.id;
  $('#payment-note').value = '';
  setPaymentMode('payment', record);
  $('#payment-dialog').showModal();
});

const deleteAllStockButton = document.createElement('button');
deleteAllStockButton.id = 'delete-all-stock';
deleteAllStockButton.type = 'button';
deleteAllStockButton.className = 'delete-btn hidden';
deleteAllStockButton.textContent = 'Delete all out-of-stock items';
$('#out-of-stock-list')?.before(deleteAllStockButton);

const notificationPanel = document.createElement('section');
notificationPanel.id = 'assistant-notifications';
notificationPanel.className = 'panel hidden';
notificationPanel.innerHTML = '<div class="panel-head"><div><h2>Assistant notifications</h2><p>Recent changes made by assistants.</p></div></div><div id="assistant-notification-list"></div>';
$('#dashboard')?.append(notificationPanel);

const enableAlertsButton = document.createElement('button');
enableAlertsButton.id = 'enable-phone-alerts';
enableAlertsButton.type = 'button';
enableAlertsButton.className = 'secondary-btn sign-out';
enableAlertsButton.textContent = 'Enable phone alerts';
$('#account-controls')?.prepend(enableAlertsButton);

enableAlertsButton.addEventListener('click', async () => {
  if (!('Notification' in window)) return toast('Phone alerts are not supported by this browser.');
  const permission = await Notification.requestPermission();
  toast(permission === 'granted' ? 'Phone alerts enabled' : 'Phone alerts were not enabled.');
});

document.addEventListener('click', async event => {
  const stockButton = event.target.closest('#delete-all-stock'),
        assistantButton = event.target.closest('[data-delete-assistant]');
  if (stockButton) {
    if (currentUser?.role !== 'admin' || !confirm('Delete every Out-of-Stock item? This cannot be undone.')) return;
    try {
      await googleRequest('deleteAllStock');
      outOfStock = [];
      pendingStockWrites.clear();
      localStorage.setItem(stockPendingKey, '[]');
      save();
      toast('All Out-of-Stock items deleted');
    } catch {
      toast('Could not delete items. Check Google Sheet sync.');
    }
    return;
  }
  if (assistantButton) {
    const id = assistantButton.dataset.deleteAssistant,
          login = assistantLogins.find(item => item.id === id);
    if (currentUser?.role !== 'admin' || !login || !confirm(`Delete login for ${login.username}? They will be signed out.`)) return;
    try {
      await googleRequest('deleteUser', { id });
      assistantLogins = assistantLogins.filter(item => item.id !== id);
      localStorage.setItem(assistantLoginsKey, JSON.stringify(assistantLogins));
      renderAssistantLogins();
      toast('Assistant login deleted');
    } catch {
      toast('Could not delete assistant login.');
    }
  }
});

setInterval(() => {
  if (currentUser && canSync()) {
    syncPendingWrites();
    syncPendingStockWrites();
  }
}, 10000);

setInterval(() => {
  enableAlertsButton.classList.toggle('hidden', currentUser?.role !== 'admin');
  if (currentUser?.role === 'admin' && token()) pullAssistantNotifications();
}, 15000);

setInterval(() => {
  if (currentUser?.role !== 'admin' && canSync()) {
    syncPendingDeletes();
    pullAll(true);
    verifyRemoteSession();
  }
}, 10000);

const isStockManager = () => !!currentUser;
const isStockAssistant = () => String(currentUser?.role || '').startsWith('stock-assistant-');
const loginAccounts = () => [{ role: 'admin', ...accounts.admin }];
const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const dateText = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const typeName = type => type === 'receivable' ? 'Receivable' : type === 'payable' ? 'Payable' : 'Expense / Cash Out';
const isDue = (r, days = 0) => r.due && r.due <= new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

function paid(r) { return Math.abs(Number(r.paidAmount || 0)); }
function outstanding(r) { const amount = Number(r.amount || 0); return amount >= 0 ? amount - paid(r) : amount + paid(r); }
function statusOf(r) {
  if (r.type === 'expense') return 'recorded';
  if (outstanding(r) < -0.001) return 'overpaid';
  if (Math.abs(outstanding(r)) < 0.001) return 'paid';
  if (paid(r) > 0) return 'part-paid';
  return isDue(r, -1) ? 'overdue' : 'open';
}

function paymentEntries(r) {
  let entries = r.payments;
  if (typeof entries === 'string') {
    try { entries = JSON.parse(entries); } catch { entries = []; }
  }
  return Array.isArray(entries) && entries.length ? entries : (paid(r) ? [{ amount: paid(r), date: r.lastPaymentDate || r.date }] : []);
}

function paymentsThisMonth(r) {
  const now = new Date();
  return paymentEntries(r).filter(p => {
    const d = new Date(`${p.date}T00:00:00`);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

function noteEntries(r) {
  let entries = r.noteEntries;
  if (typeof entries === 'string') {
    try { entries = JSON.parse(entries); } catch { entries = []; }
  }
  if (Array.isArray(entries) && entries.length) return entries;
  return String(r.notes || '').split(' · ').filter(Boolean).map(text => ({ text, date: r.date, time: r.time, enteredBy: r.enteredBy || 'Imported record' }));
}

function noteMeta(entry, r) {
  const date = entry.date || r.date,
        time = entry.time || r.time || '—',
        person = entry.enteredBy || r.enteredBy || 'Imported record',
        day = date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not recorded';
  return `${day} · ${time} · Entered by ${person}`;
}

function stateSnapshot() { return JSON.stringify({ records, contacts }); }
let historyBaseline = stateSnapshot();

function updateHistoryButtons() {
  if ($('#undo-action')) $('#undo-action').disabled = !undoHistory.length;
  if ($('#redo-action')) $('#redo-action').disabled = !redoHistory.length;
}

function save(track = true) {
  const current = stateSnapshot();
  if (track && current !== historyBaseline) {
    undoHistory.push(historyBaseline);
    if (undoHistory.length > 30) undoHistory.shift();
    redoHistory = [];
  }
  historyBaseline = current;
  localStorage.setItem(storageKey, JSON.stringify(records));
  localStorage.setItem(contactsKey, JSON.stringify(contacts));
  localStorage.setItem(stockKey, JSON.stringify(outOfStock));
  localStorage.setItem(deletedKey, JSON.stringify([...pendingDeletes]));
  localStorage.setItem(pendingWritesKey, JSON.stringify([...pendingWrites]));
  localStorage.setItem(stockPendingKey, JSON.stringify([...pendingStockWrites]));
  render();
  updateHistoryButtons();
}

function restoreHistory(target) {
  const before = JSON.parse(historyBaseline),
        after = JSON.parse(target),
        beforeMap = new Map(before.records.map(r => [r.id, r])),
        afterMap = new Map(after.records.map(r => [r.id, r]));
  records = after.records;
  contacts = after.contacts;
  for (const [id, record] of afterMap) {
    if (!beforeMap.has(id)) {
      pendingDeletes.delete(id);
      sync('create', { record }, true);
    } else if (JSON.stringify(record) !== JSON.stringify(beforeMap.get(id))) {
      sync('update', { record }, true);
    }
  }
  for (const id of beforeMap.keys()) if (!afterMap.has(id)) pendingDeletes.add(id);
  historyBaseline = target;
  save(false);
  syncPendingDeletes();
}

function undo() {
  if (!undoHistory.length) return;
  const target = undoHistory.pop();
  redoHistory.push(historyBaseline);
  restoreHistory(target);
  toast('Last change undone');
}

function redo() {
  if (!redoHistory.length) return;
  const target = redoHistory.pop();
  undoHistory.push(historyBaseline);
  restoreHistory(target);
  toast('Change redone');
}

function token() { return localStorage.getItem(googleTokenKey) || ''; }
function remoteSession() { return readJson(sessionStorage, remoteSessionKey, null); }
function canSync() { return currentUser?.role === 'admin' ? !!token() : !!remoteSession()?.session; }
function setSync(text, on = false) {
  if ($('#sync-status')) {
    $('#sync-status').textContent = text;
    $('#sync-status').classList.toggle('connected', on);
  }
}

async function googleRequest(action, payload = {}) {
  const admin = currentUser?.role === 'admin',
        credential = admin ? token() : remoteSession()?.session;
  if (!credential) throw Error(admin ? 'Enter the private API token.' : 'Sign in again to connect.');
  const isList = ['list', 'listContacts', 'listStock', 'getSessionVersion', 'listUsers', 'listNotifications'].includes(action),
        key = admin ? 'token' : 'session',
        url = isList ? `${GOOGLE_SCRIPT_URL}?${key}=${encodeURIComponent(credential)}&action=${action}` : GOOGLE_SCRIPT_URL,
        body = admin ? { token: credential, action, ...payload } : { session: credential, action, ...payload },
        options = isList ? {} : { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) };
  const response = await fetch(url, options);
  const result = await response.json();
  if (!result.ok) throw Error(result.error || 'Google Sheet request failed.');
  return result.data;
}

function fingerprint(items) {
  return JSON.stringify(items.map(item => Object.keys(item).sort().reduce((out, key) => { out[key] = item[key]; return out; }, {})).sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

async function pullAll(quiet = false) {
  if (!canSync()) return { ok: false, message: currentUser?.role === 'admin' ? 'Enter the private API token first.' : 'Sign in again to connect.' };
  if (!quiet) setSync('Syncing…');
  try {
    const cloud = await googleRequest('list');
    const parseList = value => {
      if (typeof value !== 'string') return value || [];
      try { return JSON.parse(value) || []; } catch { return []; }
    };
    const remote = cloud.map(r => ({ ...r, amount: Number(r.amount), paidAmount: Number(r.paidAmount || 0), payments: parseList(r.payments), noteEntries: parseList(r.noteEntries) })).filter(r => !pendingDeletes.has(r.id));
    const localPending = records.filter(r => pendingWrites.has(r.id));
    const nextRecords = [...remote.filter(r => !pendingWrites.has(r.id)), ...localPending];
    let nextContacts = contacts, nextStock = outOfStock;
    try { nextContacts = await googleRequest('listContacts'); } catch {}
    try {
      const remoteStock = await googleRequest('listStock'),
            localStock = new Map(outOfStock.map(item => [item.id, item])),
            completeStock = remoteStock.map(item => {
              const local = localStock.get(item.id);
              return { ...item, remaining: item.remaining !== undefined ? item.remaining : (local?.remaining || ''), photo: item.photo !== undefined ? item.photo : (local?.photo || '') };
            });
      nextStock = [...completeStock.filter(item => !pendingStockWrites.has(item.id)), ...outOfStock.filter(item => pendingStockWrites.has(item.id))];
    } catch {}
    const changed = fingerprint(records) !== fingerprint(nextRecords) || fingerprint(contacts) !== fingerprint(nextContacts) || fingerprint(outOfStock) !== fingerprint(nextStock);
    if (changed && !$('#record-dialog')?.open && !$('#contact-dialog')?.open) {
      records = nextRecords;
      contacts = nextContacts;
      outOfStock = nextStock;
      historyBaseline = stateSnapshot();
      localStorage.setItem(storageKey, JSON.stringify(records));
      localStorage.setItem(contactsKey, JSON.stringify(contacts));
      localStorage.setItem(stockKey, JSON.stringify(outOfStock));
      render();
      updateHistoryButtons();
    }
    if (!quiet) setSync('Google Sheet synced', true);
    return { ok: true };
  } catch (error) {
    if (!quiet) setSync('Sheet unavailable');
    return { ok: false, message: error.message || 'Browser could not reach Google Sheets.' };
  }
}

async function sync(action, payload, quiet = false) {
  const recordId = payload?.record?.id;
  if (recordId) {
    pendingWrites.add(recordId);
    localStorage.setItem(pendingWritesKey, JSON.stringify([...pendingWrites]));
  }
  if (!canSync()) return false;
  try {
    await googleRequest(action, payload);
    if (recordId) {
      pendingWrites.delete(recordId);
      localStorage.setItem(pendingWritesKey, JSON.stringify([...pendingWrites]));
    }
    setSync('Google Sheet synced', true);
    setTimeout(() => pullAll(true), 0);
    return true;
  } catch {
    setSync('Saved on this device');
    if (!quiet) toast('Saved locally. Sheet sync will retry.');
    return false;
  }
}

async function syncStock(action, item) {
  pendingStockWrites.add(item.id);
  localStorage.setItem(stockPendingKey, JSON.stringify([...pendingStockWrites]));
  if (!canSync()) return false;
  try {
    await googleRequest(action, { item });
    pendingStockWrites.delete(item.id);
    localStorage.setItem(stockPendingKey, JSON.stringify([...pendingStockWrites]));
    setSync('Google Sheet synced', true);
    setTimeout(() => pullAll(true), 0);
    return true;
  } catch {
    setSync('Saved on this device');
    toast('Saved on this device.');
    return false;
  }
}

async function syncPendingWrites() {
  if (!canSync()) return;
  for (const id of [...pendingWrites]) {
    const record = records.find(item => item.id === id);
    if (!record) {
      pendingWrites.delete(id);
      continue;
    }
    try {
      await googleRequest('update', { record });
    } catch {
      try { await googleRequest('create', { record }); } catch { continue; }
    }
    pendingWrites.delete(id);
    localStorage.setItem(pendingWritesKey, JSON.stringify([...pendingWrites]));
  }
  if (!pendingWrites.size) pullAll(true);
}

async function syncPendingStockWrites() {
  if (!canSync()) return;
  for (const id of [...pendingStockWrites]) {
    const item = outOfStock.find(entry => entry.id === id);
    if (!item) {
      pendingStockWrites.delete(id);
      continue;
    }
    try {
      await googleRequest('updateStock', { item });
    } catch {
      try { await googleRequest('createStock', { item }); } catch { continue; }
    }
    pendingStockWrites.delete(id);
    localStorage.setItem(stockPendingKey, JSON.stringify([...pendingStockWrites]));
  }
  if (!pendingStockWrites.size) pullAll(true);
}

async function syncPendingDeletes() {
  for (const id of [...pendingDeletes]) {
    if (await sync('delete', { id }, true)) {
      pendingDeletes.delete(id);
      save();
    }
  }
}

async function verifyRemoteSession() {
  if (!currentUser || !canSync()) return;
  try {
    const session = await googleRequest('getSessionVersion'),
          version = String(session.version || '1');
    if (!currentUser.sessionVersion) {
      currentUser.sessionVersion = version;
      sessionStorage.setItem(sessionKey, JSON.stringify(currentUser));
      return;
    }
    if (currentUser.sessionVersion !== version) {
      sessionStorage.removeItem(sessionKey);
      sessionStorage.removeItem(remoteSessionKey);
      currentUser = null;
      $('#login-form')?.reset();
      updateLogin();
      toast('You were signed out by the Administrator.');
    }
  } catch {}
}

function toast(text) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show-toast');
  setTimeout(() => el.classList.remove('show-toast'), 2600);
}

function monthRecord(r) {
  const d = new Date(`${r.date}T00:00:00`), n = new Date();
  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

function filtered(type) {
  let out = records.filter(r => r.type === type);
  const search = $(`[data-filter="${type}"]`)?.value.trim().toLowerCase() || '';
  const status = $(`[data-status-filter="${type}"]`)?.value || '';
  const category = $('[data-category-filter]')?.value || '',
        from = $(`[data-date-from="${type}"]`)?.value || '',
        to = $(`[data-date-to="${type}"]`)?.value || '',
        min = $(`[data-min-total="${type}"]`)?.value,
        max = $(`[data-max-total="${type}"]`)?.value,
        sort = $(`[data-sort="${type}"]`)?.value || 'newest';
  if (search) out = out.filter(r => `${r.name} ${r.party} ${r.category} ${r.notes}`.toLowerCase().includes(search));
  if (status) out = out.filter(r => statusOf(r) === status);
  if (category) out = out.filter(r => r.category === category);
  if (from) out = out.filter(r => String(r.createdAt || r.date || '').slice(0, 10) >= from);
  if (to) out = out.filter(r => String(r.createdAt || r.date || '').slice(0, 10) <= to);
  if (min !== '' && min !== undefined) out = out.filter(r => Math.abs(Number(r.amount || 0)) >= Number(min));
  if (max !== '' && max !== undefined) out = out.filter(r => Math.abs(Number(r.amount || 0)) <= Number(max));
  const label = r => String(r.party || r.name || '').toLowerCase();
  return out.sort((a, b) => sort === 'a-z' ? label(a).localeCompare(label(b)) : sort === 'z-a' ? label(b).localeCompare(label(a)) : sort === 'high-low' ? Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)) : sort === 'low-high' ? Math.abs(Number(a.amount || 0)) - Math.abs(Number(b.amount || 0)) : `${b.date || ''}${b.createdAt || b.id || ''}`.localeCompare(`${a.date || ''}${a.createdAt || a.id || ''}`));
}

function actions(r) {
  const admin = currentUser?.role === 'admin',
        role = String(currentUser?.role || ''),
        assistant = role === 'assistant' || role.startsWith('assistant-'),
        payButton = statusOf(r) !== 'paid' && outstanding(r) > 0 ? `<button class="account-icon pay-icon" data-payment="${r.id}" title="Record payment" aria-label="Record payment">✓</button>` : '';
  if (!admin) return assistant && r.type !== 'expense' ? `${payButton}<button class="account-icon edit-icon" data-edit="${r.id}" title="Edit entry" aria-label="Edit entry">✎</button>` : '';
  if (r.type === 'expense') return `<button class="row-action" data-edit="${r.id}">Edit</button><button class="delete-btn" data-delete="${r.id}">Delete</button>`;
  return `${payButton}<button class="account-icon edit-icon" data-edit="${r.id}" title="Edit entry" aria-label="Edit entry">✎</button><button class="account-icon delete-icon" data-delete="${r.id}" title="Delete entry" aria-label="Delete entry">×</button>`;
}

function statusBadge(r) {
  const status = statusOf(r);
  return `<span class="status ${status}">${status.replace('-', ' ')}</span>`;
}

function tableRow(r) {
  const color = /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '';
  return `<div class="record-row" data-entry-id="${esc(r.id)}" data-color-record="${esc(r.id)}" style="--entry-highlight:${color}"><div><strong>${esc(r.name || 'Untitled record')}</strong><span>${esc(r.type === 'expense' ? (r.category || 'Other') : (r.party || 'No contact'))}</span></div><span>${dateText(r.date)}</span><span>${r.type === 'expense' ? '—' : dateText(r.due)}</span><div><strong class="amount ${r.type}">${money.format(r.amount)}</strong><span>${r.type === 'expense' ? 'Recorded' : `${money.format(paid(r))} paid`}</span></div><div>${statusBadge(r)}</div><div class="row-actions">${actions(r)}</div></div>`;
}

function accountCard(r) {
  const receivable = r.type === 'receivable',
        balance = outstanding(r),
        sign = receivable ? (balance >= 0 ? '+' : '-') : (balance >= 0 ? '-' : '+'),
        party = r.party || r.name || 'No contact',
        detail = [dateText(r.date), r.time || '—', r.due ? `Due ${dateText(r.due)}` : 'No due date'].filter(Boolean).join(' · '),
        notes = noteEntries(r),
        color = /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '';
  return `<article class="account-card" data-entry-id="${esc(r.id)}" data-color-record="${esc(r.id)}" style="--entry-highlight:${color}"><div class="account-info"><strong>${esc(party)}</strong><span>${esc(detail)}</span>${notes.length ? `<details class="account-notes"><summary>Notes (${notes.length}) <b>⌄</b></summary><div>${notes.map(note => `<div class="note-history"><span>${esc(note.text)}</span><small>${esc(noteMeta(note, r))}</small></div>`).join('')}</div></details>` : ''}</div><div class="account-money"><strong class="amount ${r.type}">${sign}${money.format(Math.abs(balance))}</strong></div><div class="account-actions">${actions(r)}</div></article>`;
}

function renderList(type) {
  const items = filtered(type), target = $(`#${type}-list`);
  if (!target) return;
  if (!items.length) {
    target.innerHTML = `<div class="empty">No ${type === 'expense' ? 'cash-out records' : `${type}s`} yet.</div>`;
    return;
  }
  target.innerHTML = type === 'expense' ? `<div class="list-head"><span>Description</span><span>Date</span><span>Due date</span><span>Amount</span><span>Status</span><span></span></div>${items.map(tableRow).join('')}` : items.map(accountCard).join('');
}

function renderDashboard() {
  const rec = records.filter(r => r.type === 'receivable'),
        pay = records.filter(r => r.type === 'payable'),
        expenses = records.filter(r => r.type === 'expense'),
        directCashOut = expenses.filter(monthRecord).reduce((s, r) => s + Number(r.amount), 0),
        supplierPayments = pay.reduce((s, r) => s + paymentsThisMonth(r), 0),
        monthExpenses = directCashOut + supplierPayments,
        monthIncome = rec.reduce((s, r) => s + paymentsThisMonth(r), 0);
  
  if ($('#receivable-total')) $('#receivable-total').textContent = money.format(rec.reduce((s, r) => s + outstanding(r), 0));
  if ($('#payable-total')) $('#payable-total').textContent = money.format(pay.reduce((s, r) => s + outstanding(r), 0));
  if ($('#expense-total')) $('#expense-total').textContent = money.format(monthExpenses);
  if ($('#expense-count')) $('#expense-count').textContent = `${expenses.length} cash-out entries recorded`;
  if ($('#net-total')) $('#net-total').textContent = money.format(monthIncome - monthExpenses);

  const recent = records.filter(r => r.date === today()).sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id)));
  if ($('#recent-list')) $('#recent-list').innerHTML = recent.length ? recent.map(r => `<button class="activity-row activity-link" data-open-entry="${esc(r.id)}" data-open-type="${r.type}" type="button"><div class="record-icon ${r.type}">${r.type === 'expense' ? '↓' : r.type === 'receivable' ? '↑' : '→'}</div><div><h3>${esc(r.name || 'Untitled record')}</h3><p>${typeName(r.type)} · ${r.type === 'expense' ? r.category || 'Other' : r.party || 'No contact'}</p></div><div class="amount ${r.type}">${money.format(r.amount)}</div></button>`).join('') : '<div class="empty">No entries recorded today.</div>';

  const watch = [...rec, ...pay].filter(r => statusOf(r) !== 'paid' && r.due && isDue(r, 7)).sort((a, b) => a.due.localeCompare(b.due));
  if ($('#alerts-list')) $('#alerts-list').innerHTML = watch.length ? watch.map(r => `<div class="alert-row ${statusOf(r) === 'overdue' ? 'overdue-alert' : ''}"><div><strong>${esc(r.name || r.party || 'Untitled record')}</strong><span>${typeName(r.type)} · Due ${dateText(r.due)}</span></div><div>${statusBadge(r)} <strong>${money.format(outstanding(r))}</strong></div></div>`).join('') : '<div class="empty small-empty">No due-date reminders right now.</div>';
}

function renderContacts() {
  const query = $('[data-contact-search]')?.value.toLowerCase() || '',
        items = contacts.filter(c => `${c.name} ${c.type} ${c.phone} ${c.email}`.toLowerCase().includes(query));
  if ($('#contacts-list')) $('#contacts-list').innerHTML = items.length ? `<div class="list-head contact-head"><span>Name</span><span>Type</span><span>Phone</span><span>Email</span></div>${items.map(c => `<div class="contact-row"><strong>${esc(c.name)}</strong><span>${esc(c.type)}</span><span>${esc(c.phone || '—')}</span><span>${esc(c.email || '—')}</span></div>`).join('')}` : '<div class="empty">No saved contacts yet.</div>';
  
  const names = [...new Set([...contacts.map(c => c.name), ...records.map(r => r.party)].map(name => String(name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if ($('#contact-options')) $('#contact-options').innerHTML = names.map(name => `<option value="${esc(name)}"></option>`).join('');
}

function renderReports() {
  const expenses = records.filter(r => r.type === 'expense' && monthRecord(r)),
        income = records.filter(r => r.type === 'receivable').reduce((s, r) => s + paymentsThisMonth(r), 0),
        directCashOut = expenses.reduce((s, r) => s + Number(r.amount), 0),
        supplierPayments = records.filter(r => r.type === 'payable').reduce((s, r) => s + paymentsThisMonth(r), 0),
        cash = directCashOut + supplierPayments;

  if ($('#report-income')) $('#report-income').textContent = money.format(income);
  if ($('#report-expense')) $('#report-expense').textContent = money.format(cash);
  if ($('#report-net')) $('#report-net').textContent = money.format(income - cash);

  const grouped = Object.entries(expenses.reduce((a, r) => { a[r.category || 'Other'] = (a[r.category || 'Other'] || 0) + Number(r.amount); return a; }, {}));
  if ($('#category-report')) $('#category-report').innerHTML = grouped.length ? grouped.sort((a, b) => b[1] - a[1]).map(([name, value]) => `<div class="report-row"><span>${esc(name)}</span><strong>${money.format(value)}</strong></div>`).join('') : '<div class="empty small-empty">No cash-out records this month.</div>';

  const balance = [...records.filter(r => r.type === 'receivable' || r.type === 'payable')].filter(r => statusOf(r) !== 'paid');
  if ($('#balance-report')) $('#balance-report').innerHTML = balance.length ? balance.map(r => `<div class="report-row"><span>${esc(r.party || r.name || 'Untitled')} <small>${typeName(r.type)}</small></span><strong>${money.format(outstanding(r))}</strong></div>`).join('') : '<div class="empty small-empty">No unpaid balances.</div>';
}

const safePhoto = value => /^data:image\/(png|jpeg|webp);base64,/i.test(String(value || '')) ? String(value) : '';
function stockPhotoMarkup(item) {
  const photo = safePhoto(item.photo);
  return photo ? `<img class="stock-thumb" src="${photo}" data-view-stock-photo="${item.id}" alt="Picture of ${esc(item.name)}" title="View picture" />` : '';
}

function renderStock() {
  const items = [...outOfStock].sort((a, b) => Number(b.replaced) - Number(a.replaced) || String(b.replacedDate || b.date).localeCompare(String(a.replacedDate || a.date)));
  if ($('#out-of-stock-list')) $('#out-of-stock-list').innerHTML = items.length ? items.map(item => `<details class="stock-row ${item.replaced ? 'replaced' : ''}"><summary>${stockPhotoMarkup(item)}<div class="stock-details"><strong>${esc(item.name)}</strong><span>${item.replaced ? `Replaced ${dateText(item.replacedDate || item.date)}` : `Noted ${dateText(item.date)}`}</span></div><b class="stock-fold">⌄</b></summary><div class="stock-expanded">${item.remaining ? `<small>${esc(item.remaining)}</small>` : '<small>No remaining-item notes.</small>'}<div class="stock-actions">${isStockManager() ? `<button class="row-action" data-edit-stock="${item.id}">Edit</button>` : ''}${item.replaced ? (isStockManager() ? `<button class="row-action" data-stock-out="${item.id}">↺ Unmark as replaced</button>` : '<span class="stock-done">✓ Replaced</span>') : isStockManager() ? `<button class="row-action" data-stock-replace="${item.id}">✓ Mark replaced</button>` : '<span class="status open">Out of stock</span>'}${currentUser?.role === 'admin' ? `<button class="delete-btn" data-stock-delete="${item.id}">Delete</button>` : ''}</div></div></details>`).join('') : '<div class="empty small-empty">No out-of-stock items noted.</div>';
  $('#delete-all-stock')?.classList.toggle('hidden', currentUser?.role !== 'admin' || !items.length);
}

async function pullAssistantLogins() {
  if (currentUser?.role !== 'admin' || !token()) return;
  try {
    const users = await googleRequest('listUsers');
    assistantLogins = users.filter(user => user.active).map(user => ({ id: user.id, username: user.username, access: user.role === 'stock' ? 'stock' : 'assistant' }));
    localStorage.setItem(assistantLoginsKey, JSON.stringify(assistantLogins));
    renderAssistantLogins();
  } catch {}
}

function renderAssistantNotifications() {
  const panel = $('#assistant-notifications'), target = $('#assistant-notification-list');
  if (!panel || !target) return;
  panel.classList.toggle('hidden', currentUser?.role !== 'admin' || !notificationFeed.length);
  target.innerHTML = notificationFeed.slice(0, 5).map(item => `<div class="alert-row"><div><strong>${esc(item.message)}</strong><span>${dateText(String(item.createdAt || '').slice(0, 10))}</span></div></div>`).join('');
}

async function pullAssistantNotifications() {
  if (currentUser?.role !== 'admin' || !token()) return;
  try {
    const list = await googleRequest('listNotifications');
    notificationFeed = list;
    renderAssistantNotifications();
    const newest = list[0]?.id, seen = localStorage.getItem('sarmart-last-assistant-alert');
    if (!newest || !seen) {
      if (newest) localStorage.setItem('sarmart-last-assistant-alert', newest);
      return;
    }
    if (newest !== seen) {
      const item = list[0];
      localStorage.setItem('sarmart-last-assistant-alert', newest);
      toast(item.message);
      if ('Notification' in window && Notification.permission === 'granted') new Notification('SARMART assistant update', { body: item.message });
    }
  } catch {}
}

function renderAssistantLogins() {
  const target = $('#assistant-logins-list');
  if (!target) return;
  target.innerHTML = assistantLogins.length ? assistantLogins.map(login => `<div class="assistant-login-row"><strong>${esc(login.username)}</strong><span>${login.access === 'stock' ? 'Stock Assistant — Out of Stock only' : 'Assistant login'}</span>${currentUser?.role === 'admin' ? `<button class="delete-btn" data-delete-assistant="${esc(login.id)}">Delete</button>` : ''}</div>`).join('') : '<div class="empty small-empty">No Assistant logins created yet.</div>';
}

function renderSectionTotals() {
  const receivable = records.filter(r => r.type === 'receivable').reduce((sum, r) => sum + outstanding(r), 0),
        payable = records.filter(r => r.type === 'payable').reduce((sum, r) => sum + outstanding(r), 0),
        cashOut = records.filter(r => r.type === 'expense').reduce((sum, r) => sum + Number(r.amount || 0), 0),
        setTotal = (view, label, value) => {
          const heading = $(`#${view} .section-heading > div:first-child`);
          if (!heading) return;
          let total = heading.querySelector('.section-total');
          if (!total) {
            total = document.createElement('strong');
            total.className = 'section-total';
            heading.append(total);
          }
          total.textContent = `${label}: ${money.format(value)}`;
        };
  setTotal('expenses', 'Cash out total', cashOut);
  setTotal('receivables', 'Receivable total', receivable);
  setTotal('payables', 'Payable total', payable);
}

function renderReconciliation() {
  const selectedDate = $('#recon-date')?.value || reconciliation.date || today(),
        saved = reconciliation.date === selectedDate;
  if ($('#recon-date')) $('#recon-date').value = selectedDate;
  if ($('#recon-sales')) $('#recon-sales').value = saved && reconciliation.sales !== undefined ? reconciliation.sales : '';
  if ($('#recon-purchases')) $('#recon-purchases').value = saved && reconciliation.purchases !== undefined ? reconciliation.purchases : '';
  if ($('#recon-profit')) $('#recon-profit').value = saved && reconciliation.profit !== undefined ? reconciliation.profit : '';
  updateReconciliationStatus();
}

function updateReconciliationStatus() {
  const sales = Number($('#recon-sales')?.value || 0),
        purchases = Number($('#recon-purchases')?.value || 0),
        profit = Number($('#recon-profit')?.value || 0),
        difference = sales - (purchases + profit),
        status = $('#recon-status');
  if (!status) return;
  status.classList.toggle('unbalanced', Math.abs(difference) > 0.005);
  status.classList.toggle('balanced', Math.abs(difference) <= 0.005);
  status.textContent = Math.abs(difference) <= 0.005 ? 'Less / Extra: KSh 0 (Balanced)' : difference > 0 ? `Extra: ${money.format(difference)}` : `Less: ${money.format(Math.abs(difference))}`;
}

function moveReconciliationToDashboard() {
  const panel = $('.reconciliation-panel'),
        dashboard = $('#dashboard'),
        alerts = $('#dashboard .alerts-panel');
  if (!panel || !dashboard) return;
  if (panel.parentElement !== dashboard) {
    panel.classList.add('dashboard-reconciliation');
    dashboard.insertBefore(panel, alerts || dashboard.firstElementChild);
  }
  if (!$('#recon-date')) {
    const label = document.createElement('label'),
          input = document.createElement('input');
    input.id = 'recon-date';
    input.type = 'date';
    input.value = reconciliation.date || today();
    input.addEventListener('change', renderReconciliation);
    label.append('Reconciliation date', input);
    panel.querySelector('.reconciliation-fields')?.before(label);
  }
  if ($('#reconciliation-title')) $('#reconciliation-title').textContent = 'Less / Extra';
  if (panel.querySelector('.reconciliation-note')) {
    panel.querySelector('.reconciliation-note').textContent = 'This does not change receivables, payables, or cash flow totals.';
  }
}

function render() {
  renderDashboard();
  renderList('expense');
  renderList('receivable');
  renderList('payable');
  renderContacts();
  renderReports();
  renderStock();
  renderAssistantLogins();
  renderSectionTotals();
  renderReconciliation();
  moveReconciliationToDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
  applyAppearance();
  render();
});
