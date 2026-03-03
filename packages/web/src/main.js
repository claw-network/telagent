const outputEl = document.querySelector('#output');
const activityEl = document.querySelector('#activity');
const metricsSummaryEl = document.querySelector('#metrics-summary');
const metricAlertsEl = document.querySelector('#metric-alerts');
const groupStateSummaryEl = document.querySelector('#group-state-summary');
const retractedListEl = document.querySelector('#retracted-list');
const federationSummaryEl = document.querySelector('#federation-summary');
const federationDlqListEl = document.querySelector('#federation-dlq-list');
const auditSummaryEl = document.querySelector('#audit-summary');
const riskBoardListEl = document.querySelector('#risk-board-list');

let metricsPollingTimer = null;
let latestFederationNodeInfo = null;
let latestFederationDlqEntries = [];
let latestMonitoringSnapshot = null;
let latestAuditSnapshot = null;

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

async function callApi(action, method, path, body, expectedStatus, options = {}) {
  const { silent = false } = options;
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

    if (!silent) {
      setOutput({
        request,
        response: responseRecord,
      });
    }

    const detail = ok
      ? `OK ${method} ${path}`
      : `Unexpected status for ${method} ${path}`;
    if (!silent) {
      addActivity(action, response.status, detail);
    }

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
    if (!silent) {
      setOutput({
        request,
        error: message,
      });
      addActivity(action, 0, message);
    }
    throw error;
  }
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function renderMetrics(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return;
  }

  const totals = snapshot.totals ?? {};
  const mailbox = snapshot.mailboxMaintenance ?? {};
  const federationReplay = snapshot.federationDlqReplay ?? {};

  if (metricsSummaryEl) {
    metricsSummaryEl.innerHTML = [
      {
        title: 'Requests',
        value: totals.requests ?? 0,
        sub: `2xx=${totals.status2xx ?? 0} / 4xx=${totals.status4xx ?? 0} / 5xx=${totals.status5xx ?? 0}`,
      },
      {
        title: '5xx Rate',
        value: formatPercent(totals.errorRateRatio ?? 0),
        sub: 'Alerted by HTTP_5XX_RATE',
      },
      {
        title: 'Latency p95',
        value: `${Number(totals.p95LatencyMs ?? 0).toFixed(2)} ms`,
        sub: `avg=${Number(totals.avgLatencyMs ?? 0).toFixed(2)} ms`,
      },
      {
        title: 'Mailbox Stale',
        value: `${mailbox.staleSec ?? 0} sec`,
        sub: `runs=${mailbox.runs ?? 0}`,
      },
      {
        title: 'DLQ Burn Rate',
        value: Number(federationReplay.burnRate ?? 0).toFixed(2),
        sub: `runs=${federationReplay.runs ?? 0} failed=${federationReplay.totalFailed ?? 0}`,
      },
    ]
      .map(
        (item) => `
          <article class="metric-card">
            <p class="metric-title">${item.title}</p>
            <p class="metric-value">${item.value}</p>
            <p class="metric-sub">${item.sub}</p>
          </article>
        `,
      )
      .join('');
  }

  if (metricAlertsEl) {
    const alerts = Array.isArray(snapshot.alerts) ? snapshot.alerts : [];
    if (alerts.length === 0) {
      metricAlertsEl.innerHTML = '<li class="alert-empty">No alert rules emitted.</li>';
      return;
    }

    metricAlertsEl.innerHTML = alerts
      .map((alert) => {
        const level = String(alert.level || 'OK').toLowerCase();
        const title = alert.title || alert.code || 'UNKNOWN_ALERT';
        const message = alert.message || '';
        return `
          <li class="alert-row alert-${level}">
            <span class="alert-badge">${alert.level}</span>
            <div>
              <div class="alert-title">${title}</div>
              <div class="alert-message">${message}</div>
            </div>
          </li>
        `;
      })
      .join('');
  }
}

function renderStateCards(target, cards) {
  if (!target) {
    return;
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    target.innerHTML = '<article class="state-card"><p class="state-title">No Data</p><p class="state-main">-</p></article>';
    return;
  }

  target.innerHTML = cards
    .map((card) => {
      const details = Array.isArray(card.details) ? card.details : [];
      return `
        <article class="state-card">
          <p class="state-title">${card.title}</p>
          <p class="state-main">${card.main}</p>
          <div class="state-kv">${details.map((line) => `<span>${line}</span>`).join('')}</div>
        </article>
      `;
    })
    .join('');
}

function renderRetractedList(items) {
  if (!retractedListEl) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    retractedListEl.innerHTML = '<li class="alert-empty">No retracted envelopes found.</li>';
    return;
  }

  retractedListEl.innerHTML = items
    .map((item) => {
      const envelopeId = item?.envelopeId || 'unknown';
      const conversationId = item?.conversationId || 'unknown';
      const reason = item?.reason || 'unknown';
      const retractedAtMs = Number(item?.retractedAtMs || 0);
      const stamp = retractedAtMs > 0 ? new Date(retractedAtMs).toLocaleString() : 'unknown';
      return `
        <li class="ops-row">
          <div class="ops-head"><span>${reason}</span><span>${stamp}</span></div>
          <div class="ops-sub">conversation=${conversationId}</div>
          <div class="ops-sub">envelope=${envelopeId}</div>
        </li>
      `;
    })
    .join('');
}

function renderFederationDlqList(entries) {
  if (!federationDlqListEl) {
    return;
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    federationDlqListEl.innerHTML = '<li class="alert-empty">No DLQ entries.</li>';
    return;
  }

  federationDlqListEl.innerHTML = entries
    .map((entry) => {
      const status = entry?.status || 'UNKNOWN';
      const scope = entry?.scope || 'unknown';
      const sequence = entry?.sequence ?? '-';
      const dlqId = entry?.dlqId || 'unknown';
      return `
        <li class="ops-row">
          <div class="ops-head"><span>${scope}</span><span>${status}</span></div>
          <div class="ops-sub">sequence=${sequence}</div>
          <div class="ops-sub">${dlqId}</div>
        </li>
      `;
    })
    .join('');
}

function renderFederationSummary() {
  const info = latestFederationNodeInfo || {};
  const capabilities = Array.isArray(info.capabilities) ? info.capabilities.join(', ') : '-';
  const protocol = info.protocolVersion || '-';
  const domain = info.domain || '-';
  const securityMode = info.security?.mode || '-';
  const dlq = info.dlq || {};
  const pendingCount = dlq.pendingCount ?? latestFederationDlqEntries.filter((entry) => entry.status === 'PENDING').length;
  const replayedCount = dlq.replayedCount ?? latestFederationDlqEntries.filter((entry) => entry.status === 'REPLAYED').length;

  renderStateCards(federationSummaryEl, [
    {
      title: 'Federation Node',
      main: domain,
      details: [
        `protocol=${protocol}`,
        `security=${securityMode}`,
      ],
    },
    {
      title: 'Capabilities',
      main: capabilities || '-',
      details: [
        `supported=${Array.isArray(info.supportedProtocolVersions) ? info.supportedProtocolVersions.join(', ') : '-'}`,
      ],
    },
    {
      title: 'DLQ',
      main: `pending=${pendingCount}`,
      details: [
        `replayed=${replayedCount}`,
        `entries=${latestFederationDlqEntries.length}`,
      ],
    },
  ]);
}

function clampIntegerInput(raw, fallback, min, max) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(value) || value < min) {
    return fallback;
  }
  return Math.min(value, max);
}

function renderAuditSummary(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    renderStateCards(auditSummaryEl, []);
    return;
  }

  const messages = snapshot.messages ?? {};
  const groups = snapshot.groups ?? {};
  const federation = snapshot.federation ?? {};
  const dlq = federation.dlq ?? {};
  const monitoring = snapshot.monitoring ?? {};
  const replay = monitoring.federationDlqReplay ?? {};

  renderStateCards(auditSummaryEl, [
    {
      title: 'Audit Snapshot',
      main: snapshot.generatedAt || '-',
      details: [
        `sampleSize=${messages.sampleSize ?? '-'}`,
        `retractionScanLimit=${messages.retractionScanLimit ?? '-'}`,
      ],
    },
    {
      title: 'Identity Isolation',
      main: `revoked=${messages.revokedDidCount ?? 0}`,
      details: [
        `isolatedConversations=${messages.isolatedConversationCount ?? 0}`,
        `isolationEvents=${messages.isolationEventCount ?? 0}`,
      ],
    },
    {
      title: 'Group & Reorg',
      main: `groups=${groups.total ?? 0}`,
      details: [
        `active=${groups.stateCounts?.ACTIVE ?? 0}`,
        `reorgedBack=${groups.stateCounts?.REORGED_BACK ?? 0}`,
      ],
    },
    {
      title: 'Federation Exposure',
      main: `pendingDLQ=${dlq.pendingCount ?? 0}`,
      details: [
        `replayedDLQ=${dlq.replayedCount ?? 0}`,
        `burnRate=${Number(replay.burnRate ?? 0).toFixed(2)}`,
      ],
    },
  ]);
}

function riskPriority(level) {
  if (level === 'critical') {
    return 4;
  }
  if (level === 'high') {
    return 3;
  }
  if (level === 'medium') {
    return 2;
  }
  return 1;
}

function deriveRiskSignals() {
  const signals = [];
  const monitoring = latestMonitoringSnapshot ?? {};
  const audit = latestAuditSnapshot ?? {};

  const alerts = Array.isArray(monitoring.alerts) ? monitoring.alerts : [];
  for (const alert of alerts) {
    if (alert?.level === 'CRITICAL') {
      signals.push({
        level: 'critical',
        title: `Monitoring Alert: ${alert.code || 'UNKNOWN'}`,
        detail: alert.message || 'critical threshold reached',
      });
      continue;
    }
    if (alert?.level === 'WARN') {
      signals.push({
        level: 'high',
        title: `Monitoring Alert: ${alert.code || 'UNKNOWN'}`,
        detail: alert.message || 'warning threshold reached',
      });
    }
  }

  const messageAudit = audit.messages ?? {};
  const isolationCount = Number(messageAudit.isolatedConversationCount ?? 0);
  if (isolationCount > 0) {
    signals.push({
      level: isolationCount >= 10 ? 'high' : 'medium',
      title: 'Revoked DID Isolation Active',
      detail: `isolated conversations=${isolationCount}, events=${messageAudit.isolationEventCount ?? 0}`,
    });
  }

  const pendingDlq = Number(audit.federation?.dlq?.pendingCount ?? latestFederationDlqEntries.filter((entry) => entry.status === 'PENDING').length);
  if (pendingDlq > 0) {
    signals.push({
      level: pendingDlq >= 20 ? 'critical' : pendingDlq >= 8 ? 'high' : 'medium',
      title: 'Federation DLQ Pending Backlog',
      detail: `pending entries=${pendingDlq}`,
    });
  }

  const reorgedBack = Number(audit.groups?.stateCounts?.REORGED_BACK ?? 0);
  if (reorgedBack > 0) {
    signals.push({
      level: 'high',
      title: 'Group Reorged Back Detected',
      detail: `reorged_back groups=${reorgedBack}`,
    });
  }

  if (signals.length === 0) {
    signals.push({
      level: 'low',
      title: 'No High Risk Signals',
      detail: 'Current snapshot does not show warn/critical indicators.',
    });
  }

  return signals.sort((left, right) => riskPriority(right.level) - riskPriority(left.level));
}

function renderRiskBoard() {
  if (!riskBoardListEl) {
    return;
  }

  const signals = deriveRiskSignals();
  riskBoardListEl.innerHTML = signals
    .map((item) => {
      const level = String(item.level || 'low').toLowerCase();
      return `
        <li class="risk-row risk-${level}">
          <div class="risk-top">
            <p class="risk-title">${item.title}</p>
            <span class="risk-badge">${level.toUpperCase()}</span>
          </div>
          <p class="risk-detail">${item.detail}</p>
        </li>
      `;
    })
    .join('');
}

function parseReplayIds(value) {
  return [...new Set(
    String(value ?? '')
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
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

async function fetchNodeMetrics(silent = false) {
  const result = await callApi('node-metrics', 'GET', '/api/v1/node/metrics', undefined, 200, { silent });
  const snapshot = result.payload?.data;
  latestMonitoringSnapshot = snapshot;
  renderMetrics(snapshot);
  renderRiskBoard();
  if (!silent) {
    addActivity('node-metrics', 200, 'Monitoring snapshot updated');
  }
}

async function fetchAuditSnapshot(silent = false) {
  const sampleSize = clampIntegerInput(byId('audit-sample-size')?.value, 20, 1, 100);
  const retractionScanLimit = clampIntegerInput(byId('audit-retraction-limit')?.value, 2000, 1, 100_000);
  if (byId('audit-sample-size')) {
    byId('audit-sample-size').value = String(sampleSize);
  }
  if (byId('audit-retraction-limit')) {
    byId('audit-retraction-limit').value = String(retractionScanLimit);
  }

  const result = await callApi(
    'node-audit-snapshot',
    'GET',
    `/api/v1/node/audit-snapshot?sample_size=${sampleSize}&retraction_scan_limit=${retractionScanLimit}`,
    undefined,
    200,
    { silent: true },
  );
  latestAuditSnapshot = result.payload?.data ?? {};
  renderAuditSummary(latestAuditSnapshot);
  renderRiskBoard();

  if (!silent) {
    setOutput({
      auditSnapshot: latestAuditSnapshot,
    });
    addActivity('node-audit-snapshot', 200, 'Audit snapshot loaded');
  }
}

async function refreshGroupSnapshot() {
  const groupId = byId('group-id').value.trim();
  if (!groupId) {
    addActivity('group-snapshot', 0, 'groupId is required');
    return;
  }

  try {
    const encodedGroupId = encodeURIComponent(groupId);
    const [groupRes, chainRes, allMembersRes, pendingRes, finalizedRes] = await Promise.all([
      callApi('group-state-group', 'GET', `/api/v1/groups/${encodedGroupId}`, undefined, 200, { silent: true }),
      callApi('group-state-chain', 'GET', `/api/v1/groups/${encodedGroupId}/chain-state`, undefined, 200, { silent: true }),
      callApi('group-state-members-all', 'GET', `/api/v1/groups/${encodedGroupId}/members?view=all&page=1&per_page=500`, undefined, 200, { silent: true }),
      callApi('group-state-members-pending', 'GET', `/api/v1/groups/${encodedGroupId}/members?view=pending&page=1&per_page=500`, undefined, 200, { silent: true }),
      callApi('group-state-members-finalized', 'GET', `/api/v1/groups/${encodedGroupId}/members?view=finalized&page=1&per_page=500`, undefined, 200, { silent: true }),
    ]);

    const group = groupRes.payload?.data ?? {};
    const chainState = chainRes.payload?.data ?? {};
    const allMembers = Array.isArray(allMembersRes.payload?.data) ? allMembersRes.payload.data : [];
    const pendingMembers = Array.isArray(pendingRes.payload?.data) ? pendingRes.payload.data : [];
    const finalizedMembers = Array.isArray(finalizedRes.payload?.data) ? finalizedRes.payload.data : [];

    renderStateCards(groupStateSummaryEl, [
      {
        title: 'Group',
        main: group.groupId || groupId,
        details: [
          `domain=${group.groupDomain || '-'}`,
          `creator=${group.creatorDid || '-'}`,
        ],
      },
      {
        title: 'Chain State',
        main: chainState.state || '-',
        details: [
          `block=${chainState.blockNumber ?? '-'}`,
          `tx=${chainState.finalizedTxHash || chainState.pendingTxHash || '-'}`,
        ],
      },
      {
        title: 'Members',
        main: `all=${allMembers.length}`,
        details: [
          `pending=${pendingMembers.length}`,
          `finalized=${finalizedMembers.length}`,
        ],
      },
    ]);

    setOutput({
      snapshot: {
        group,
        chainState,
        members: {
          all: allMembers,
          pending: pendingMembers,
          finalized: finalizedMembers,
        },
      },
    });
    addActivity('group-snapshot', 200, 'Group status snapshot refreshed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addActivity('group-snapshot', 0, message);
  }
}

async function fetchRetractedEnvelopes() {
  try {
    const conversationId = byId('conversation-id').value.trim();
    const query = new URLSearchParams();
    query.set('limit', '100');
    if (conversationId) {
      query.set('conversation_id', conversationId);
    }
    const result = await callApi(
      'messages-retracted',
      'GET',
      `/api/v1/messages/retracted?${query.toString()}`,
      undefined,
      200,
      { silent: true },
    );
    const items = Array.isArray(result.payload?.data?.items) ? result.payload.data.items : [];
    renderRetractedList(items);
    setOutput({
      retracted: {
        count: items.length,
        items,
      },
    });
    addActivity('messages-retracted', 200, `Loaded ${items.length} rollback entries`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addActivity('messages-retracted', 0, message);
  }
}

async function fetchFederationNodeInfo() {
  try {
    const result = await callApi('federation-node-info', 'GET', '/api/v1/federation/node-info', undefined, 200, { silent: true });
    latestFederationNodeInfo = result.payload?.data ?? {};
    renderFederationSummary();
    renderRiskBoard();
    setOutput({
      federationNodeInfo: latestFederationNodeInfo,
    });
    addActivity('federation-node-info', 200, 'Federation node-info updated');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addActivity('federation-node-info', 0, message);
  }
}

async function fetchFederationDlq(silent = false) {
  const result = await callApi(
    'federation-dlq',
    'GET',
    '/api/v1/federation/dlq?status=all&page=1&per_page=50',
    undefined,
    200,
    { silent: true },
  );
  latestFederationDlqEntries = Array.isArray(result.payload?.data) ? result.payload.data : [];
  renderFederationDlqList(latestFederationDlqEntries);
  renderFederationSummary();
  renderRiskBoard();
  if (!silent) {
    setOutput({
      federationDlq: {
        total: result.payload?.meta?.pagination?.total ?? latestFederationDlqEntries.length,
        entries: latestFederationDlqEntries,
      },
    });
    addActivity('federation-dlq', 200, `Loaded ${latestFederationDlqEntries.length} DLQ entries`);
  }
  return result;
}

async function replayFederationDlq() {
  try {
    const replay = await callApi(
      'federation-dlq-replay',
      'POST',
      '/api/v1/federation/dlq/replay',
      {
        maxItems: 20,
        stopOnError: false,
      },
      200,
      { silent: true },
    );
    await fetchFederationDlq(true);
    await fetchNodeMetrics(true);
    setOutput({
      federationReplay: replay.payload?.data ?? {},
      federationDlq: latestFederationDlqEntries,
    });
    addActivity('federation-dlq-replay', 200, 'Replay executed and DLQ view refreshed');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addActivity('federation-dlq-replay', 0, message);
  }
}

function fillPendingReplayIds() {
  const pendingIds = latestFederationDlqEntries
    .filter((entry) => entry?.status === 'PENDING')
    .map((entry) => entry?.dlqId)
    .filter(Boolean);
  const maxItems = clampIntegerInput(byId('fed-replay-max-items')?.value, 20, 1, 200);
  const selected = pendingIds.slice(0, maxItems);
  byId('fed-replay-ids').value = selected.join('\n');
  addActivity('federation-dlq-select', 200, `Selected ${selected.length} pending DLQ ids for batch replay`);
}

async function replayFederationDlqBatch() {
  try {
    const ids = parseReplayIds(byId('fed-replay-ids').value);
    const maxItems = clampIntegerInput(byId('fed-replay-max-items')?.value, 20, 1, 200);
    const stopOnError = Boolean(byId('fed-replay-stop-on-error')?.checked);

    const payload = {
      maxItems,
      stopOnError,
      ...(ids.length > 0 ? { ids } : {}),
    };
    const replay = await callApi(
      'federation-dlq-replay-batch',
      'POST',
      '/api/v1/federation/dlq/replay',
      payload,
      200,
      { silent: true },
    );
    await Promise.all([
      fetchFederationDlq(true),
      fetchNodeMetrics(true),
    ]);
    setOutput({
      federationReplayBatch: replay.payload?.data ?? {},
      selectedIds: ids,
      federationDlq: latestFederationDlqEntries,
    });
    addActivity('federation-dlq-replay-batch', 200, `Batch replay executed (ids=${ids.length || 'auto'})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addActivity('federation-dlq-replay-batch', 0, message);
  }
}

function setMetricsAutoRefresh(enabled) {
  const button = byId('btn-toggle-metrics-poll');
  if (!button) {
    return;
  }

  if (!enabled) {
    if (metricsPollingTimer) {
      clearInterval(metricsPollingTimer);
      metricsPollingTimer = null;
    }
    button.textContent = 'Start Metrics Auto Refresh';
    addActivity('metrics-poll', 200, 'Auto refresh stopped');
    return;
  }

  if (metricsPollingTimer) {
    return;
  }

  metricsPollingTimer = setInterval(() => {
    void fetchNodeMetrics(true).catch(() => {});
  }, 10_000);
  button.textContent = 'Stop Metrics Auto Refresh';
  addActivity('metrics-poll', 200, 'Auto refresh started (10s interval)');
  void fetchNodeMetrics(true).catch(() => {});
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

byId('btn-node-metrics').addEventListener('click', () => {
  void fetchNodeMetrics();
});

byId('btn-audit-snapshot').addEventListener('click', () => {
  void fetchAuditSnapshot();
});

byId('btn-risk-refresh').addEventListener('click', () => {
  renderRiskBoard();
  addActivity('risk-board', 200, 'Risk board recalculated');
});

byId('btn-toggle-metrics-poll').addEventListener('click', () => {
  setMetricsAutoRefresh(!metricsPollingTimer);
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

byId('btn-group-snapshot').addEventListener('click', () => {
  void refreshGroupSnapshot();
});

byId('btn-retracted').addEventListener('click', () => {
  void fetchRetractedEnvelopes();
});

byId('btn-fed-node-info').addEventListener('click', () => {
  void fetchFederationNodeInfo();
});

byId('btn-fed-dlq').addEventListener('click', () => {
  void fetchFederationDlq().catch((error) => {
    addActivity('federation-dlq', 0, error instanceof Error ? error.message : String(error));
  });
});

byId('btn-fed-replay').addEventListener('click', () => {
  void replayFederationDlq();
});

byId('btn-fed-replay-pending-fill').addEventListener('click', () => {
  fillPendingReplayIds();
});

byId('btn-fed-replay-batch').addEventListener('click', () => {
  void replayFederationDlqBatch();
});

byId('btn-clear-activity').addEventListener('click', () => {
  activityEl.innerHTML = '';
});

regenerateScenario();
renderStateCards(groupStateSummaryEl, []);
renderFederationSummary();
renderAuditSummary({});
renderRiskBoard();
renderRetractedList([]);
renderFederationDlqList([]);
setOutput({
  status: 'ready',
  hint: 'Run Happy Path, then use Audit & Emergency Panel v2.1 for audit snapshot, risk board, and DLQ batch replay.',
});
