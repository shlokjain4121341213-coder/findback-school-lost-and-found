import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const configured = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY &&
  !SUPABASE_URL.includes('PASTE_') && !SUPABASE_PUBLISHABLE_KEY.includes('PASTE_')
);
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;
const BUCKET = 'school-lost-found';

const state = {
  user: null,
  profile: null,
  items: [],
  myClaims: [],
  kindFilter: 'all',
  categoryFilter: 'all',
  search: '',
  currentView: 'browse',
  signupMode: false,
  pendingVerification: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function showToast(message, isError) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', Boolean(isError));
  toast.classList.remove('hidden');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add('hidden'), 4200);
}

function userFacingError(error) {
  const message = error && error.message ? error.message : 'Something went wrong. Please try again.';
  if (message.toLowerCase().includes('duplicate key') || message.toLowerCase().includes('already exists')) {
    return 'You already have a claim for this item.';
  }
  if (message.toLowerCase().includes('allowed by your school') || message.toLowerCase().includes('school email')) {
    return 'Use an email address allowed by your school.';
  }
  if (message.toLowerCase().includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (message.toLowerCase().includes('email not confirmed')) return 'Please confirm your email from the message Supabase sent you, then sign in.';
  return message;
}

function setButtonBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.innerHTML;
    button.disabled = true;
    button.textContent = busyLabel || 'Please wait…';
  } else {
    button.disabled = false;
    if (button.dataset.originalLabel) button.innerHTML = button.dataset.originalLabel;
    delete button.dataset.originalLabel;
  }
}

function setAuthMode(signup) {
  state.signupMode = signup;
  $('#login-mode').classList.toggle('selected', !signup);
  $('#signup-mode').classList.toggle('selected', signup);
  $('#name-field').classList.toggle('hidden', !signup);
  $('#auth-name').required = signup;
  $('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  $('#auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
  $('#auth-subtitle').textContent = signup ? 'Join your school lost & found' : 'Sign in to your school account';
  $('#auth-submit').innerHTML = signup ? 'Create account <span aria-hidden="true">→</span>' : 'Sign in <span aria-hidden="true">→</span>';
  $('#auth-help').textContent = signup
    ? 'Your account starts as a member. A school head can grant invigilator access.'
    : 'New here? Choose Create account. Only signed-in school community members can view the board.';
}

function setView(view) {
  const staff = Boolean(state.profile && ['invigilator', 'head'].includes(state.profile.role));
  const head = Boolean(state.profile && state.profile.role === 'head');
  if (view === 'staff' && !staff) view = 'browse';
  if (view === 'team' && !head) view = 'browse';
  state.currentView = view;
  $('#browse-view').classList.toggle('hidden', view !== 'browse');
  $('#claims-view').classList.toggle('hidden', view !== 'claims');
  $('#staff-view').classList.toggle('hidden', view !== 'staff');
  $('#team-view').classList.toggle('hidden', view !== 'team');
  $$('.view-tab').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  if (view === 'claims') loadMyClaims();
  if (view === 'staff') loadStaffClaims();
  if (view === 'team') loadTeam();
}

async function showSignedInApp(user) {
  state.user = user || null;
  if (!user) {
    state.profile = null;
    $('#auth-shell').classList.remove('hidden');
    $('#app-shell').classList.add('hidden');
    $('#account-chip').classList.add('hidden');
    return;
  }

  $('#auth-shell').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  $('#account-chip').classList.remove('hidden');

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,display_name,role')
    .eq('id', user.id)
    .single();
  if (error) {
    showToast('Your account is signed in, but its profile could not load: ' + userFacingError(error), true);
    return;
  }
  state.profile = data;
  $('#account-chip').textContent = (data.display_name || data.email) + ' · ' + data.role;
  $('#staff-tab').classList.toggle('hidden', !['invigilator', 'head'].includes(data.role));
  $('#head-tab').classList.toggle('hidden', data.role !== 'head');
  if (state.currentView === 'staff' && !['invigilator', 'head'].includes(data.role)) state.currentView = 'browse';
  if (state.currentView === 'team' && data.role !== 'head') state.currentView = 'browse';
  setView(state.currentView || 'browse');
  await Promise.all([loadItems(), loadMyClaims()]);
}

async function loadItems() {
  if (!state.user) return;
  const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false });
  if (error) {
    showToast('Could not load items: ' + userFacingError(error), true);
    return;
  }
  state.items = await Promise.all((data || []).map(async (item) => {
    if (!item.photo_path) return Object.assign({}, item, { photo_url: '' });
    const result = await supabase.storage.from(BUCKET).createSignedUrl(item.photo_path, 3600);
    return Object.assign({}, item, { photo_url: result.data && result.data.signedUrl ? result.data.signedUrl : '' });
  }));
  renderItems();
}

function itemStatusLabel(status) {
  return ({ open: 'Available', claimed: 'Claim approved', returned: 'Returned', closed: 'Closed' })[status] || status;
}

function claimStatusLabel(status) {
  return ({
    pending: 'Waiting for staff',
    awaiting_answer: 'Questions sent',
    answered: 'Reply received',
    approved: 'Ownership approved',
    rejected: 'Not approved',
  })[status] || status;
}

function niceDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(value));
}

function renderItems() {
  const ownByItem = new Map((state.myClaims || []).map((claim) => [claim.item_id, claim]));
  const query = state.search.trim().toLowerCase();
  const filtered = state.items.filter((item) => {
    const matchesKind = state.kindFilter === 'all' || item.kind === state.kindFilter;
    const matchesCategory = state.categoryFilter === 'all' || item.category === state.categoryFilter;
    const searchable = [item.title, item.code, item.category, item.location, item.description].join(' ').toLowerCase();
    return matchesKind && matchesCategory && (!query || searchable.includes(query));
  });
  $('#items-summary').textContent = filtered.length + (filtered.length === 1 ? ' item on the board' : ' items on the board');
  $('#items-empty').classList.toggle('hidden', filtered.length !== 0);
  $('#items-grid').classList.toggle('hidden', filtered.length === 0);
  $('#items-grid').innerHTML = filtered.map((item) => {
    const claim = ownByItem.get(item.id);
    let action = '';
    if (item.kind === 'found' && item.status === 'open' && item.reported_by !== state.user.id && !claim) {
      action = '<button class="button button-primary button-small" data-action="claim" data-id="' + escapeHtml(item.id) + '" type="button">Claim item</button>';
    } else if (claim) {
      action = '<span class="status-text">' + escapeHtml(claimStatusLabel(claim.status)) + '</span>';
    } else if (item.kind === 'lost' && item.reported_by === state.user.id && item.status === 'open') {
      action = '<span class="status-text">Your report</span>';
    }
    if (state.profile && ['invigilator', 'head'].includes(state.profile.role) && item.status === 'claimed') {
      action += '<button class="button button-secondary button-small" data-action="returned" data-id="' + escapeHtml(item.id) + '" type="button">Mark returned</button>';
    }
    const photo = item.photo_url
      ? '<img src="' + escapeHtml(item.photo_url) + '" alt="Photo of ' + escapeHtml(item.title) + '" loading="lazy">'
      : '<span class="photo-placeholder" aria-hidden="true">' + (item.category === 'Books' ? '▤' : item.category === 'Bags' ? '◈' : item.category === 'Clothing' ? '◇' : '✦') + '</span>';
    return '<article class="item-card">' +
      '<div class="item-photo">' + photo + '</div>' +
      '<div class="item-body">' +
        '<div class="item-kicker"><span class="item-type ' + escapeHtml(item.kind) + '">' + escapeHtml(item.kind) + '</span><span class="status-pill ' + escapeHtml(item.status) + '">' + escapeHtml(itemStatusLabel(item.status)) + '</span></div>' +
        '<h3 title="' + escapeHtml(item.title) + '">' + escapeHtml(item.title) + '</h3>' +
        '<div class="item-meta"><span>' + escapeHtml(item.location) + '</span><span>· ' + escapeHtml(niceDate(item.created_at)) + '</span><span>· ' + escapeHtml(item.category) + '</span></div>' +
        '<p class="item-desc">' + escapeHtml(item.description || 'No extra description added.') + '</p>' +
        '<div class="item-footer"><span class="lost-code">' + escapeHtml(item.code) + '</span><div class="item-actions">' + action + '</div></div>' +
      '</div>' +
    '</article>';
  }).join('');
}

const CLAIM_SELECT = 'id,item_id,message,status,created_at,item:items!claims_item_id_fkey(code,title,location,category),verification:claim_verifications!claim_verifications_claim_id_fkey(id,question,response,responded_at)';

function related(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

async function loadMyClaims() {
  if (!state.user) return;
  const { data, error } = await supabase.from('claims').select(CLAIM_SELECT).order('created_at', { ascending: false });
  if (error) {
    showToast('Could not load your claims: ' + userFacingError(error), true);
    return;
  }
  state.myClaims = data || [];
  $('#my-claim-count').textContent = String(state.myClaims.length);
  renderItems();
  renderMyClaims();
}

function renderMyClaims() {
  const container = $('#my-claims-list');
  if (!state.myClaims.length) {
    container.innerHTML = '<div class="no-results">You have not claimed an item yet. Choose a found item from Browse items to start.</div>';
    return;
  }
  container.innerHTML = state.myClaims.map((claim) => {
    const item = related(claim.item) || {};
    const verification = related(claim.verification);
    let detail = '<p>' + escapeHtml(claim.message) + '</p>';
    if (verification) {
      detail += '<div class="claim-details"><strong>Invigilator ownership questions</strong><p>' + escapeHtml(verification.question) + '</p></div>';
      if (claim.status === 'awaiting_answer') {
        detail += '<form class="answer-form" data-verification-id="' + escapeHtml(verification.id) + '"><label class="answer-label">Your answer<textarea name="response" required maxlength="1000" rows="3" placeholder="Answer the questions with details only the owner would know."></textarea></label><button class="button button-primary button-small" type="submit">Send answer</button></form>';
      } else if (verification.response) {
        detail += '<div class="claim-details"><strong>Your answer</strong><p>' + escapeHtml(verification.response) + '</p></div>';
      }
    }
    return '<article class="claim-row"><div class="claim-main"><div class="claim-title-line"><h3>' + escapeHtml(item.title || 'Found item') + '</h3><span class="status-pill ' + (claim.status === 'approved' ? 'returned' : claim.status === 'rejected' ? 'closed' : 'claimed') + '">' + escapeHtml(claimStatusLabel(claim.status)) + '</span></div>' +
      '<p>' + escapeHtml(item.code || '') + ' · ' + escapeHtml(item.location || '') + ' · Claimed ' + escapeHtml(niceDate(claim.created_at)) + '</p>' + detail +
      '</div><span class="status-text">' + escapeHtml(claimStatusLabel(claim.status)) + '</span></article>';
  }).join('');
}

async function loadStaffClaims() {
  if (!state.profile || !['invigilator', 'head'].includes(state.profile.role)) return;
  const container = $('#staff-claims-list');
  const { data, error } = await supabase.from('claims').select(
    'id,item_id,claimant_id,claimant_name,claimant_email,message,status,created_at,item:items!claims_item_id_fkey(code,title,location,category),verification:claim_verifications!claim_verifications_claim_id_fkey(id,question,response,responded_at)'
  ).in('status', ['pending', 'awaiting_answer', 'answered']).order('created_at', { ascending: true });
  if (error) {
    showToast('Could not load claim review: ' + userFacingError(error), true);
    return;
  }
  if (!data || !data.length) {
    container.innerHTML = '<div class="no-results">No claims need review right now.</div>';
    return;
  }
  container.innerHTML = data.map((claim) => {
    const item = related(claim.item) || {};
    const verification = related(claim.verification);
    let actions = '';
    if (claim.status === 'pending') {
      actions = '<button class="button button-secondary button-small" data-action="ask" data-id="' + escapeHtml(claim.id) + '" type="button">Ask ownership questions</button><button class="button button-primary button-small" data-action="approve" data-id="' + escapeHtml(claim.id) + '" type="button">Approve</button><button class="button button-quiet button-small" data-action="reject" data-id="' + escapeHtml(claim.id) + '" type="button">Reject</button>';
    } else if (claim.status === 'answered') {
      actions = '<button class="button button-primary button-small" data-action="approve" data-id="' + escapeHtml(claim.id) + '" type="button">Approve</button><button class="button button-quiet button-small" data-action="reject" data-id="' + escapeHtml(claim.id) + '" type="button">Reject</button>';
    } else {
      actions = '<button class="button button-quiet button-small" data-action="reject" data-id="' + escapeHtml(claim.id) + '" type="button">Reject claim</button>';
    }
    let detail = '<div class="claim-details"><strong>Claimant note</strong><p>' + escapeHtml(claim.message) + '</p></div>';
    if (verification) {
      detail += '<div class="claim-details"><strong>Ownership questions sent</strong><p>' + escapeHtml(verification.question) + '</p></div>';
      if (verification.response) detail += '<div class="claim-details"><strong>Claimant reply</strong><p>' + escapeHtml(verification.response) + '</p></div>';
    }
    return '<article class="claim-row"><div class="claim-main"><div class="claim-title-line"><h3>' + escapeHtml(item.title || 'Found item') + '</h3><span class="status-pill ' + (claim.status === 'answered' ? 'open' : 'claimed') + '">' + escapeHtml(claimStatusLabel(claim.status)) + '</span></div>' +
      '<p>' + escapeHtml(item.code || '') + ' · ' + escapeHtml(item.location || '') + '</p><p>Claimant: ' + escapeHtml(claim.claimant_name) + ' · ' + escapeHtml(claim.claimant_email) + '</p>' + detail +
      '</div><div class="claim-actions">' + actions + '</div></article>';
  }).join('');
}

async function loadTeam() {
  if (!state.profile || state.profile.role !== 'head') return;
  const container = $('#team-list');
  const { data, error } = await supabase.from('profiles').select('id,email,display_name,role,created_at').order('created_at', { ascending: true });
  if (error) {
    showToast('Could not load team accounts: ' + userFacingError(error), true);
    return;
  }
  if (!data || !data.length) {
    container.innerHTML = '<div class="no-results">No accounts are registered yet.</div>';
    return;
  }
  container.innerHTML = data.map((person) => {
    let action = '';
    if (person.id !== state.user.id && person.role === 'member') {
      action = '<button class="button button-secondary button-small" data-action="grant" data-id="' + escapeHtml(person.id) + '" type="button">Make invigilator</button>';
    } else if (person.id !== state.user.id && person.role === 'invigilator') {
      action = '<button class="button button-quiet button-small" data-action="remove" data-id="' + escapeHtml(person.id) + '" type="button">Remove access</button>';
    }
    const roleClass = ['head', 'invigilator'].includes(person.role) ? ' ' + person.role : '';
    return '<article class="team-row"><div class="team-person"><strong>' + escapeHtml(person.display_name || 'School member') + '<span class="role-chip' + roleClass + '">' + escapeHtml(person.role) + '</span></strong><span>' + escapeHtml(person.email) + ' · joined ' + escapeHtml(niceDate(person.created_at)) + '</span></div><div class="claim-actions">' + action + '</div></article>';
  }).join('');
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog && dialog.open) dialog.close();
}

async function createAccountOrSignIn(event) {
  event.preventDefault();
  if (!supabase) return;
  const button = $('#auth-submit');
  setButtonBusy(button, true, state.signupMode ? 'Creating account…' : 'Signing in…');
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  try {
    if (state.signupMode) {
      const displayName = $('#auth-name').value.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: window.location.href.split('#')[0],
        },
      });
      if (error) throw error;
      if (data.session) {
        showToast('Your account is ready. Welcome to Foundry!');
      } else {
        showToast('Account created. Check your email to confirm it, then sign in.');
        $('#auth-form').reset();
        setAuthMode(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    showToast(userFacingError(error), true);
  } finally {
    setButtonBusy(button, false);
  }
}

async function submitReport(event) {
  event.preventDefault();
  if (!state.user) return;
  const submitButton = event.submitter;
  setButtonBusy(submitButton, true, 'Posting…');
  let uploadedPath = null;
  try {
    const file = $('#report-photo').files[0] || null;
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
      if (file.size > 3 * 1024 * 1024) throw new Error('Choose an image smaller than 3 MB.');
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
      uploadedPath = state.user.id + '/' + crypto.randomUUID() + '.' + extension;
      const uploaded = await supabase.storage.from(BUCKET).upload(uploadedPath, file, {
        cacheControl: '3600', upsert: false, contentType: file.type,
      });
      if (uploaded.error) throw uploaded.error;
    }
    const { error } = await supabase.from('items').insert({
      reported_by: state.user.id,
      kind: $('#report-kind').value,
      category: $('#report-category').value,
      title: $('#report-title').value.trim(),
      location: $('#report-location').value.trim(),
      description: $('#report-description').value.trim(),
      photo_path: uploadedPath,
    });
    if (error) {
      if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath]);
      throw error;
    }
    $('#report-form').reset();
    closeDialog('report-dialog');
    showToast('Your item is on the board. Thanks for helping!');
    await loadItems();
  } catch (error) {
    showToast(userFacingError(error), true);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

function startClaim(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  $('#claim-item-id').value = item.id;
  $('#claim-item-label').innerHTML = '<strong>' + escapeHtml(item.title) + '</strong> · ' + escapeHtml(item.code) + ' · ' + escapeHtml(item.location);
  $('#claim-message').value = '';
  openDialog('claim-dialog');
}

async function submitClaim(event) {
  event.preventDefault();
  const button = event.submitter;
  setButtonBusy(button, true, 'Sending…');
  try {
    const { error } = await supabase.from('claims').insert({
      item_id: $('#claim-item-id').value,
      claimant_id: state.user.id,
      message: $('#claim-message').value.trim(),
    });
    if (error) throw error;
    closeDialog('claim-dialog');
    showToast('Your claim was sent privately to the invigilators.');
    await Promise.all([loadMyClaims(), loadItems()]);
  } catch (error) {
    showToast(userFacingError(error), true);
  } finally {
    setButtonBusy(button, false);
  }
}

function startVerification(claimId) {
  const claim = document.querySelector('[data-action="ask"][data-id="' + CSS.escape(claimId) + '"]');
  const row = claim ? claim.closest('.claim-row') : null;
  const heading = row ? row.querySelector('h3') : null;
  const code = row ? row.querySelector('.lost-code') : null;
  $('#verification-claim-id').value = claimId;
  $('#verification-question').value = '';
  $('#verification-item-label').innerHTML = '<strong>' + escapeHtml(heading ? heading.textContent : 'Found item') + '</strong>' + (code ? ' · ' + escapeHtml(code.textContent) : '');
  openDialog('verification-dialog');
}

async function submitVerification(event) {
  event.preventDefault();
  const button = event.submitter;
  setButtonBusy(button, true, 'Sending…');
  const claimId = $('#verification-claim-id').value;
  try {
    const updated = await supabase.from('claims').update({ status: 'awaiting_answer' }).eq('id', claimId).eq('status', 'pending');
    if (updated.error) throw updated.error;
    const inserted = await supabase.from('claim_verifications').insert({
      claim_id: claimId,
      question: $('#verification-question').value.trim(),
      created_by: state.user.id,
    });
    if (inserted.error) {
      await supabase.from('claims').update({ status: 'pending' }).eq('id', claimId).eq('status', 'awaiting_answer');
      throw inserted.error;
    }
    closeDialog('verification-dialog');
    showToast('Ownership questions sent. The claimant can answer from My claims.');
    await loadStaffClaims();
  } catch (error) {
    showToast(userFacingError(error), true);
  } finally {
    setButtonBusy(button, false);
  }
}

async function submitVerificationAnswer(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  setButtonBusy(button, true, 'Sending…');
  try {
    const response = new FormData(form).get('response').toString().trim();
    const verificationId = form.dataset.verificationId;
    const { error } = await supabase.from('claim_verifications').update({
      response,
      responded_at: new Date().toISOString(),
    }).eq('id', verificationId);
    if (error) throw error;
    showToast('Your answer was sent privately to the invigilators.');
    await Promise.all([loadMyClaims(), loadStaffClaims()]);
  } catch (error) {
    showToast(userFacingError(error), true);
  } finally {
    setButtonBusy(button, false);
  }
}

async function decideClaim(claimId, decision) {
  const label = decision === 'approved' ? 'approve this ownership claim' : 'reject this ownership claim';
  if (!window.confirm('Are you sure you want to ' + label + '?')) return;
  try {
    const { error } = await supabase.from('claims').update({ status: decision }).eq('id', claimId);
    if (error) throw error;
    showToast(decision === 'approved' ? 'Claim approved. The item is now marked as claimed.' : 'Claim rejected.');
    await Promise.all([loadStaffClaims(), loadItems(), loadMyClaims()]);
  } catch (error) {
    showToast(userFacingError(error), true);
  }
}

async function markItemReturned(itemId) {
  if (!window.confirm('Confirm that the item has been handed back to its owner?')) return;
  try {
    const { error } = await supabase.from('items').update({ status: 'returned' }).eq('id', itemId);
    if (error) throw error;
    showToast('Item marked as returned.');
    await loadItems();
  } catch (error) {
    showToast(userFacingError(error), true);
  }
}

async function changeMemberRole(personId, role) {
  const message = role === 'invigilator' ? 'grant this member invigilator access' : 'remove this member’s invigilator access';
  if (!window.confirm('Are you sure you want to ' + message + '?')) return;
  try {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', personId);
    if (error) throw error;
    showToast(role === 'invigilator' ? 'Invigilator access granted.' : 'Invigilator access removed.');
    await loadTeam();
  } catch (error) {
    showToast(userFacingError(error), true);
  }
}

function bindEvents() {
  $('#login-mode').addEventListener('click', () => setAuthMode(false));
  $('#signup-mode').addEventListener('click', () => setAuthMode(true));
  $('#auth-form').addEventListener('submit', createAccountOrSignIn);
  $('#report-form').addEventListener('submit', submitReport);
  $('#claim-form').addEventListener('submit', submitClaim);
  $('#verification-form').addEventListener('submit', submitVerification);
  $('#signout-button').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showToast(userFacingError(error), true);
  });
  $('#report-open').addEventListener('click', () => openDialog('report-dialog'));
  document.addEventListener('click', (event) => {
    const close = event.target.closest('[data-close]');
    if (close) closeDialog(close.dataset.close);
    if (event.target.closest('[data-open-report]')) openDialog('report-dialog');
  });
  $('#view-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) setView(button.dataset.view);
  });
  $('#search-input').addEventListener('input', (event) => {
    state.search = event.target.value;
    renderItems();
  });
  $$('.filter-chip').forEach((button) => button.addEventListener('click', () => {
    state.kindFilter = button.dataset.kind;
    $$('.filter-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
    renderItems();
  }));
  $('#category-filter').addEventListener('change', (event) => {
    state.categoryFilter = event.target.value;
    renderItems();
  });
  $('#items-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'claim') startClaim(button.dataset.id);
    if (button.dataset.action === 'returned') markItemReturned(button.dataset.id);
  });
  $('#my-claims-list').addEventListener('submit', (event) => {
    if (event.target.matches('.answer-form')) submitVerificationAnswer(event);
  });
  $('#staff-claims-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'ask') startVerification(button.dataset.id);
    if (button.dataset.action === 'approve') decideClaim(button.dataset.id, 'approved');
    if (button.dataset.action === 'reject') decideClaim(button.dataset.id, 'rejected');
  });
  $('#team-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'grant') changeMemberRole(button.dataset.id, 'invigilator');
    if (button.dataset.action === 'remove') changeMemberRole(button.dataset.id, 'member');
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (!$('#app-shell').classList.contains('hidden')) $('#search-input').focus();
    }
  });
}

async function start() {
  bindEvents();
  if (!configured) {
    $('#setup-warning').classList.remove('hidden');
    $('#auth-submit').disabled = true;
    return;
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => showSignedInApp(session ? session.user : null), 0);
  });
  const { data, error } = await supabase.auth.getSession();
  if (error) showToast(userFacingError(error), true);
  await showSignedInApp(data ? data.session && data.session.user : null);
}

start();
