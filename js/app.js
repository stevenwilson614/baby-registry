/* Baby Registry — GiftList-style cash registry (Venmo / Zelle) */
'use strict';

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
const PENDING_KEY = 'br_pending_contribution';
const ADMIN_KEY = 'br_admin';
const SORT_KEY = 'br_price_sort';
const OLIVIA_PIN = '7230';
const DEFAULT_VENMO_USERNAME = 'steven-wilson-614';
const DEFAULT_ZELLE_HANDLE = 'stevenwilson614@gmail.com';
const DEFAULT_WELCOME = 'Our little one is on the way! Help make the baby\'s life possible by chipping in toward the things we\'ll need — every bit helps.';
const DEFAULT_SHIPPING = 'Shipping to Indonesia isn\'t practical, so we\'re buying everything for the baby in-country — cash gifts let us do exactly that.';

const state = {
  settings: null,
  items: [],
  contributions: [],
  admin: sessionStorage.getItem(ADMIN_KEY) === '1',
  priceSort: sessionStorage.getItem(SORT_KEY) || '',
};

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => {
  const v = Math.round(Number(n) * 100) / 100;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
};
const cents = (n) => Math.round(Number(n) * 100);

const ICONS = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-4-3.5-8-6.6-8-10.4C4 7.7 6 6 8.4 6c1.5 0 2.9.8 3.6 2 .7-1.2 2.1-2 3.6-2C18 6 20 7.7 20 10.6c0 3.8-4 6.9-8 10.4z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4"/><path d="M5 12v8h14v-8M12 8v12M12 8s-4 0-5.5-1.5a2 2 0 0 1 3-2.6C11 5 12 8 12 8zm0 0s4 0 5.5-1.5a2 2 0 0 0-3-2.6C13 5 12 8 12 8z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4L10 14M18 13v6H5V6h6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.4 3.3-5 6.5-5s5.8 1.6 6.5 5M16 5a3.5 3.5 0 0 1 0 7M18.5 15.5c1.7.7 2.7 2.2 3 4.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
  bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-5.5L21 9M4 9v10M20 9v10M8 12v5M12 12v5M16 12v5M2.5 19.5h19"/></svg>',
  stroller: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5c4.5 0 8 3.2 8 8H5.5C4 13 3 11.5 3 10zM12 13h5l2.5-5M19 4h2.5"/><circle cx="8" cy="18.5" r="2"/><circle cx="16" cy="18.5" r="2"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14.5A8 8 0 0 1 9.5 5 8 8 0 1 0 19 14.5z"/><path d="M17 4l.6 1.7L19.3 6l-1.7.6L17 8.3 16.4 6.6 14.7 6l1.7-.3z"/></svg>',
  bottle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5h4M11 2.5v3M13 2.5v3M9 8.5c0-1.7 1.3-3 3-3s3 1.3 3 3V19a2.5 2.5 0 0 1-5 0z" transform="translate(-.5 0)"/><path d="M9 12h5M9 15.5h5" transform="translate(-.5 0)"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.9z"/></svg>',
};
const PLACEHOLDERS = [ICONS.stroller, ICONS.moon, ICONS.bottle, ICONS.star];

function venmoUsername(settings) {
  const user = (settings?.venmo_username || '').trim().replace(/^@/, '');
  return user || DEFAULT_VENMO_USERNAME;
}

function zelleHandle(settings) {
  return (settings?.zelle_handle || '').trim() || DEFAULT_ZELLE_HANDLE;
}

function buildVenmoUrl(user, amount, note) {
  const clean = String(user).trim().replace(/^@/, '');
  return `https://venmo.com/${encodeURIComponent(clean)}?txn=pay&amount=${Number(amount).toFixed(2)}&note=${encodeURIComponent(note)}`;
}

function buildZelleUrls(handle, amount, note) {
  const email = encodeURIComponent(handle);
  const amt = Number(amount).toFixed(2);
  const memo = encodeURIComponent(note);
  return [
    `zelle://pay?email=${email}&amount=${amt}&memo=${memo}`,
    `zelle://send?email=${email}&amount=${amt}&memo=${memo}`,
    `zelle://send?token=${email}&amount=${amt}`,
    'zelle://',
  ];
}

function openZelleApp(handle, amount, note) {
  const urls = buildZelleUrls(handle, amount, note);
  const summary = `Send ${money(amount)} via Zelle to ${handle}\nMemo: ${note}`;
  navigator.clipboard?.writeText(summary).catch(() => {});

  const link = document.createElement('a');
  link.href = urls[0];
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    try { window.open(urls[0], '_blank', 'noopener'); } catch { /* no Zelle app */ }
  }, 250);
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function publicContributorName(c) {
  return c.anonymous ? 'Anonymous' : c.contributor_name;
}

/* ---------- data ---------- */
async function loadAll() {
  const [s, i, c] = await Promise.all([
    sb.from('registry_settings').select('*').eq('id', 1).single(),
    sb.from('registry_items').select('*').order('sort_order').order('created_at'),
    sb.from('registry_contributions').select('*').order('created_at', { ascending: false }),
  ]);
  if (s.error || i.error || c.error) throw (s.error || i.error || c.error);
  state.settings = s.data;
  state.items = i.data;
  state.contributions = c.data;
}

const contribsFor = (itemId) => state.contributions.filter((c) => c.item_id === itemId);
const fundedFor = (itemId) =>
  contribsFor(itemId).filter((c) => c.confirmed).reduce((sum, c) => sum + cents(c.amount), 0) / 100;
const remainingFor = (item) => Math.max(0, (cents(item.price) - cents(fundedFor(item.id))) / 100);

function sortedItems() {
  const items = [...state.items];
  if (state.priceSort === 'asc') items.sort((a, b) => cents(a.price) - cents(b.price));
  else if (state.priceSort === 'desc') items.sort((a, b) => cents(b.price) - cents(a.price));
  return items;
}

function updateSortBar() {
  const bar = $('#sortBar');
  if (!bar) return;
  bar.hidden = !state.items.length;
  bar.querySelectorAll('.sort-btn').forEach((b) => {
    b.classList.toggle('on', b.dataset.sort === state.priceSort);
  });
}

function renderGrid() {
  const grid = $('#grid');
  if (!state.items.length) {
    grid.innerHTML = `<div class="empty">${ICONS.gift}<h3>Nothing here yet</h3>
      <p>${state.admin ? 'Use “Add item” above to add the things you’ve bought.' : 'Check back soon — gifts are on the way.'}</p></div>`;
    updateSortBar();
    return;
  }
  grid.innerHTML = sortedItems().map(cardHTML).join('');
  updateSortBar();
}

/* ---------- render ---------- */
function render() {
  const s = state.settings;
  const welcome = (s.welcome_message || '').trim() || DEFAULT_WELCOME;
  const shipping = (s.shipping_note || '').trim() || DEFAULT_SHIPPING;

  $('#heroTitle').textContent = s.parent_names || 'Our Baby Registry';
  $('#heroNote').innerHTML = `<p class="hero-lead">${esc(welcome)}</p><p class="hero-shipping">${esc(shipping)}</p>`;
  $('#footerNames').textContent = 'With love, ' + (s.parent_names || 'us');
  document.title = s.parent_names || 'Our Baby Registry';

  const heroPhoto = (s.hero_photo_url || '').trim();
  const photoWrap = $('#heroPhotoWrap');
  const photoEl = $('#heroPhoto');
  if (heroPhoto) {
    photoWrap.hidden = false;
    photoEl.src = heroPhoto;
    photoEl.alt = s.parent_names || 'Our baby';
  } else {
    photoWrap.hidden = true;
    photoEl.removeAttribute('src');
  }

  const totalPrice = state.items.reduce((t, i) => t + cents(i.price), 0) / 100;
  const totalRaised = state.items.reduce((t, i) => t + cents(fundedFor(i.id)), 0) / 100;
  const givers = new Set(
    state.contributions.filter((c) => c.confirmed).map((c) => (c.anonymous ? `anon:${c.id}` : c.contributor_name.trim().toLowerCase())),
  ).size;
  $('#heroStats').innerHTML = state.items.length
    ? `<span class="stat">${ICONS.gift}<span><b>${state.items.length}</b> item${state.items.length === 1 ? '' : 's'}</span></span>
       <span class="stat">${ICONS.heart}<span><b>${money(totalRaised)}</b> of ${money(totalPrice)} chipped in</span></span>
       ${givers ? `<span class="stat">${ICONS.users}<span><b>${givers}</b> generous ${givers === 1 ? 'soul' : 'souls'}</span></span>` : ''}`
    : '';

  document.body.classList.toggle('mode-olivia', state.admin);
  document.body.classList.toggle('mode-guest', !state.admin);
  document.body.classList.toggle('has-hero-photo', !!heroPhoto);

  $('#adminBar').hidden = !state.admin;
  $('#btnAdmin').hidden = state.admin;
  $('#btnExitGuest').hidden = !state.admin;
  $('#heroEyebrow').textContent = state.admin ? 'Managing the registry' : 'Our little one is on the way';

  renderGrid();
}

function cardHTML(item, idx) {
  const funded = fundedFor(item.id);
  const remaining = remainingFor(item);
  const pct = Math.min(100, item.price > 0 ? (funded / item.price) * 100 : 0);
  const full = remaining <= 0;
  const confirmed = contribsFor(item.id).filter((c) => c.confirmed);

  const media = item.image_url
    ? `<img src="${esc(item.image_url)}" alt="${esc(item.title)}" loading="lazy"
         onerror="this.outerHTML='<div class=&quot;placeholder&quot;>${PLACEHOLDERS[idx % 4].replace(/"/g, '&quot;')}</div>'">`
    : `<div class="placeholder">${PLACEHOLDERS[idx % 4]}</div>`;

  const badge = item.received
    ? `<span class="badge badge-received">${ICONS.check} Received</span>`
    : full ? `<span class="badge badge-funded">${ICONS.check} Paid</span>` : '';

  const title = item.product_url
    ? `<a href="${esc(item.product_url)}" target="_blank" rel="noopener">${esc(item.title)}${ICONS.ext}</a>`
    : esc(item.title);

  const actions = item.received || full
    ? ''
    : `<div class="card-actions">
         <button class="btn btn-outline" data-contribute="${item.id}">Contribute</button>
         <button class="btn" data-payfull="${item.id}">Pay for item</button>
       </div>`;

  const supporters = confirmed.length
    ? `<div class="supporters">
         <div class="supporters-label">${ICONS.users} ${full ? 'Paid by' : 'Supported by'}</div>
         <ul class="supporters-list">${confirmed.map((c) => `
           <li><span class="supporter-name">${esc(publicContributorName(c))}</span>
             <span class="supporter-amt">${money(c.amount)}</span>
             ${c.message && !c.anonymous ? `<span class="supporter-note">&ldquo;${esc(c.message)}&rdquo;</span>` : ''}
           </li>`).join('')}</ul>
       </div>`
    : '';

  const adminRow = state.admin
    ? `<div class="admin-actions">
         <button class="btn btn-small btn-ghost" data-edit="${item.id}">${ICONS.pencil} Edit title &amp; price</button>
         <button class="btn btn-small btn-ghost" data-edit-full="${item.id}">Edit all details</button>
         <button class="btn btn-small btn-ghost" data-contribs="${item.id}">${ICONS.users} Gifts (${contribsFor(item.id).length})</button>
         <button class="btn btn-small ${item.received ? 'btn-ghost' : 'btn-sage'}" data-received="${item.id}">${item.received ? 'Un-mark received' : 'Mark received'}</button>
         <button class="btn btn-small btn-danger" data-delete="${item.id}">${ICONS.trash} Delete</button>
       </div>`
    : '';

  return `<article class="card ${full ? 'card-complete' : ''}" style="animation-delay:${Math.min(idx * 60, 400)}ms">
    <div class="card-media tint-${idx % 4}">${media}${item.retailer ? `<span class="chip">${esc(item.retailer)}</span>` : ''}${badge}</div>
    <div class="card-body">
      <h3 class="card-title">${title}</h3>
      ${item.note ? `<p class="card-note">${esc(item.note)}</p>` : ''}
      <div class="progress-wrap">
        <div class="progress-row">
          <span><b>${money(funded)}</b> <span class="muted">of ${money(item.price)}</span></span>
          <span class="muted">${full ? 'Paid in full' : money(remaining) + ' to go'}</span>
        </div>
        <div class="progress"><i class="${full ? 'full' : ''}" style="width:${pct}%"></i></div>
      </div>
      ${supporters}${actions}${adminRow}
    </div>
  </article>`;
}

/* ---------- modal plumbing ---------- */
function openModal(html) {
  $('#modal').innerHTML = `<button class="modal-close" data-close>${ICONS.x}</button>` + html;
  $('#overlay').hidden = false;
}
function closeModal() {
  $('#overlay').hidden = true;
  $('#modal').innerHTML = '';
}

/* ---------- contribute flow ---------- */
function openContribute(item, payFull) {
  const remaining = remainingFor(item);
  const s = state.settings;
  const hasVenmo = !!venmoUsername(s);
  const hasZelle = !!zelleHandle(s);
  if (!hasVenmo && !hasZelle) {
    openModal(`<h2>Almost ready</h2><p class="sub">The parents haven’t added their Venmo or Zelle details yet. Check back soon!</p>`);
    return;
  }

  const chips = [25, 50, 100].filter((v) => v < remaining);
  openModal(`
    <h2>${payFull ? 'Pay for this item' : 'Chip in'}</h2>
    <p class="sub">${esc(item.title)} &middot; ${money(remaining)} still needed</p>
    <div class="field"><label>Your name</label>
      <input id="cName" maxlength="60" placeholder="So we can thank you">
    </div>
    <label class="check-row">
      <input type="checkbox" id="cAnonymous">
      <span>Give anonymously <small>(your name won’t show on the registry)</small></span>
    </label>
    <div class="field"><label>Amount</label>
      <div class="amount-chips">
        ${chips.map((v) => `<button type="button" class="amt-chip" data-amt="${v}">${money(v)}</button>`).join('')}
        <button type="button" class="amt-chip ${payFull ? 'on' : ''}" data-amt="${remaining}">Cover the rest (${money(remaining)})</button>
      </div>
      <input id="cAmount" type="number" min="1" max="${remaining}" step="0.01" placeholder="Or enter an amount" value="${payFull ? remaining : ''}">
    </div>
    <div class="field"><label>A note for the parents <span style="font-weight:400;color:var(--ink-soft)">(optional)</span></label>
      <textarea id="cMessage" rows="2" maxlength="240" placeholder="Congratulations!"></textarea>
    </div>
    <div class="field"><label>How would you like to send it?</label>
      <div class="method-row">
        <button type="button" class="method-btn ${hasVenmo ? '' : 'off'}" data-method="venmo" ${hasVenmo ? '' : 'disabled'}>${ICONS.phone} Venmo <small>opens the app</small></button>
        <button type="button" class="method-btn" data-method="zelle" ${hasZelle ? '' : 'disabled'}>${ICONS.bank} Zelle <small>opens the app</small></button>
      </div>
    </div>
    <p class="form-error" id="cError"></p>
    <button class="btn btn-block" id="cGo">Continue to payment</button>
  `);

  let method = hasVenmo ? 'venmo' : 'zelle';
  const paint = () => document.querySelectorAll('.method-btn').forEach((b) => b.classList.toggle('on', b.dataset.method === method));

  const readForm = () => ({
    name: $('#cName').value.trim(),
    amount: Math.round(parseFloat($('#cAmount').value || '0') * 100) / 100,
    message: $('#cMessage').value.trim(),
    anonymous: $('#cAnonymous').checked,
  });

  const syncAnonymous = () => {
    const on = $('#cAnonymous').checked;
    $('#cName').closest('.field').classList.toggle('field-soft', on);
    $('#cName').placeholder = on ? 'Optional — only Olivia sees this' : 'So we can thank you';
  };
  $('#cAnonymous').addEventListener('change', syncAnonymous);
  syncAnonymous();

  const validateForm = () => {
    const { name, amount, message, anonymous } = readForm();
    const err = $('#cError');
    if (!anonymous && !name) { err.textContent = 'Please add your name, or check “Give anonymously”.'; return null; }
    if (!(amount >= 1)) { err.textContent = 'Please enter an amount of at least $1.'; return null; }
    if (amount > remaining + 0.001) { err.textContent = `Only ${money(remaining)} is still needed for this one.`; return null; }
    err.textContent = '';
    return { name: name || 'Anonymous', amount, message, anonymous };
  };

  const submitPayment = async (paymentMethod) => {
    const form = validateForm();
    if (!form) return;
    $('#cGo').disabled = true;
    try {
      await startPayment(item, { ...form, method: paymentMethod });
    } catch (e) {
      $('#cError').textContent = 'Something went wrong — please try again.';
      $('#cGo').disabled = false;
      console.error(e);
    }
  };

  paint();

  document.querySelectorAll('.method-btn:not([disabled])').forEach((b) =>
    b.addEventListener('click', () => {
      method = b.dataset.method;
      paint();
      submitPayment(method);
    }));
  document.querySelectorAll('.amt-chip').forEach((b) =>
    b.addEventListener('click', () => {
      $('#cAmount').value = b.dataset.amt;
      document.querySelectorAll('.amt-chip').forEach((x) => x.classList.toggle('on', x === b));
    }));
  $('#cAmount').addEventListener('input', () => document.querySelectorAll('.amt-chip').forEach((x) => x.classList.remove('on')));

  $('#cGo').addEventListener('click', () => submitPayment(method));
}

async function startPayment(item, { name, amount, method, message, anonymous }) {
  const { data, error } = await sb.from('registry_contributions')
    .insert({ item_id: item.id, contributor_name: name, amount, method, message, anonymous: !!anonymous })
    .select().single();
  if (error) throw error;

  localStorage.setItem(PENDING_KEY, JSON.stringify({ id: data.id, title: item.title, amount, method }));

  const s = state.settings;
  let payArea;
  if (method === 'venmo') {
    const user = venmoUsername(s);
    const note = `Baby registry - ${item.title}`;
    const url = buildVenmoUrl(user, amount, note);
    window.open(url, '_blank', 'noopener');
    payArea = `
      <div class="pay-panel">
        <div class="rowline"><span>Send to</span><b>@${esc(user)}</b></div>
        <div class="rowline"><span>Amount</span><b>${money(amount)}</b></div>
      </div>
      <p class="sub">We opened Venmo in a new tab. If it didn’t open,
        <a href="${esc(url)}" target="_blank" rel="noopener">tap here to pay @${esc(user)}</a>.</p>`;
  } else {
    const handle = zelleHandle(s);
    const note = `Baby registry - ${item.title}`;
    const zelleUrl = buildZelleUrls(handle, amount, note)[0];
    openZelleApp(handle, amount, note);
    payArea = `
      <div class="pay-panel">
        <div class="rowline"><span>Send to</span><b>${esc(handle)}</b><button class="copybtn" data-copy="${esc(handle)}">${ICONS.copy} Copy</button></div>
        ${s.zelle_name ? `<div class="rowline"><span>Recipient name</span><b>${esc(s.zelle_name)}</b></div>` : ''}
        <div class="rowline"><span>Amount</span><b>${money(amount)}</b></div>
        <div class="rowline"><span>Memo</span><b>${esc(note)}</b></div>
      </div>
      <p class="sub">We tried to open Zelle with your payment details. If it didn’t open,
        <a href="${esc(zelleUrl)}">tap here to open Zelle</a> or send ${money(amount)} to <b>${esc(handle)}</b> in your bank app.</p>
      <p class="sub">Payment details were copied to your clipboard.</p>`;
  }

  openModal(`
    <h2>Complete your payment</h2>
    <p class="sub">${money(amount)} toward <b>${esc(item.title)}</b></p>
    ${payArea}
    <p style="font-weight:800;margin:0 0 12px">Did the payment go through?</p>
    <div style="display:flex;gap:10px">
      <button class="btn btn-sage" style="flex:1.4" id="paidYes">${ICONS.check} Yes, I sent ${money(amount)}</button>
      <button class="btn btn-ghost" style="flex:1" id="paidNo">Not yet</button>
    </div>
  `);
  wireConfirmButtons(data.id, amount, item.title);
}

function wireConfirmButtons(contribId, amount, title) {
  document.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => { navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); }));
  $('#paidYes').addEventListener('click', async () => {
    $('#paidYes').disabled = true;
    const { error } = await sb.from('registry_contributions').update({ confirmed: true }).eq('id', contribId);
    if (error) { toast('Could not save — try again'); $('#paidYes').disabled = false; return; }
    localStorage.removeItem(PENDING_KEY);
    await refresh();
    openModal(`
      <div class="thanks">${ICONS.heart}
        <h2>Thank you!</h2>
        <p class="sub">Your ${money(amount)} toward <b>${esc(title)}</b> means the world to us.</p>
        <button class="btn btn-block" data-close>Back to the registry</button>
      </div>`);
  });
  $('#paidNo').addEventListener('click', async () => {
    await sb.from('registry_contributions').delete().eq('id', contribId);
    localStorage.removeItem(PENDING_KEY);
    closeModal();
    toast('No problem — nothing was recorded');
  });
}

/* Returning visitor with an unconfirmed payment */
async function checkPending() {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return;
  let pending;
  try { pending = JSON.parse(raw); } catch { localStorage.removeItem(PENDING_KEY); return; }
  const { data } = await sb.from('registry_contributions').select('*').eq('id', pending.id).maybeSingle();
  if (!data || data.confirmed) { localStorage.removeItem(PENDING_KEY); return; }
  openModal(`
    <h2>Welcome back</h2>
    <p class="sub">Last time you started a ${data.method === 'venmo' ? 'Venmo' : 'Zelle'} payment of
      <b>${money(data.amount)}</b> toward <b>${esc(pending.title)}</b>.</p>
    <p style="font-weight:800;margin:0 0 12px">Did the payment go through?</p>
    <div style="display:flex;gap:10px">
      <button class="btn btn-sage" style="flex:1.4" id="paidYes">${ICONS.check} Yes, it went through</button>
      <button class="btn btn-ghost" style="flex:1" id="paidNo">No, cancel it</button>
    </div>`);
  wireConfirmButtons(data.id, data.amount, pending.title);
}

/* ---------- admin ---------- */
const RETAILERS = [
  ['amazon.', 'Amazon'], ['target.', 'Target'], ['walmart.', 'Walmart'],
  ['buybuybaby', 'buybuy BABY'], ['babylist', 'Babylist'], ['etsy.', 'Etsy'],
  ['potterybarnkids', 'Pottery Barn Kids'], ['crateandbarrel', 'Crate & Kids'],
  ['costco', 'Costco'], ['ikea', 'IKEA'], ['carters', "Carter's"],
];
function detectRetailer(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const hit = RETAILERS.find(([frag]) => host.includes(frag));
    return hit ? hit[1] : host.replace(/^www\./, '').split('.')[0].replace(/^\w/, (c) => c.toUpperCase());
  } catch { return ''; }
}

function normalizeProductUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function cleanProductUrl(raw) {
  let url = normalizeProductUrl(raw);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const drop = [
      /^utm_/i, /^gclid$/i, /^gclsrc$/i, /^gbraid$/i, /^gad_/i, /^cm_mmc$/i,
      /^fbclid$/i, /^msclkid$/i, /^mc_/i, /^ref$/i,
    ];
    [...parsed.searchParams.keys()].forEach((key) => {
      if (drop.some((re) => re.test(key))) parsed.searchParams.delete(key);
    });
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

async function fetchProductFromUrl(rawUrl) {
  const url = cleanProductUrl(rawUrl);
  if (!url) throw new Error('Enter a product link first');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const { data, error } = await sb.functions.invoke('fetch-product', {
      body: { url },
      signal: controller.signal,
    });
    if (!error && data && !data.error) return data;
    if (data?.error) throw new Error(data.error);
    throw new Error(error?.message || 'Could not fetch product');
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Lookup timed out — enter details manually.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function wantsOliviaView() {
  return location.hash === '#olivia' || new URLSearchParams(location.search).get('view') === 'olivia';
}

function setOliviaUrl(on) {
  const base = location.pathname + location.search;
  if (on) {
    if (!wantsOliviaView()) history.replaceState(null, '', `${base}#olivia`);
  } else if (wantsOliviaView()) {
    history.replaceState(null, '', base);
  }
}

function promptOlivia() {
  if (state.admin) return;
  openModal(`
    <h2>Olivia’s view</h2>
    <p class="sub">Enter your PIN to manage items, settings, and gifts.</p>
    <div class="field"><input id="pinInput" type="password" inputmode="numeric" placeholder="PIN" autofocus></div>
    <p class="form-error" id="pinError"></p>
    <button class="btn btn-block" id="pinGo">Unlock</button>`);
  const go = () => {
    if ($('#pinInput').value === OLIVIA_PIN) {
      state.admin = true;
      sessionStorage.setItem(ADMIN_KEY, '1');
      setOliviaUrl(true);
      closeModal();
      render();
      toast('Olivia’s view');
    } else $('#pinError').textContent = 'That PIN doesn’t match.';
  };
  $('#pinGo').addEventListener('click', go);
  $('#pinInput').addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

function exitOlivia() {
  state.admin = false;
  sessionStorage.removeItem(ADMIN_KEY);
  setOliviaUrl(false);
  render();
  toast('Guest view');
}

function openItemForm(item) {
  const isEdit = !!item;
  item = item || { title: '', product_url: '', image_url: '', retailer: '', price: '', note: '' };

  if (isEdit) {
    openItemFormFull(item, true);
    return;
  }

  openModal(`
    <h2>Add an item</h2>
    <p class="sub">Paste a product link — we'll pull the title, price, and photo automatically.</p>
    <div class="field">
      <label>Product link</label>
      <input id="fUrl" placeholder="www.amazon.com/... or www.target.com/..." autofocus>
      <div class="hint" id="fUrlHint">Paste or type a link, then wait a moment.</div>
    </div>
    <div class="lookup-loading" id="fLoading" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="spin"><path d="M12 3a9 9 0 1 0 9 9"/></svg>
      <span>Looking up product…</span>
    </div>
    <div id="fFound" hidden>
      <div class="product-found" id="fFoundCard"></div>
    </div>
    <div id="fManual" hidden>
      <p class="manual-label" id="fManualLabel">Fill in what's missing:</p>
      <div class="field" id="fTitleWrap" hidden><label>Title</label>
        <input id="fTitle" maxlength="120" placeholder="Product name"></div>
      <div class="field" id="fPriceWrap" hidden><label>Price you paid ($)</label>
        <input id="fPrice" type="number" min="1" step="0.01" placeholder="0.00"></div>
      <div class="field" id="fImageWrap" hidden><label>Photo URL</label>
        <input id="fImage" placeholder="https://... image link"></div>
      <div class="field" id="fRetailerWrap" hidden><label>Store</label>
        <input id="fRetailer" maxlength="40" placeholder="Amazon"></div>
    </div>
    <div class="field" id="fNoteWrap" hidden>
      <label>Note <span class="label-soft">(optional)</span></label>
      <input id="fNote" maxlength="140" placeholder="The one in oat, not sand">
    </div>
    <p class="form-error" id="fError"></p>
    <button class="btn btn-block" id="fSave" disabled>Add to registry</button>`);

  let fetchSeq = 0;
  let urlTimer;
  let lookupDone = false;
  let suppressUrlInput = false;
  let lastLookupUrl = '';
  let lookupInFlight = false;
  const fetched = { title: '', price: null, image_url: '', retailer: '' };

  const setHint = (msg, cls = '') => {
    $('#fUrlHint').textContent = msg;
    $('#fUrlHint').className = 'hint' + (cls ? ` ${cls}` : '');
  };

  const show = (id, on) => { $(id).hidden = !on; };

  const syncSave = () => {
    const title = fetched.title || $('#fTitle')?.value.trim() || '';
    const price = fetched.price ?? parseFloat($('#fPrice')?.value || '');
    $('#fSave').disabled = !(title && price >= 1);
  };

  const renderFound = () => {
    const title = fetched.title || $('#fTitle')?.value.trim();
    const price = fetched.price ?? parseFloat($('#fPrice')?.value || '');
    const image = fetched.image_url || $('#fImage')?.value.trim();
    const store = fetched.retailer || $('#fRetailer')?.value.trim();

    if (!title && price == null && !image) {
      show('#fFound', false);
      return;
    }

    show('#fFound', true);
    $('#fFoundCard').innerHTML = `
      ${image ? `<img src="${esc(image)}" alt="${esc(title || 'Product')}" onerror="this.style.display='none'">` : `<div class="product-found-ph">${ICONS.gift}</div>`}
      <div class="product-found-body">
        <strong>${esc(title || 'Untitled')}</strong>
        ${price >= 1 ? `<span class="product-found-price">${money(price)}</span>` : '<span class="product-found-missing">Price needed</span>'}
        ${store ? `<span class="product-found-store">${esc(store)}</span>` : ''}
      </div>`;
  };

  const showManualFields = (needs) => {
    show('#fManual', true);
    show('#fTitleWrap', needs.title);
    show('#fPriceWrap', needs.price);
    show('#fImageWrap', needs.image);
    show('#fRetailerWrap', needs.retailer);
    if (needs.title) $('#fTitle').value = fetched.title || '';
    if (needs.price && fetched.price != null) $('#fPrice').value = fetched.price;
    if (needs.image) $('#fImage').value = fetched.image_url || '';
    if (needs.retailer) $('#fRetailer').value = fetched.retailer || '';
  };

  const applyFetch = (data, url) => {
    fetched.title = data.title || '';
    fetched.price = data.price != null ? data.price : null;
    fetched.image_url = data.image_url || '';
    fetched.retailer = data.retailer || detectRetailer(url);

    const needs = {
      title: !fetched.title,
      price: fetched.price == null,
      image: !fetched.image_url,
      retailer: !fetched.retailer,
    };
    const anyMissing = needs.title || needs.price || needs.image;

    renderFound();
    if (anyMissing) {
      $('#fManualLabel').textContent = data.partial
        ? 'This store blocks auto-lookup — we guessed the title from the link. Add price and photo:'
        : (needs.title && needs.price && needs.image)
          ? "Couldn't read this link — fill in the details:"
          : 'Fill in what we couldn\'t find:';
      showManualFields(needs);
    } else {
      show('#fManual', false);
      setHint('Looks good — add a note or save when ready.');
    }
    show('#fNoteWrap', true);
    lookupDone = true;
    syncSave();
  };

  const handleUrlFetch = async (rawUrl, { force = false } = {}) => {
    const url = cleanProductUrl(rawUrl);
    if (!url || url.length < 12) return;
    if (!force && (url === lastLookupUrl || lookupInFlight)) return;

    const seq = ++fetchSeq;
    lookupInFlight = true;
    lookupDone = false;
    lastLookupUrl = url;
    $('#fError').textContent = '';
    show('#fLoading', true);
    show('#fFound', false);
    show('#fManual', false);
    show('#fNoteWrap', false);
    $('#fSave').disabled = true;
    setHint('Looking up product…', 'hint-loading');

    if ($('#fUrl').value.trim() !== url) {
      suppressUrlInput = true;
      $('#fUrl').value = url;
      suppressUrlInput = false;
    }

    try {
      const data = await fetchProductFromUrl(url);
      if (seq !== fetchSeq) return;
      show('#fLoading', false);
      applyFetch(data, url);
    } catch (err) {
      if (seq !== fetchSeq) return;
      show('#fLoading', false);
      fetched.title = '';
      fetched.price = null;
      fetched.image_url = '';
      fetched.retailer = detectRetailer(url);
      setHint(err?.message || 'Could not read that link — enter the details below.');
      show('#fFound', false);
      showManualFields({ title: true, price: true, image: true, retailer: true });
      if (fetched.retailer) $('#fRetailer').value = fetched.retailer;
      show('#fNoteWrap', true);
      lookupDone = true;
      syncSave();
      console.error('Product lookup failed:', err);
    } finally {
      if (seq === fetchSeq) lookupInFlight = false;
    }
  };

  const queueUrlFetch = (raw) => {
    if (suppressUrlInput) return;
    clearTimeout(urlTimer);
    const url = cleanProductUrl(raw);
    if (!url || url.length < 12) {
      setHint('Paste a product link from any store.');
      return;
    }
    if (!/^https?:\/\/[^/]+\/[^/]+/i.test(url)) return;
    urlTimer = setTimeout(() => handleUrlFetch(raw), 800);
  };

  $('#fUrl').addEventListener('input', () => queueUrlFetch($('#fUrl').value));
  $('#fUrl').addEventListener('paste', () => setTimeout(() => handleUrlFetch($('#fUrl').value, { force: true }), 100));
  $('#fUrl').addEventListener('blur', () => {
    const url = cleanProductUrl($('#fUrl').value);
    if (url && url !== lastLookupUrl) handleUrlFetch(url, { force: true });
  });
  ['fTitle', 'fPrice', 'fImage', 'fRetailer'].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('input', () => {
      if (id === 'fTitle') fetched.title = el.value.trim();
      if (id === 'fPrice') fetched.price = parseFloat(el.value) || null;
      if (id === 'fImage') fetched.image_url = el.value.trim();
      if (id === 'fRetailer') fetched.retailer = el.value.trim();
      renderFound();
      syncSave();
    });
  });

  $('#fSave').addEventListener('click', async () => {
    const rec = {
      title: fetched.title || $('#fTitle').value.trim(),
      product_url: cleanProductUrl($('#fUrl').value),
      image_url: fetched.image_url || $('#fImage').value.trim(),
      retailer: fetched.retailer || $('#fRetailer').value.trim() || detectRetailer($('#fUrl').value),
      price: Math.round(parseFloat(String(fetched.price ?? $('#fPrice').value) || '0') * 100) / 100,
      note: $('#fNote').value.trim(),
    };
    if (!rec.title) { $('#fError').textContent = 'Add a title.'; return; }
    if (!(rec.price >= 1)) { $('#fError').textContent = 'Add the price you paid.'; return; }
    if (!lookupDone) { $('#fError').textContent = 'Wait for the link lookup to finish.'; return; }
    $('#fSave').disabled = true;
    const { error } = await sb.from('registry_items').insert(rec);
    if (error) { $('#fError').textContent = 'Could not save — try again.'; $('#fSave').disabled = false; return; }
    closeModal();
    await refresh();
    toast('Item added');
  });
}

function openItemFormFull(item, isEdit) {
  item = item || { title: '', product_url: '', image_url: '', retailer: '', price: '', note: '' };
  openModal(`
    <h2>${isEdit ? 'Edit item' : 'Add an item'}</h2>
    <p class="sub">Update any details for this item.</p>
    <div class="field"><label>Product link</label>
      <input id="fUrl" placeholder="https://www.amazon.com/..." value="${esc(item.product_url)}"></div>
    <div class="product-preview" id="fPreview" hidden></div>
    <div class="field"><label>Item name</label><input id="fTitle" maxlength="120" value="${esc(item.title)}"></div>
    <div class="field-row">
      <div class="field"><label>Price ($)</label><input id="fPrice" type="number" min="1" step="0.01" value="${item.price}"></div>
      <div class="field"><label>Store</label><input id="fRetailer" maxlength="40" value="${esc(item.retailer)}"></div>
    </div>
    <div class="field"><label>Image link</label><input id="fImage" value="${esc(item.image_url)}"></div>
    <div class="field"><label>Note <span class="label-soft">(optional)</span></label>
      <input id="fNote" maxlength="140" value="${esc(item.note)}"></div>
    <p class="form-error" id="fError"></p>
    <button class="btn btn-block" id="fSave">Save changes</button>`);

  const updatePreview = (imageUrl, title) => {
    const el = $('#fPreview');
    if (!imageUrl) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<img src="${esc(imageUrl)}" alt="${esc(title || 'Product')}"><span>${esc(title || '')}</span>`;
  };
  if (item.image_url) updatePreview(item.image_url, item.title);
  $('#fImage').addEventListener('input', () => updatePreview($('#fImage').value.trim(), $('#fTitle').value.trim()));

  $('#fSave').addEventListener('click', async () => {
    const rec = {
      title: $('#fTitle').value.trim(),
      product_url: cleanProductUrl($('#fUrl').value),
      image_url: $('#fImage').value.trim(),
      retailer: $('#fRetailer').value.trim() || detectRetailer($('#fUrl').value),
      price: Math.round(parseFloat($('#fPrice').value || '0') * 100) / 100,
      note: $('#fNote').value.trim(),
    };
    if (!rec.title) { $('#fError').textContent = 'Give the item a name.'; return; }
    if (!(rec.price >= 1)) { $('#fError').textContent = 'Enter the price you paid.'; return; }
    $('#fSave').disabled = true;
    const { error } = await sb.from('registry_items').update(rec).eq('id', item.id);
    if (error) { $('#fError').textContent = 'Could not save — try again.'; $('#fSave').disabled = false; return; }
    closeModal();
    await refresh();
    toast('Saved');
  });
}

function openQuickEdit(item) {
  openModal(`
    <h2>Edit title &amp; price</h2>
    <p class="sub">Quick update for <b>${esc(item.title)}</b></p>
    <div class="field"><label>Title</label>
      <input id="qeTitle" maxlength="120" value="${esc(item.title)}"></div>
    <div class="field"><label>Price ($)</label>
      <input id="qePrice" type="number" min="1" step="0.01" value="${item.price}"></div>
    <p class="form-error" id="qeError"></p>
    <button class="btn btn-block" id="qeSave">Save changes</button>
    <button class="btn btn-block btn-ghost" data-edit-full="${item.id}" style="margin-top:8px">Edit all details (link, photo, note)</button>`);

  $('#qeSave').addEventListener('click', async () => {
    const title = $('#qeTitle').value.trim();
    const price = Math.round(parseFloat($('#qePrice').value || '0') * 100) / 100;
    if (!title) { $('#qeError').textContent = 'Give the item a name.'; return; }
    if (!(price >= 1)) { $('#qeError').textContent = 'Enter a valid price.'; return; }
    $('#qeSave').disabled = true;
    const { error } = await sb.from('registry_items').update({ title, price }).eq('id', item.id);
    if (error) { $('#qeError').textContent = 'Could not save — try again.'; $('#qeSave').disabled = false; return; }
    closeModal();
    await refresh();
    toast('Item updated');
  });
}

function openDeleteConfirm(item) {
  const gifts = contribsFor(item.id).length;
  openModal(`
    <h2>Delete this item?</h2>
    <p class="sub"><b>${esc(item.title)}</b> will be removed from the registry${gifts ? ` along with ${gifts} gift record${gifts === 1 ? '' : 's'}` : ''}. This can’t be undone.</p>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn btn-danger" style="flex:1" id="delYes">${ICONS.trash} Delete item</button>
      <button class="btn btn-ghost" style="flex:1" data-close>Cancel</button>
    </div>`);

  $('#delYes').addEventListener('click', async () => {
    $('#delYes').disabled = true;
    const { error } = await sb.from('registry_items').delete().eq('id', item.id);
    if (error) {
      toast('Could not delete — try again');
      $('#delYes').disabled = false;
      return;
    }
    closeModal();
    await refresh();
    toast('Item deleted');
  });
}

function openContribsList(item) {
  const list = contribsFor(item.id);
  openModal(`
    <h2>Gifts for this item</h2>
    <p class="sub">${esc(item.title)} &middot; ${money(fundedFor(item.id))} of ${money(item.price)} confirmed</p>
    ${list.length ? `<ul class="contrib-list">${list.map((c) => `
      <li>
        <div class="who"><b>${esc(c.contributor_name)}</b>${c.anonymous ? ' <span class="pill pill-anon">Anonymous publicly</span>' : ''} &middot; ${money(c.amount)} via ${c.method === 'venmo' ? 'Venmo' : 'Zelle'}
          ${c.message ? `<small>&ldquo;${esc(c.message)}&rdquo;</small>` : ''}</div>
        <span class="pill ${c.confirmed ? 'pill-ok' : 'pill-pend'}">${c.confirmed ? 'Confirmed' : 'Pending'}</span>
        ${c.confirmed ? '' : `<button class="iconbtn" title="Mark confirmed" data-confirm-contrib="${c.id}">${ICONS.check}</button>`}
        <button class="iconbtn" title="Remove" data-del-contrib="${c.id}">${ICONS.trash}</button>
      </li>`).join('')}</ul>`
      : '<p class="sub">No gifts yet for this one.</p>'}`);

  document.querySelectorAll('[data-del-contrib]').forEach((b) =>
    b.addEventListener('click', async () => {
      await sb.from('registry_contributions').delete().eq('id', b.dataset.delContrib);
      await refresh(); openContribsList(state.items.find((i) => i.id === item.id));
    }));
  document.querySelectorAll('[data-confirm-contrib]').forEach((b) =>
    b.addEventListener('click', async () => {
      await sb.from('registry_contributions').update({ confirmed: true }).eq('id', b.dataset.confirmContrib);
      await refresh(); openContribsList(state.items.find((i) => i.id === item.id));
    }));
}

function openSettings() {
  const s = state.settings;
  openModal(`
    <h2>Registry settings</h2>
    <p class="sub">Payment details are shown to guests when they contribute.</p>
    <div class="field"><label>Registry title</label><input id="sNames" maxlength="80" value="${esc(s.parent_names)}" placeholder="Our Baby Registry"></div>
    <div class="field"><label>Top photo URL</label>
      <input id="sHeroPhoto" maxlength="500" value="${esc(s.hero_photo_url)}" placeholder="https://... link to a photo">
      <div class="hint">Paste a link to a photo — it appears at the top of the registry.</div></div>
    ${s.hero_photo_url ? `<div class="settings-preview"><img src="${esc(s.hero_photo_url)}" alt="Hero preview" onerror="this.parentElement.hidden=true"></div>` : ''}
    <div class="field"><label>Welcome message</label><textarea id="sWelcome" rows="3" maxlength="400">${esc(s.welcome_message || DEFAULT_WELCOME)}</textarea></div>
    <div class="field"><label>Why cash? (shipping note)</label><textarea id="sShipping" rows="2" maxlength="300">${esc(s.shipping_note || DEFAULT_SHIPPING)}</textarea>
      <div class="hint">Shown under the welcome message — explains the Indonesia / in-country buying story.</div></div>
    <div class="field"><label>Venmo username</label><input id="sVenmo" maxlength="60" value="${esc(s.venmo_username)}" placeholder="@your-venmo">
      <div class="hint">Guests are deep-linked straight into Venmo with the amount pre-filled.</div></div>
    <div class="field-row">
      <div class="field"><label>Zelle email or phone</label><input id="sZelle" maxlength="80" value="${esc(s.zelle_handle || DEFAULT_ZELLE_HANDLE)}" placeholder="stevenwilson614@gmail.com"></div>
      <div class="field"><label>Zelle recipient name</label><input id="sZelleName" maxlength="80" value="${esc(s.zelle_name)}" placeholder="Steven Wilson"></div>
    </div>
    <p class="form-error" id="sError"></p>
    <button class="btn btn-block" id="sSave">Save settings</button>`);

  $('#sSave').addEventListener('click', async () => {
    const rec = {
      parent_names: $('#sNames').value.trim() || 'Our Baby Registry',
      hero_photo_url: $('#sHeroPhoto').value.trim(),
      welcome_message: $('#sWelcome').value.trim(),
      shipping_note: $('#sShipping').value.trim(),
      venmo_username: $('#sVenmo').value.trim(),
      zelle_handle: $('#sZelle').value.trim(),
      zelle_name: $('#sZelleName').value.trim(),
      updated_at: new Date().toISOString(),
    };
    $('#sSave').disabled = true;
    const { error } = await sb.from('registry_settings').update(rec).eq('id', 1);
    if (error) { $('#sError').textContent = 'Could not save — try again.'; $('#sSave').disabled = false; return; }
    closeModal();
    await refresh();
    toast('Settings saved');
  });
}

/* ---------- wiring ---------- */
async function refresh() {
  await loadAll();
  render();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-close], [data-contribute], [data-payfull], [data-edit], [data-edit-full], [data-delete], [data-received], [data-contribs]');
  if (!t) {
    if (e.target === $('#overlay')) closeModal();
    return;
  }
  const item = (id) => state.items.find((i) => i.id === id);
  if (t.hasAttribute('data-close')) closeModal();
  else if (t.dataset.contribute) openContribute(item(t.dataset.contribute), false);
  else if (t.dataset.payfull) openContribute(item(t.dataset.payfull), true);
  else if (t.dataset.edit) openQuickEdit(item(t.dataset.edit));
  else if (t.dataset.editFull) openItemFormFull(item(t.dataset.editFull), true);
  else if (t.dataset.contribs) openContribsList(item(t.dataset.contribs));
  else if (t.dataset.received) {
    const it = item(t.dataset.received);
    sb.from('registry_items').update({ received: !it.received }).eq('id', it.id).then(refresh);
  } else if (t.dataset.delete) openDeleteConfirm(item(t.dataset.delete));
});

$('#btnAdmin').addEventListener('click', promptOlivia);
$('#btnExitAdmin').addEventListener('click', exitOlivia);
$('#btnExitGuest').addEventListener('click', exitOlivia);
$('#btnAddItem').addEventListener('click', () => openItemForm(null));
$('#btnSettings').addEventListener('click', openSettings);
document.getElementById('sortBar')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.sort-btn');
  if (!btn) return;
  const next = btn.dataset.sort;
  state.priceSort = state.priceSort === next ? '' : next;
  if (state.priceSort) sessionStorage.setItem(SORT_KEY, state.priceSort);
  else sessionStorage.removeItem(SORT_KEY);
  renderGrid();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

(async function init() {
  try {
    await loadAll();
    render();
    if (wantsOliviaView() && !state.admin) promptOlivia();
    else if (state.admin) setOliviaUrl(true);
    await checkPending();
  } catch (e) {
    console.error(e);
    $('#grid').innerHTML = `<div class="empty">${ICONS.gift}<h3>Couldn’t load the registry</h3><p>Please refresh the page in a moment.</p></div>`;
  }
})();
