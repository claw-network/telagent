import {
  ApiProblemError,
  TelagentApiClient,
  createEnvelopeId,
  isDidClaw,
  toCiphertextHex,
} from './core/api-client.js';

const STORAGE_API_BASE_KEY = 'telagent.web.apiBase.v1';
const DEFAULT_API_BASE = 'http://127.0.0.1:9528';
const DEFAULT_DID = 'did:claw:zAlice';

const appRoot = document.querySelector('#app');

if (!appRoot) {
  throw new Error('app root not found');
}

const state = {
  apiBase: localStorage.getItem(STORAGE_API_BASE_KEY) || DEFAULT_API_BASE,
  route: parseRoute(location.hash),
  senderDid: DEFAULT_DID,
  targetDomain: 'alpha.tel',
  mailboxKeyId: 'mailbox-main',
  activeConversationId: 'group:demo-room',
  draftMessage: 'Hello from TelAgent Web App',
  conversations: [
    { id: 'group:demo-room', label: 'Demo Group' },
    { id: 'direct:alice-bob', label: 'Direct: Alice/Bob' },
  ],
  messagesByConversation: new Map(),
  cursorsByConversation: new Map(),
  groupForm: createInitialGroupForm(),
  selfIdentity: null,
  resolvedIdentity: null,
  identityLookupDid: 'did:claw:zBob',
  banner: null,
  busyKeys: new Set(),
  logs: [],
  lastResponse: null,
};

const apiClient = new TelagentApiClient({ baseUrl: state.apiBase });

window.addEventListener('hashchange', () => {
  state.route = parseRoute(location.hash);
  if (state.route.name === 'sessions' && state.route.conversationId) {
    setActiveConversation(state.route.conversationId);
  }
  render();
});

void bootstrap();

async function bootstrap() {
  if (state.route.name === 'sessions' && state.route.conversationId) {
    setActiveConversation(state.route.conversationId);
  }
  render();
  await refreshSelfIdentity();
}

function parseRoute(hashValue) {
  const hash = (hashValue || '#/sessions').replace(/^#/, '');
  const normalized = hash.startsWith('/') ? hash : '/sessions';
  const [pathOnly] = normalized.split('?');
  const parts = pathOnly.split('/').filter(Boolean);

  if (parts[0] === 'groups') {
    return { name: 'groups' };
  }
  if (parts[0] === 'identity') {
    return { name: 'identity' };
  }
  if (parts[0] === 'settings') {
    return { name: 'settings' };
  }
  if (parts[0] === 'sessions' && parts[1]) {
    return { name: 'sessions', conversationId: decodeURIComponent(parts[1]) };
  }
  return { name: 'sessions' };
}

function navigate(route) {
  if (route === 'sessions') {
    location.hash = `#/sessions/${encodeURIComponent(state.activeConversationId)}`;
    return;
  }
  location.hash = `#/${route}`;
}

function setBusy(key, enabled) {
  if (enabled) {
    state.busyKeys.add(key);
  } else {
    state.busyKeys.delete(key);
  }
}

function isBusy(key) {
  return state.busyKeys.has(key);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function randomHex(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return `0x${Array.from(buffer, (entry) => entry.toString(16).padStart(2, '0')).join('')}`;
}

function createInitialGroupForm() {
  return {
    creatorDid: DEFAULT_DID,
    inviteeDid: 'did:claw:zBob',
    groupId: randomHex(32),
    groupDomain: 'alpha.tel',
    domainProofHash: randomHex(32),
    initialMlsStateHash: randomHex(32),
    inviteId: randomHex(32),
    inviteMlsCommitHash: randomHex(32),
    acceptMlsWelcomeHash: randomHex(32),
  };
}

function addLog(level, action, detail) {
  const timestamp = new Date().toISOString();
  state.logs.unshift({ level, action, detail, timestamp });
  state.logs = state.logs.slice(0, 40);
}

function setLastResponse(label, payload) {
  state.lastResponse = {
    label,
    payload,
    at: new Date().toISOString(),
  };
}

function setBanner(kind, message) {
  state.banner = {
    kind,
    message,
  };
}

function clearBanner() {
  state.banner = null;
}

function getCurrentMessages() {
  return state.messagesByConversation.get(state.activeConversationId) || [];
}

function setActiveConversation(conversationId) {
  const clean = (conversationId || '').trim();
  if (!clean) {
    return;
  }
  state.activeConversationId = clean;
  const existing = state.conversations.find((entry) => entry.id === clean);
  if (!existing) {
    state.conversations.unshift({ id: clean, label: clean });
    state.conversations = state.conversations.slice(0, 100);
  }
}

function updateConversationFromMessages(items) {
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    if (typeof item.conversationId === 'string' && item.conversationId.trim()) {
      setActiveConversation(item.conversationId.trim());
    }
  }
}

function mapProblemToMessage(problemError) {
  const code = problemError.code || 'UNKNOWN';
  const detail = problemError.problem?.detail || problemError.message;
  return `[${code}] ${detail}`;
}

function handleError(action, error) {
  if (error instanceof ApiProblemError) {
    const message = mapProblemToMessage(error);
    setBanner('error', message);
    addLog('error', action, message);
    setLastResponse(`${action}:problem`, error.problem);
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  setBanner('error', message);
  addLog('error', action, message);
  setLastResponse(`${action}:error`, { message });
}

async function refreshSelfIdentity() {
  setBusy('identity:self', true);
  clearBanner();
  try {
    const identity = await apiClient.getSelfIdentity();
    state.selfIdentity = identity;
    if (identity?.did && isDidClaw(identity.did)) {
      state.senderDid = identity.did;
      state.groupForm.creatorDid = identity.did;
    }
    addLog('ok', 'identity:self', 'self identity loaded');
    setLastResponse('identity:self', identity);
  } catch (error) {
    handleError('identity:self', error);
  } finally {
    setBusy('identity:self', false);
    render();
  }
}

async function pullMessages() {
  if (!state.activeConversationId) {
    setBanner('warn', 'please set a conversation id');
    render();
    return;
  }

  setBusy('messages:pull', true);
  clearBanner();

  try {
    const nextCursor = state.cursorsByConversation.get(state.activeConversationId);
    const result = await apiClient.pullMessages({
      conversationId: state.activeConversationId,
      limit: 40,
      cursor: nextCursor,
    });

    const items = Array.isArray(result?.items) ? result.items : [];
    const existing = getCurrentMessages();
    const indexByEnvelope = new Map(existing.map((entry) => [entry.envelopeId, entry]));

    for (const item of items) {
      if (item && typeof item.envelopeId === 'string') {
        indexByEnvelope.set(item.envelopeId, item);
      }
    }

    const merged = [...indexByEnvelope.values()].sort((left, right) => {
      const leftSeq = Number(left.seq || 0);
      const rightSeq = Number(right.seq || 0);
      return leftSeq - rightSeq;
    });

    state.messagesByConversation.set(state.activeConversationId, merged);
    if (typeof result?.cursor === 'string') {
      state.cursorsByConversation.set(state.activeConversationId, result.cursor);
    }

    updateConversationFromMessages(items);
    addLog('ok', 'messages:pull', `loaded ${items.length} item(s)`);
    setLastResponse('messages:pull', result);
  } catch (error) {
    handleError('messages:pull', error);
  } finally {
    setBusy('messages:pull', false);
    render();
  }
}

async function sendMessage() {
  const senderDid = state.senderDid.trim();
  if (!isDidClaw(senderDid)) {
    setBanner('error', 'sender did must match did:claw:*');
    render();
    return;
  }
  if (!state.activeConversationId.trim()) {
    setBanner('error', 'conversation id is required');
    render();
    return;
  }

  setBusy('messages:send', true);
  clearBanner();

  try {
    const payload = {
      envelopeId: createEnvelopeId(),
      senderDid,
      conversationId: state.activeConversationId.trim(),
      conversationType: state.activeConversationId.startsWith('direct:') ? 'direct' : 'group',
      targetDomain: state.targetDomain.trim() || 'alpha.tel',
      mailboxKeyId: state.mailboxKeyId.trim() || 'mailbox-main',
      sealedHeader: '0x11',
      ciphertext: toCiphertextHex(state.draftMessage),
      contentType: 'text',
      ttlSec: 2_592_000,
    };

    const envelope = await apiClient.sendMessage(payload);
    state.draftMessage = '';
    addLog('ok', 'messages:send', `sent envelope ${envelope?.envelopeId || 'n/a'}`);
    setLastResponse('messages:send', envelope);

    await pullMessages();
  } catch (error) {
    handleError('messages:send', error);
  } finally {
    setBusy('messages:send', false);
    render();
  }
}

async function createGroup() {
  const data = state.groupForm;
  if (!isDidClaw(data.creatorDid)) {
    setBanner('error', 'creator did must match did:claw:*');
    render();
    return;
  }

  setBusy('groups:create', true);
  clearBanner();

  try {
    const created = await apiClient.createGroup({
      creatorDid: data.creatorDid.trim(),
      groupId: data.groupId.trim(),
      groupDomain: data.groupDomain.trim(),
      domainProofHash: data.domainProofHash.trim(),
      initialMlsStateHash: data.initialMlsStateHash.trim(),
    });

    if (created?.group?.groupId) {
      setActiveConversation(`group:${created.group.groupId}`);
    }

    addLog('ok', 'groups:create', `group created ${created?.group?.groupId || data.groupId}`);
    setLastResponse('groups:create', created);
    state.groupForm.inviteId = randomHex(32);
    render();
  } catch (error) {
    handleError('groups:create', error);
    render();
  } finally {
    setBusy('groups:create', false);
  }
}

async function inviteMember() {
  const data = state.groupForm;
  if (!isDidClaw(data.creatorDid) || !isDidClaw(data.inviteeDid)) {
    setBanner('error', 'inviter/invitee did must match did:claw:*');
    render();
    return;
  }

  setBusy('groups:invite', true);
  clearBanner();

  try {
    const invited = await apiClient.inviteMember(data.groupId, {
      inviteId: data.inviteId,
      inviterDid: data.creatorDid,
      inviteeDid: data.inviteeDid,
      mlsCommitHash: data.inviteMlsCommitHash,
    });

    addLog('ok', 'groups:invite', `invite created ${invited?.inviteId || data.inviteId}`);
    setLastResponse('groups:invite', invited);
  } catch (error) {
    handleError('groups:invite', error);
  } finally {
    setBusy('groups:invite', false);
    render();
  }
}

async function acceptInvite() {
  const data = state.groupForm;
  if (!isDidClaw(data.inviteeDid)) {
    setBanner('error', 'invitee did must match did:claw:*');
    render();
    return;
  }

  setBusy('groups:accept', true);
  clearBanner();

  try {
    const accepted = await apiClient.acceptInvite(data.groupId, data.inviteId, {
      inviteeDid: data.inviteeDid,
      mlsWelcomeHash: data.acceptMlsWelcomeHash,
    });

    addLog('ok', 'groups:accept', `invite accepted ${accepted?.inviteId || data.inviteId}`);
    setLastResponse('groups:accept', accepted);
    setActiveConversation(`group:${data.groupId}`);
  } catch (error) {
    handleError('groups:accept', error);
  } finally {
    setBusy('groups:accept', false);
    render();
  }
}

async function resolveIdentity() {
  if (!isDidClaw(state.identityLookupDid)) {
    setBanner('error', 'lookup did must match did:claw:*');
    render();
    return;
  }

  setBusy('identity:resolve', true);
  clearBanner();

  try {
    const identity = await apiClient.resolveIdentity(state.identityLookupDid);
    state.resolvedIdentity = identity;
    addLog('ok', 'identity:resolve', `resolved ${state.identityLookupDid}`);
    setLastResponse('identity:resolve', identity);
  } catch (error) {
    handleError('identity:resolve', error);
  } finally {
    setBusy('identity:resolve', false);
    render();
  }
}

async function checkNodeHealth() {
  setBusy('settings:health', true);
  clearBanner();
  try {
    const info = await apiClient.getNodeInfo();
    addLog('ok', 'settings:health', `node ${info?.service || 'telagent-node'} online`);
    setLastResponse('settings:health', info);
  } catch (error) {
    handleError('settings:health', error);
  } finally {
    setBusy('settings:health', false);
    render();
  }
}

function saveApiBase() {
  apiClient.setBaseUrl(state.apiBase);
  localStorage.setItem(STORAGE_API_BASE_KEY, state.apiBase);
  addLog('ok', 'settings:api-base', `api base updated to ${state.apiBase}`);
  render();
}

function formatJson(value) {
  return JSON.stringify(value ?? { hint: 'No API response yet.' }, null, 2);
}

function renderBanner() {
  if (!state.banner) {
    return '';
  }
  return `<div class="banner banner-${escapeHtml(state.banner.kind)}">${escapeHtml(state.banner.message)}</div>`;
}

function renderNavItem(label, routeName) {
  const active = state.route.name === routeName ? 'is-active' : '';
  return `<button class="nav-item ${active}" data-route="${routeName}">${label}</button>`;
}

function renderSessions() {
  const rows = state.conversations
    .map((conversation) => {
      const active = conversation.id === state.activeConversationId ? 'is-selected' : '';
      return `
        <li>
          <button class="session-item ${active}" data-conversation-id="${escapeHtml(conversation.id)}">
            <span class="session-label">${escapeHtml(conversation.label)}</span>
            <span class="session-id">${escapeHtml(conversation.id)}</span>
          </button>
        </li>
      `;
    })
    .join('');

  const messages = getCurrentMessages()
    .slice(-120)
    .map((item) => {
      const sender = item?.senderDid || 'unknown';
      const seq = item?.seq ?? '-';
      const ciphertext = item?.ciphertext || '';
      return `
        <li class="message-row">
          <div class="message-meta">seq=${escapeHtml(seq)} · ${escapeHtml(sender)}</div>
          <div class="message-body">${escapeHtml(ciphertext)}</div>
        </li>
      `;
    })
    .join('');

  return `
    <section class="card">
      <h2>Sessions</h2>
      <p class="card-subtitle">Core flow entry: pull and send in a selected conversation.</p>

      <div class="toolbar-grid">
        <label>
          Active Conversation ID
          <input id="conversation-id" value="${escapeHtml(state.activeConversationId)}" />
        </label>
        <label>
          Sender DID
          <input id="sender-did" value="${escapeHtml(state.senderDid)}" />
        </label>
        <label>
          Target Domain
          <input id="target-domain" value="${escapeHtml(state.targetDomain)}" />
        </label>
        <label>
          Mailbox Key
          <input id="mailbox-key-id" value="${escapeHtml(state.mailboxKeyId)}" />
        </label>
      </div>

      <div class="button-row">
        <button id="btn-open-conversation">Open Conversation</button>
        <button id="btn-pull-messages" ${isBusy('messages:pull') ? 'disabled' : ''}>Pull Messages</button>
      </div>

      <div class="session-layout">
        <aside class="session-list-wrap">
          <h3>Conversation List</h3>
          <ul class="session-list">${rows}</ul>
        </aside>

        <section class="chat-wrap">
          <h3>Timeline</h3>
          <ul class="message-list">
            ${messages || '<li class="message-empty">No messages loaded yet.</li>'}
          </ul>

          <label class="composer-label">
            Draft Message
            <textarea id="draft-message" rows="3">${escapeHtml(state.draftMessage)}</textarea>
          </label>

          <div class="button-row">
            <button id="btn-send-message" ${isBusy('messages:send') ? 'disabled' : ''}>Send Message</button>
            <button id="btn-refresh-self" ${isBusy('identity:self') ? 'disabled' : ''}>Refresh Self Identity</button>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderGroups() {
  const form = state.groupForm;
  return `
    <section class="card">
      <h2>Groups</h2>
      <p class="card-subtitle">Create, invite and accept in the same page.</p>

      <div class="toolbar-grid">
        <label>Creator DID <input id="group-creator-did" value="${escapeHtml(form.creatorDid)}" /></label>
        <label>Invitee DID <input id="group-invitee-did" value="${escapeHtml(form.inviteeDid)}" /></label>
        <label>Group ID <input id="group-id" value="${escapeHtml(form.groupId)}" /></label>
        <label>Group Domain <input id="group-domain" value="${escapeHtml(form.groupDomain)}" /></label>
        <label>Domain Proof Hash <input id="group-domain-proof-hash" value="${escapeHtml(form.domainProofHash)}" /></label>
        <label>Initial MLS Hash <input id="group-initial-mls-hash" value="${escapeHtml(form.initialMlsStateHash)}" /></label>
        <label>Invite ID <input id="group-invite-id" value="${escapeHtml(form.inviteId)}" /></label>
        <label>Invite MLS Commit Hash <input id="group-invite-mls-hash" value="${escapeHtml(form.inviteMlsCommitHash)}" /></label>
        <label>Accept MLS Welcome Hash <input id="group-accept-mls-hash" value="${escapeHtml(form.acceptMlsWelcomeHash)}" /></label>
      </div>

      <div class="button-row">
        <button id="btn-create-group" ${isBusy('groups:create') ? 'disabled' : ''}>Create Group</button>
        <button id="btn-invite-member" ${isBusy('groups:invite') ? 'disabled' : ''}>Invite Member</button>
        <button id="btn-accept-invite" ${isBusy('groups:accept') ? 'disabled' : ''}>Accept Invite</button>
        <button id="btn-refresh-random" ${isBusy('groups:create') ? 'disabled' : ''}>Regenerate IDs/Hashes</button>
      </div>
    </section>
  `;
}

function renderIdentity() {
  return `
    <section class="card">
      <h2>Identity</h2>
      <p class="card-subtitle">Self identity and DID resolution panel.</p>

      <div class="toolbar-grid">
        <label>
          DID Lookup
          <input id="identity-lookup-did" value="${escapeHtml(state.identityLookupDid)}" />
        </label>
      </div>

      <div class="button-row">
        <button id="btn-refresh-self" ${isBusy('identity:self') ? 'disabled' : ''}>Load Self Identity</button>
        <button id="btn-resolve-identity" ${isBusy('identity:resolve') ? 'disabled' : ''}>Resolve DID</button>
      </div>

      <div class="identity-grid">
        <article class="mini-card">
          <h3>Self Identity</h3>
          <pre>${escapeHtml(formatJson(state.selfIdentity))}</pre>
        </article>
        <article class="mini-card">
          <h3>Resolved Identity</h3>
          <pre>${escapeHtml(formatJson(state.resolvedIdentity))}</pre>
        </article>
      </div>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="card">
      <h2>Settings</h2>
      <p class="card-subtitle">Connection and diagnostics.</p>

      <div class="toolbar-grid">
        <label>
          API Base URL
          <input id="settings-api-base" value="${escapeHtml(state.apiBase)}" />
        </label>
      </div>

      <div class="button-row">
        <button id="btn-save-api-base">Save API Base</button>
        <button id="btn-check-health" ${isBusy('settings:health') ? 'disabled' : ''}>Check Node Health</button>
      </div>

      <article class="mini-card">
        <h3>Current Runtime</h3>
        <pre>${escapeHtml(formatJson({
          apiBase: state.apiBase,
          route: state.route,
          activeConversationId: state.activeConversationId,
        }))}</pre>
      </article>
    </section>
  `;
}

function renderMainView() {
  if (state.route.name === 'groups') {
    return renderGroups();
  }
  if (state.route.name === 'identity') {
    return renderIdentity();
  }
  if (state.route.name === 'settings') {
    return renderSettings();
  }
  return renderSessions();
}

function renderLogs() {
  if (!state.logs.length) {
    return '<li class="log-empty">No activity yet.</li>';
  }
  return state.logs
    .map(
      (entry) => `
        <li class="log-item log-${escapeHtml(entry.level)}">
          <div class="log-head">${escapeHtml(entry.action)} <span>${escapeHtml(entry.timestamp)}</span></div>
          <div class="log-detail">${escapeHtml(entry.detail)}</div>
        </li>
      `,
    )
    .join('');
}

function render() {
  appRoot.innerHTML = `
    <div class="bg-grid"></div>
    <main class="shell">
      <aside class="nav-panel card">
        <p class="eyebrow">Web App Implementation</p>
        <h1>TelAgent</h1>
        <p class="card-subtitle">Industrial shell with unified <code>/api/v1/*</code> client.</p>

        <nav class="nav-list">
          ${renderNavItem('Sessions', 'sessions')}
          ${renderNavItem('Groups', 'groups')}
          ${renderNavItem('Identity', 'identity')}
          ${renderNavItem('Settings', 'settings')}
        </nav>

        <article class="mini-card compact">
          <h3>Runtime</h3>
          <div class="kv">API Base: <code>${escapeHtml(state.apiBase)}</code></div>
          <div class="kv">Sender DID: <code>${escapeHtml(state.senderDid)}</code></div>
          <div class="kv">Conversation: <code>${escapeHtml(state.activeConversationId)}</code></div>
        </article>
      </aside>

      <section class="main-panel">
        ${renderBanner()}
        ${renderMainView()}
      </section>

      <aside class="inspect-panel card">
        <div class="inspect-head">
          <h2>Inspector</h2>
          <button id="btn-clear-logs" class="ghost">Clear</button>
        </div>

        <h3>Activity</h3>
        <ul class="log-list">${renderLogs()}</ul>

        <h3>Last API Response</h3>
        <pre>${escapeHtml(formatJson(state.lastResponse))}</pre>
      </aside>
    </main>
  `;

  bindEvents();
}

function bindEvents() {
  for (const navButton of appRoot.querySelectorAll('[data-route]')) {
    navButton.addEventListener('click', () => {
      const route = navButton.getAttribute('data-route');
      if (route) {
        navigate(route);
      }
    });
  }

  for (const conversationButton of appRoot.querySelectorAll('[data-conversation-id]')) {
    conversationButton.addEventListener('click', () => {
      const conversationId = conversationButton.getAttribute('data-conversation-id');
      if (!conversationId) {
        return;
      }
      setActiveConversation(conversationId);
      navigate('sessions');
      render();
    });
  }

  appRoot.querySelector('#btn-clear-logs')?.addEventListener('click', () => {
    state.logs = [];
    render();
  });

  appRoot.querySelector('#btn-refresh-self')?.addEventListener('click', () => {
    void refreshSelfIdentity();
  });

  appRoot.querySelector('#btn-open-conversation')?.addEventListener('click', () => {
    const input = appRoot.querySelector('#conversation-id');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    setActiveConversation(input.value);
    navigate('sessions');
    render();
  });

  appRoot.querySelector('#btn-pull-messages')?.addEventListener('click', () => {
    void pullMessages();
  });

  appRoot.querySelector('#btn-send-message')?.addEventListener('click', () => {
    void sendMessage();
  });

  appRoot.querySelector('#btn-create-group')?.addEventListener('click', () => {
    void createGroup();
  });

  appRoot.querySelector('#btn-invite-member')?.addEventListener('click', () => {
    void inviteMember();
  });

  appRoot.querySelector('#btn-accept-invite')?.addEventListener('click', () => {
    void acceptInvite();
  });

  appRoot.querySelector('#btn-refresh-random')?.addEventListener('click', () => {
    state.groupForm = createInitialGroupForm();
    render();
  });

  appRoot.querySelector('#btn-resolve-identity')?.addEventListener('click', () => {
    void resolveIdentity();
  });

  appRoot.querySelector('#btn-save-api-base')?.addEventListener('click', () => {
    const input = appRoot.querySelector('#settings-api-base');
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    state.apiBase = input.value.trim() || DEFAULT_API_BASE;
    saveApiBase();
  });

  appRoot.querySelector('#btn-check-health')?.addEventListener('click', () => {
    void checkNodeHealth();
  });

  const senderDidInput = appRoot.querySelector('#sender-did');
  if (senderDidInput instanceof HTMLInputElement) {
    senderDidInput.addEventListener('input', () => {
      state.senderDid = senderDidInput.value;
      state.groupForm.creatorDid = senderDidInput.value;
    });
  }

  const targetDomainInput = appRoot.querySelector('#target-domain');
  if (targetDomainInput instanceof HTMLInputElement) {
    targetDomainInput.addEventListener('input', () => {
      state.targetDomain = targetDomainInput.value;
    });
  }

  const mailboxInput = appRoot.querySelector('#mailbox-key-id');
  if (mailboxInput instanceof HTMLInputElement) {
    mailboxInput.addEventListener('input', () => {
      state.mailboxKeyId = mailboxInput.value;
    });
  }

  const draftInput = appRoot.querySelector('#draft-message');
  if (draftInput instanceof HTMLTextAreaElement) {
    draftInput.addEventListener('input', () => {
      state.draftMessage = draftInput.value;
    });
  }

  const identityInput = appRoot.querySelector('#identity-lookup-did');
  if (identityInput instanceof HTMLInputElement) {
    identityInput.addEventListener('input', () => {
      state.identityLookupDid = identityInput.value;
    });
  }

  bindGroupInput('group-creator-did', 'creatorDid');
  bindGroupInput('group-invitee-did', 'inviteeDid');
  bindGroupInput('group-id', 'groupId');
  bindGroupInput('group-domain', 'groupDomain');
  bindGroupInput('group-domain-proof-hash', 'domainProofHash');
  bindGroupInput('group-initial-mls-hash', 'initialMlsStateHash');
  bindGroupInput('group-invite-id', 'inviteId');
  bindGroupInput('group-invite-mls-hash', 'inviteMlsCommitHash');
  bindGroupInput('group-accept-mls-hash', 'acceptMlsWelcomeHash');
}

function bindGroupInput(id, field) {
  const input = appRoot.querySelector(`#${id}`);
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  input.addEventListener('input', () => {
    state.groupForm[field] = input.value;
  });
}
