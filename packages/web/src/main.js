const outputEl = document.querySelector('#output');
const activityEl = document.querySelector('#activity');

const byId = (id) => document.querySelector(`#${id}`);

function getBaseUrl() {
  return byId('api-base').value.trim().replace(/\/$/, '');
}

function randomHex(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return `0x${Array.from(buffer, (v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function randomBytes32() {
  return randomHex(32);
}

function randomEnvelopeId() {
  return `env-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function textToHex(text) {
  const value = text || '';
  const encoded = new TextEncoder().encode(value);
  if (encoded.length === 0) {
    return '0x00';
  }
  return `0x${Array.from(encoded, (v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function safeJsonParse(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function setOutput(payload) {
  outputEl.textContent = JSON.stringify(payload, null, 2);
}

function addActivity(action, status, detail) {
  const li = document.createElement('li');
  const meta = document.createElement('div');
  const detailEl = document.createElement('div');
  const stamp = new Date().toLocaleTimeString();

  meta.className = 'meta';
  detailEl.className = status >= 200 && status < 300 ? 'ok' : 'err';

  meta.textContent = `${stamp} | ${action} | status=${status}`;
  detailEl.textContent = detail;

  li.appendChild(meta);
  li.appendChild(detailEl);
  activityEl.prepend(li);
}

function syncConversationId() {
  const groupId = byId('group-id').value.trim();
  if (!groupId) {
    return;
  }
  byId('conversation-id').value = `group:${groupId}`;
}

function syncSenderDid() {
  const creatorDid = byId('creator-did').value.trim();
  if (creatorDid) {
    byId('sender-did').value = creatorDid;
  }
}

function regenerateScenario() {
  byId('group-id').value = randomBytes32();
  byId('invite-id').value = randomBytes32();
  byId('domain-proof-hash').value = randomBytes32();
  byId('initial-mls-hash').value = randomBytes32();
  byId('invite-mls-hash').value = randomBytes32();
  byId('accept-mls-hash').value = randomBytes32();
  byId('attachment-manifest-hash').value = '';
  syncConversationId();
  syncSenderDid();
}

async function callApi(action, method, path, body, expectedStatus) {
  const baseUrl = getBaseUrl();
  const request = {
    action,
    method,
    path,
    body: body ?? null,
  };

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const payload = safeJsonParse(text);
    const location = response.headers.get('location');
    const ok = Array.isArray(expectedStatus) ? expectedStatus.includes(response.status) : response.status === expectedStatus;

    const responseRecord = {
      status: response.status,
      ok,
      location,
      payload,
    };

    setOutput({
      request,
      response: responseRecord,
    });

    const detail = ok
      ? `OK ${method} ${path}`
      : `Unexpected status for ${method} ${path}`;
    addActivity(action, response.status, detail);

    if (!ok) {
      throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
    }

    return {
      response,
      payload,
      location,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setOutput({
      request,
      error: message,
    });
    addActivity(action, 0, message);
    throw error;
  }
}

function buildSendPayload() {
  const plain = byId('message-plain').value.trim();
  const explicitCiphertext = byId('ciphertext-hex').value.trim();
  const ciphertext = explicitCiphertext || textToHex(plain);

  const contentType = byId('content-type').value;
  let attachmentManifestHash = byId('attachment-manifest-hash').value.trim();
  if ((contentType === 'image' || contentType === 'file') && !attachmentManifestHash) {
    attachmentManifestHash = randomBytes32();
    byId('attachment-manifest-hash').value = attachmentManifestHash;
  }

  const ttlSec = Number.parseInt(byId('ttl-sec').value.trim(), 10);
  return {
    envelopeId: randomEnvelopeId(),
    senderDid: byId('sender-did').value.trim(),
    conversationId: byId('conversation-id').value.trim(),
    conversationType: byId('conversation-type').value,
    targetDomain: byId('target-domain').value.trim(),
    mailboxKeyId: byId('mailbox-key').value.trim(),
    sealedHeader: byId('sealed-header').value.trim() || '0x11',
    ciphertext,
    contentType,
    attachmentManifestHash: attachmentManifestHash || undefined,
    ttlSec: Number.isFinite(ttlSec) && ttlSec > 0 ? ttlSec : 2_592_000,
  };
}

async function createGroup() {
  const payload = {
    creatorDid: byId('creator-did').value.trim(),
    groupId: byId('group-id').value.trim(),
    groupDomain: byId('group-domain').value.trim(),
    domainProofHash: byId('domain-proof-hash').value.trim(),
    initialMlsStateHash: byId('initial-mls-hash').value.trim(),
  };
  await callApi('create-group', 'POST', '/api/v1/groups', payload, 201);
  syncConversationId();
  syncSenderDid();
}

async function inviteMember() {
  const groupId = byId('group-id').value.trim();
  const payload = {
    inviteId: byId('invite-id').value.trim(),
    inviterDid: byId('creator-did').value.trim(),
    inviteeDid: byId('invitee-did').value.trim(),
    mlsCommitHash: byId('invite-mls-hash').value.trim(),
  };
  await callApi('invite-member', 'POST', `/api/v1/groups/${encodeURIComponent(groupId)}/invites`, payload, 201);
}

async function acceptInvite() {
  const groupId = byId('group-id').value.trim();
  const inviteId = byId('invite-id').value.trim();
  const payload = {
    inviteeDid: byId('invitee-did').value.trim(),
    mlsWelcomeHash: byId('accept-mls-hash').value.trim(),
  };
  await callApi(
    'accept-invite',
    'POST',
    `/api/v1/groups/${encodeURIComponent(groupId)}/invites/${encodeURIComponent(inviteId)}/accept`,
    payload,
    201,
  );
}

async function listMembers() {
  const groupId = byId('group-id').value.trim();
  await callApi(
    'list-members',
    'GET',
    `/api/v1/groups/${encodeURIComponent(groupId)}/members?view=all&page=1&per_page=200`,
    undefined,
    200,
  );
}

async function getChainState() {
  const groupId = byId('group-id').value.trim();
  await callApi('group-chain-state', 'GET', `/api/v1/groups/${encodeURIComponent(groupId)}/chain-state`, undefined, 200);
}

async function sendMessage() {
  const payload = buildSendPayload();
  await callApi('send-message', 'POST', '/api/v1/messages', payload, 201);
}

async function pullMessages() {
  const conversationId = byId('conversation-id').value.trim();
  const limit = Number.parseInt(byId('pull-limit').value.trim(), 10);
  const cursor = byId('pull-cursor').value.trim();
  const query = new URLSearchParams();
  query.set('conversation_id', conversationId);
  query.set('limit', Number.isFinite(limit) && limit > 0 ? String(limit) : '20');
  if (cursor) {
    query.set('cursor', cursor);
  }

  const result = await callApi('pull-messages', 'GET', `/api/v1/messages/pull?${query.toString()}`, undefined, 200);
  const next = result.payload?.data?.cursor;
  byId('pull-cursor').value = typeof next === 'string' ? next : '';
}

async function runHappyPath() {
  const runButton = byId('btn-run-flow');
  runButton.disabled = true;
  runButton.textContent = 'Running...';
  try {
    await createGroup();
    await inviteMember();
    await acceptInvite();
    await listMembers();
    await sendMessage();
    await pullMessages();
    addActivity('happy-path', 200, 'Flow completed: create -> invite -> accept -> send -> pull');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addActivity('happy-path', 500, `Flow stopped: ${message}`);
  } finally {
    runButton.disabled = false;
    runButton.textContent = 'Run Full Happy Path';
  }
}

byId('btn-randomize').addEventListener('click', regenerateScenario);
byId('group-id').addEventListener('input', syncConversationId);
byId('creator-did').addEventListener('input', syncSenderDid);

byId('btn-self').addEventListener('click', () => {
  void callApi('identity-self', 'GET', '/api/v1/identities/self', undefined, 200);
});

byId('btn-create-group').addEventListener('click', () => {
  void createGroup();
});

byId('btn-invite').addEventListener('click', () => {
  void inviteMember();
});

byId('btn-accept').addEventListener('click', () => {
  void acceptInvite();
});

byId('btn-list-members').addEventListener('click', () => {
  void listMembers();
});

byId('btn-chain-state').addEventListener('click', () => {
  void getChainState();
});

byId('btn-send-message').addEventListener('click', () => {
  void sendMessage();
});

byId('btn-pull').addEventListener('click', () => {
  void pullMessages();
});

byId('btn-run-flow').addEventListener('click', () => {
  void runHappyPath();
});

byId('btn-clear-activity').addEventListener('click', () => {
  activityEl.innerHTML = '';
});

regenerateScenario();
setOutput({
  status: 'ready',
  hint: 'Run core flow: create group -> invite -> accept -> send -> pull.',
});
