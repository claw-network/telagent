import { useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import {
  ApiProblemError,
  TelagentApiClient,
  createEnvelopeId,
  isDidClaw,
  toCiphertextHex,
} from './core/api-client';
import {
  createGroupDiagnosticsState,
  formatValidationErrors,
  normalizeMembersView,
  summarizeMembersByState,
  validateAcceptInviteInput,
  validateCreateGroupInput,
  validateInviteInput,
} from './core/group-domain';
import {
  SessionRuntime,
  createSessionRuntime,
  formatIsoOrDash,
  mergeMessagesByEnvelope,
  recordPullFailure,
  recordPullSuccess,
  recordSendFailure,
  recordSendSuccess,
  resetPullCursor,
} from './core/session-domain';
import {
  buildDidDiagnostics,
  buildNodeRuntimeDiagnostics,
} from './core/identity-node-diagnostics';

const STORAGE_API_BASE_KEY = 'telagent.web.apiBase.v2';
const DEFAULT_API_BASE = 'http://127.0.0.1:9528';
const DEFAULT_DID = 'did:claw:zAlice';

interface ActivityLog {
  level: 'ok' | 'error';
  action: string;
  detail: string;
  timestamp: string;
}

interface BannerState {
  kind: 'error' | 'warn' | 'ok';
  message: string;
}

interface MessageItem {
  envelopeId?: string;
  seq?: number;
  senderDid?: string;
  ciphertext?: string;
  conversationId?: string;
  sentAtMs?: number;
  [key: string]: unknown;
}

interface GroupFormState {
  creatorDid: string;
  inviteeDid: string;
  groupId: string;
  groupDomain: string;
  domainProofHash: string;
  initialMlsStateHash: string;
  inviteId: string;
  inviteMlsCommitHash: string;
  acceptMlsWelcomeHash: string;
}

function readDidHash(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }
  const candidate = (payload as { didHash?: unknown }).didHash;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return undefined;
  }
  return candidate;
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return `0x${Array.from(buffer, (entry) => entry.toString(16).padStart(2, '0')).join('')}`;
}

function createInitialGroupForm(): GroupFormState {
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

export function App() {
  const [apiBase, setApiBase] = useState<string>(localStorage.getItem(STORAGE_API_BASE_KEY) || DEFAULT_API_BASE);
  const [senderDid, setSenderDid] = useState<string>(DEFAULT_DID);
  const [targetDomain, setTargetDomain] = useState<string>('alpha.tel');
  const [mailboxKeyId, setMailboxKeyId] = useState<string>('mailbox-main');
  const [activeConversationId, setActiveConversationId] = useState<string>('group:demo-room');
  const [draftMessage, setDraftMessage] = useState<string>('Hello from TelAgent Web App (TS/React)');
  const [conversations, setConversations] = useState<Array<{ id: string; label: string }>>([
    { id: 'group:demo-room', label: 'Demo Group' },
    { id: 'direct:alice-bob', label: 'Direct: Alice/Bob' },
  ]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, MessageItem[]>>({});
  const [sessionRuntimeByConversation, setSessionRuntimeByConversation] = useState<Record<string, SessionRuntime>>({});
  const [groupForm, setGroupForm] = useState<GroupFormState>(createInitialGroupForm());
  const [groupDiagnostics, setGroupDiagnostics] = useState(createGroupDiagnosticsState());
  const [selfIdentity, setSelfIdentity] = useState<unknown>(null);
  const [resolvedIdentity, setResolvedIdentity] = useState<unknown>(null);
  const [identityLookupDid, setIdentityLookupDid] = useState<string>('did:claw:zBob');
  const [nodeInfo, setNodeInfo] = useState<Record<string, unknown> | null>(null);
  const [nodeMetrics, setNodeMetrics] = useState<Record<string, unknown> | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [lastResponse, setLastResponse] = useState<unknown>(null);

  const apiClient = useMemo(() => new TelagentApiClient({ baseUrl: apiBase }), [apiBase]);

  const currentMessages = messagesByConversation[activeConversationId] ?? [];
  const runtime = sessionRuntimeByConversation[activeConversationId] ?? createSessionRuntime();
  const senderDidDiagnostics = useMemo(
    () => buildDidDiagnostics(senderDid, readDidHash(selfIdentity)),
    [senderDid, selfIdentity],
  );
  const lookupDidDiagnostics = useMemo(
    () => buildDidDiagnostics(identityLookupDid, readDidHash(resolvedIdentity)),
    [identityLookupDid, resolvedIdentity],
  );
  const nodeRuntimeDiagnostics = useMemo(
    () => buildNodeRuntimeDiagnostics(nodeInfo, nodeMetrics),
    [nodeInfo, nodeMetrics],
  );

  function setBusy(key: string, enabled: boolean) {
    setBusyKeys((previous) => ({ ...previous, [key]: enabled }));
  }

  function isBusy(key: string): boolean {
    return busyKeys[key] === true;
  }

  function addLog(level: 'ok' | 'error', action: string, detail: string) {
    setLogs((previous) => [{ level, action, detail, timestamp: new Date().toISOString() }, ...previous].slice(0, 80));
  }

  function upsertConversation(conversationId: string) {
    const clean = conversationId.trim();
    if (!clean) {
      return;
    }
    setActiveConversationId(clean);
    setConversations((previous) => {
      if (previous.some((entry) => entry.id === clean)) {
        return previous;
      }
      return [{ id: clean, label: clean }, ...previous].slice(0, 100);
    });
  }

  function updateSessionRuntime(conversationId: string, updater: (runtime: SessionRuntime) => SessionRuntime) {
    setSessionRuntimeByConversation((previous) => {
      const current = previous[conversationId] ?? createSessionRuntime();
      return {
        ...previous,
        [conversationId]: updater({ ...current }),
      };
    });
  }

  function handleError(action: string, error: unknown) {
    if (error instanceof ApiProblemError) {
      const detail = error.problem?.detail || error.message;
      const message = `[${error.code || 'UNKNOWN'}] ${detail}`;
      setBanner({ kind: 'error', message });
      addLog('error', action, message);
      setLastResponse({ label: `${action}:problem`, payload: error.problem, at: new Date().toISOString() });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    setBanner({ kind: 'error', message });
    addLog('error', action, message);
    setLastResponse({ label: `${action}:error`, payload: { message }, at: new Date().toISOString() });
  }

  function failValidation(action: string, errors: string[]): boolean {
    const message = formatValidationErrors(errors);
    if (!message) {
      return false;
    }
    setBanner({ kind: 'error', message });
    addLog('error', action, message);
    setLastResponse({ label: `${action}:validation`, payload: { errors }, at: new Date().toISOString() });
    return true;
  }

  async function refreshSelfIdentity() {
    setBusy('identity:self', true);
    setBanner(null);
    try {
      const identity = await apiClient.getSelfIdentity<{ did?: string }>();
      setSelfIdentity(identity);
      if (identity?.did && isDidClaw(identity.did)) {
        setSenderDid(identity.did);
        setGroupForm((previous) => ({ ...previous, creatorDid: identity.did! }));
      }
      addLog('ok', 'identity:self', 'self identity loaded');
      setLastResponse({ label: 'identity:self', payload: identity, at: new Date().toISOString() });
    } catch (error) {
      handleError('identity:self', error);
    } finally {
      setBusy('identity:self', false);
    }
  }

  async function pullMessages(options: { resetCursorFirst?: boolean; clearTimeline?: boolean; reason?: string } = {}) {
    if (!activeConversationId.trim()) {
      setBanner({ kind: 'warn', message: 'please set a conversation id' });
      return;
    }

    if (options.resetCursorFirst) {
      updateSessionRuntime(activeConversationId, (existing) => {
        const changed = resetPullCursor(existing);
        changed.lastPullError = null;
        return changed;
      });
      if (options.clearTimeline) {
        setMessagesByConversation((previous) => ({ ...previous, [activeConversationId]: [] }));
      }
    }

    setBusy('messages:pull', true);
    setBanner(null);

    try {
      const cursor = (sessionRuntimeByConversation[activeConversationId] ?? createSessionRuntime()).cursor;
      const response = await apiClient.pullMessages<{ items?: MessageItem[]; cursor?: string }>({
        conversationId: activeConversationId,
        limit: 40,
        cursor,
      });
      const items = Array.isArray(response?.items) ? response.items : [];

      setMessagesByConversation((previous) => {
        const merged = mergeMessagesByEnvelope(previous[activeConversationId] ?? [], items);
        return {
          ...previous,
          [activeConversationId]: merged,
        };
      });

      updateSessionRuntime(activeConversationId, (existing) => {
        recordPullSuccess(existing, {
          cursor: typeof response?.cursor === 'string' ? response.cursor : undefined,
          loadedCount: items.length,
          action: options.reason ?? 'pull',
        });
        return existing;
      });

      for (const item of items) {
        if (item?.conversationId && typeof item.conversationId === 'string') {
          upsertConversation(item.conversationId);
        }
      }

      addLog('ok', 'messages:pull', `loaded ${items.length} item(s)`);
      setLastResponse({ label: 'messages:pull', payload: response, at: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateSessionRuntime(activeConversationId, (existing) => recordPullFailure(existing, message));
      handleError('messages:pull', error);
    } finally {
      setBusy('messages:pull', false);
    }
  }

  function buildSendPayload(): Record<string, unknown> {
    return {
      envelopeId: createEnvelopeId(),
      senderDid: senderDid.trim(),
      conversationId: activeConversationId.trim(),
      conversationType: activeConversationId.startsWith('direct:') ? 'direct' : 'group',
      targetDomain: targetDomain.trim() || 'alpha.tel',
      mailboxKeyId: mailboxKeyId.trim() || 'mailbox-main',
      sealedHeader: '0x11',
      ciphertext: toCiphertextHex(draftMessage),
      contentType: 'text',
      ttlSec: 2_592_000,
    };
  }

  async function sendMessage(options: { payload?: Record<string, unknown>; reason?: string } = {}) {
    const payload = options.payload ? { ...options.payload } : buildSendPayload();

    if (!isDidClaw(payload.senderDid)) {
      setBanner({ kind: 'error', message: 'sender did must match did:claw:*' });
      return;
    }
    if (!activeConversationId.trim()) {
      setBanner({ kind: 'error', message: 'conversation id is required' });
      return;
    }

    setBusy('messages:send', true);
    setBanner(null);

    try {
      const response = await apiClient.sendMessage(payload);
      updateSessionRuntime(activeConversationId, (existing) => recordSendSuccess(existing, String(payload.envelopeId || '')));
      if (!options.payload) {
        setDraftMessage('');
      }
      addLog('ok', 'messages:send', `sent envelope ${String(payload.envelopeId || 'n/a')}`);
      setLastResponse({ label: 'messages:send', payload: response, at: new Date().toISOString() });
      await pullMessages({ reason: options.reason ?? 'after-send' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateSessionRuntime(activeConversationId, (existing) => recordSendFailure(existing, message, payload));
      handleError('messages:send', error);
    } finally {
      setBusy('messages:send', false);
    }
  }

  async function retryLastSend() {
    const previousPayload = runtime.lastFailedEnvelope;
    if (!previousPayload) {
      setBanner({ kind: 'warn', message: 'no failed send payload to retry' });
      return;
    }
    await sendMessage({ payload: previousPayload, reason: 'retry-last-send' });
  }

  async function refreshFromStart() {
    await pullMessages({ resetCursorFirst: true, clearTimeline: true, reason: 'refresh-from-start' });
  }

  async function retryLastPull() {
    if (!runtime.lastPullError) {
      setBanner({ kind: 'warn', message: 'no failed pull to retry' });
      return;
    }
    await pullMessages({ reason: 'retry-last-pull' });
  }

  async function refreshGroupDiagnostics(reason = 'manual-refresh') {
    const groupId = groupForm.groupId.trim();
    if (!groupId) {
      setBanner({ kind: 'warn', message: 'group id is required for diagnostics' });
      return;
    }

    setBusy('groups:sync', true);
    setBanner(null);

    try {
      const [chainState, membersPayload] = await Promise.all([
        apiClient.getGroupChainState<Record<string, unknown>>(groupId),
        apiClient.listGroupMembersEnvelope(groupId, {
          view: groupDiagnostics.membersView,
          page: 1,
          perPage: 200,
        }),
      ]);

      const members = Array.isArray(membersPayload.data) ? (membersPayload.data as Array<Record<string, unknown>>) : [];
      const summary = summarizeMembersByState(members);
      setGroupDiagnostics((previous) => ({
        ...previous,
        groupId,
        chainState,
        members,
        pagination: membersPayload.meta.pagination,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        lastAction: reason,
      }));
      addLog(
        'ok',
        'groups:sync',
        `group=${groupId} total=${summary.total} finalized=${summary.finalized} pending=${summary.pending}`,
      );
      setLastResponse({
        label: 'groups:sync',
        payload: { groupId, chainState, membersPayload },
        at: new Date().toISOString(),
      });
    } catch (error) {
      setGroupDiagnostics((previous) => ({
        ...previous,
        lastError: error instanceof Error ? error.message : String(error),
        lastAction: 'sync:failed',
      }));
      handleError('groups:sync', error);
    } finally {
      setBusy('groups:sync', false);
    }
  }

  async function createGroup() {
    const errors = validateCreateGroupInput(groupForm);
    if (failValidation('groups:create', errors)) {
      return;
    }

    setBusy('groups:create', true);
    setBanner(null);

    try {
      const response = await apiClient.createGroup({
        creatorDid: groupForm.creatorDid.trim(),
        groupId: groupForm.groupId.trim(),
        groupDomain: groupForm.groupDomain.trim(),
        domainProofHash: groupForm.domainProofHash.trim(),
        initialMlsStateHash: groupForm.initialMlsStateHash.trim(),
      });

      upsertConversation(`group:${groupForm.groupId.trim()}`);
      addLog('ok', 'groups:create', `group created ${groupForm.groupId}`);
      setLastResponse({ label: 'groups:create', payload: response, at: new Date().toISOString() });
      setGroupForm((previous) => ({ ...previous, inviteId: randomHex(32) }));
      await refreshGroupDiagnostics('after-create');
    } catch (error) {
      handleError('groups:create', error);
    } finally {
      setBusy('groups:create', false);
    }
  }

  async function inviteMember() {
    const errors = validateInviteInput({
      groupId: groupForm.groupId,
      inviteId: groupForm.inviteId,
      inviterDid: groupForm.creatorDid,
      inviteeDid: groupForm.inviteeDid,
      mlsCommitHash: groupForm.inviteMlsCommitHash,
    });
    if (failValidation('groups:invite', errors)) {
      return;
    }

    setBusy('groups:invite', true);
    setBanner(null);

    try {
      const response = await apiClient.inviteMember(groupForm.groupId, {
        inviteId: groupForm.inviteId,
        inviterDid: groupForm.creatorDid,
        inviteeDid: groupForm.inviteeDid,
        mlsCommitHash: groupForm.inviteMlsCommitHash,
      });
      addLog('ok', 'groups:invite', `invite created ${groupForm.inviteId}`);
      setLastResponse({ label: 'groups:invite', payload: response, at: new Date().toISOString() });
      await refreshGroupDiagnostics('after-invite');
    } catch (error) {
      handleError('groups:invite', error);
    } finally {
      setBusy('groups:invite', false);
    }
  }

  async function acceptInvite() {
    const errors = validateAcceptInviteInput({
      groupId: groupForm.groupId,
      inviteId: groupForm.inviteId,
      inviteeDid: groupForm.inviteeDid,
      mlsWelcomeHash: groupForm.acceptMlsWelcomeHash,
    });
    if (failValidation('groups:accept', errors)) {
      return;
    }

    setBusy('groups:accept', true);
    setBanner(null);

    try {
      const response = await apiClient.acceptInvite(groupForm.groupId, groupForm.inviteId, {
        inviteeDid: groupForm.inviteeDid,
        mlsWelcomeHash: groupForm.acceptMlsWelcomeHash,
      });
      addLog('ok', 'groups:accept', `invite accepted ${groupForm.inviteId}`);
      setLastResponse({ label: 'groups:accept', payload: response, at: new Date().toISOString() });
      upsertConversation(`group:${groupForm.groupId}`);
      await refreshGroupDiagnostics('after-accept');
    } catch (error) {
      handleError('groups:accept', error);
    } finally {
      setBusy('groups:accept', false);
    }
  }

  async function resolveIdentity() {
    if (!isDidClaw(identityLookupDid)) {
      setBanner({ kind: 'error', message: 'lookup did must match did:claw:*' });
      return;
    }

    setBusy('identity:resolve', true);
    setBanner(null);
    try {
      const response = await apiClient.resolveIdentity(identityLookupDid);
      setResolvedIdentity(response);
      addLog('ok', 'identity:resolve', `resolved ${identityLookupDid}`);
      setLastResponse({ label: 'identity:resolve', payload: response, at: new Date().toISOString() });
    } catch (error) {
      handleError('identity:resolve', error);
    } finally {
      setBusy('identity:resolve', false);
    }
  }

  async function checkNodeHealth() {
    setBusy('settings:health', true);
    setBanner(null);
    try {
      const [info, metrics] = await Promise.all([
        apiClient.getNodeInfo<Record<string, unknown>>(),
        apiClient.getNodeMetrics<Record<string, unknown>>(),
      ]);
      setNodeInfo(info);
      setNodeMetrics(metrics);

      const diagnostics = buildNodeRuntimeDiagnostics(info, metrics);
      addLog(
        'ok',
        'settings:health',
        `level=${diagnostics.level} alerts=${diagnostics.alertCounts.total} requests=${diagnostics.totalRequests ?? 0}`,
      );
      setLastResponse({
        label: 'settings:health',
        payload: {
          info,
          metrics,
          diagnostics,
        },
        at: new Date().toISOString(),
      });
    } catch (error) {
      handleError('settings:health', error);
    } finally {
      setBusy('settings:health', false);
    }
  }

  function saveApiBase() {
    localStorage.setItem(STORAGE_API_BASE_KEY, apiBase);
    addLog('ok', 'settings:api-base', `api base updated to ${apiBase}`);
  }

  function clearLogs() {
    setLogs([]);
  }

  const memberSummary = summarizeMembersByState(groupDiagnostics.members);

  return (
    <div>
      <div className="bg-grid" />
      <main className="shell">
        <aside className="nav-panel card">
          <p className="eyebrow">Web App (React + TypeScript)</p>
          <h1>TelAgent</h1>
          <p className="card-subtitle">Modernized client shell with typed domain modules and unified /api/v1/* client.</p>

          <nav className="nav-list">
            <NavLink className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`} to="/sessions">
              Sessions
            </NavLink>
            <NavLink className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`} to="/groups">
              Groups
            </NavLink>
            <NavLink className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`} to="/identity">
              Identity
            </NavLink>
            <NavLink className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`} to="/settings">
              Settings
            </NavLink>
          </nav>

          <article className="mini-card compact">
            <h3>Runtime</h3>
            <div className="kv">API Base: <code>{apiBase}</code></div>
            <div className="kv">Sender DID: <code>{senderDid}</code></div>
            <div className="kv">Conversation: <code>{activeConversationId}</code></div>
          </article>
        </aside>

        <section className="main-panel">
          {banner ? <div className={`banner banner-${banner.kind}`}>{banner.message}</div> : null}

          <Routes>
            <Route path="/" element={<Navigate to="/sessions" replace />} />
            <Route
              path="/sessions"
              element={(
                <section className="card">
                  <h2>Sessions</h2>
                  <p className="card-subtitle">Pull/send with cursor visibility, retry and refresh controls.</p>

                  <div className="toolbar-grid">
                    <label>
                      Active Conversation ID
                      <input
                        value={activeConversationId}
                        onChange={(event) => setActiveConversationId(event.target.value)}
                      />
                    </label>
                    <label>
                      Sender DID
                      <input value={senderDid} onChange={(event) => setSenderDid(event.target.value)} />
                    </label>
                    <label>
                      Target Domain
                      <input value={targetDomain} onChange={(event) => setTargetDomain(event.target.value)} />
                    </label>
                    <label>
                      Mailbox Key
                      <input value={mailboxKeyId} onChange={(event) => setMailboxKeyId(event.target.value)} />
                    </label>
                  </div>

                  <div className="button-row">
                    <button type="button" onClick={() => upsertConversation(activeConversationId)}>Open Conversation</button>
                    <button type="button" disabled={isBusy('messages:pull')} onClick={() => void pullMessages({ reason: 'pull-next-page' })}>Pull Next Page</button>
                    <button type="button" disabled={isBusy('messages:pull')} onClick={() => void refreshFromStart()}>Refresh From Start</button>
                    <button type="button" disabled={isBusy('messages:pull') || !runtime.lastPullError} onClick={() => void retryLastPull()}>Retry Last Pull</button>
                    <button
                      type="button"
                      disabled={isBusy('messages:pull')}
                      onClick={() => {
                        updateSessionRuntime(activeConversationId, (existing) => {
                          const changed = resetPullCursor(existing);
                          changed.lastPullError = null;
                          return changed;
                        });
                        addLog('ok', 'messages:cursor', `cursor reset for ${activeConversationId}`);
                      }}
                    >
                      Reset Cursor
                    </button>
                  </div>

                  <article className="session-status-card">
                    <h3>Session Runtime Status</h3>
                    <div className="status-grid">
                      <div className="status-row"><span>Cursor</span><code>{runtime.cursor || 'null'}</code></div>
                      <div className="status-row"><span>Last Pull</span><code>{formatIsoOrDash(runtime.lastPullAt)}</code></div>
                      <div className="status-row"><span>Last Pull Count</span><code>{runtime.lastPullCount}</code></div>
                      <div className="status-row"><span>Pull Failures</span><code>{runtime.pullFailures}</code></div>
                      <div className="status-row"><span>Last Pull Error</span><code>{runtime.lastPullError || '-'}</code></div>
                      <div className="status-row"><span>Last Send</span><code>{formatIsoOrDash(runtime.lastSendAt)}</code></div>
                      <div className="status-row"><span>Send Failures</span><code>{runtime.sendFailures}</code></div>
                      <div className="status-row"><span>Last Send Error</span><code>{runtime.lastSendError || '-'}</code></div>
                    </div>
                  </article>

                  <div className="session-layout">
                    <aside className="session-list-wrap">
                      <h3>Conversation List</h3>
                      <ul className="session-list">
                        {conversations.map((conversation) => (
                          <li key={conversation.id}>
                            <button
                              type="button"
                              className={`session-item ${conversation.id === activeConversationId ? 'is-selected' : ''}`}
                              onClick={() => setActiveConversationId(conversation.id)}
                            >
                              <span className="session-label">{conversation.label}</span>
                              <span className="session-id">{conversation.id}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </aside>

                    <section className="chat-wrap">
                      <h3>Timeline</h3>
                      <ul className="message-list">
                        {currentMessages.length ? currentMessages.slice(-120).map((item) => (
                          <li className="message-row" key={String(item.envelopeId)}>
                            <div className="message-meta">seq={String(item.seq ?? '-')} · {String(item.senderDid ?? 'unknown')}</div>
                            <div className="message-body">{String(item.ciphertext ?? '')}</div>
                          </li>
                        )) : <li className="message-empty">No messages loaded yet.</li>}
                      </ul>

                      <label className="composer-label">
                        Draft Message
                        <textarea rows={3} value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} />
                      </label>

                      <div className="button-row">
                        <button type="button" disabled={isBusy('messages:send')} onClick={() => void sendMessage()}>Send Message</button>
                        <button type="button" disabled={isBusy('messages:send') || !runtime.lastFailedEnvelope} onClick={() => void retryLastSend()}>Retry Last Failed Send</button>
                        <button type="button" disabled={isBusy('identity:self')} onClick={() => void refreshSelfIdentity()}>Refresh Self Identity</button>
                      </div>
                    </section>
                  </div>
                </section>
              )}
            />

            <Route
              path="/groups"
              element={(
                <section className="card">
                  <h2>Groups</h2>
                  <p className="card-subtitle">Typed validation + chain-state and members diagnostics.</p>

                  <div className="toolbar-grid">
                    <label>Creator DID <input value={groupForm.creatorDid} onChange={(e) => setGroupForm((p) => ({ ...p, creatorDid: e.target.value }))} /></label>
                    <label>Invitee DID <input value={groupForm.inviteeDid} onChange={(e) => setGroupForm((p) => ({ ...p, inviteeDid: e.target.value }))} /></label>
                    <label>Group ID <input value={groupForm.groupId} onChange={(e) => setGroupForm((p) => ({ ...p, groupId: e.target.value }))} /></label>
                    <label>Group Domain <input value={groupForm.groupDomain} onChange={(e) => setGroupForm((p) => ({ ...p, groupDomain: e.target.value }))} /></label>
                    <label>Domain Proof Hash <input value={groupForm.domainProofHash} onChange={(e) => setGroupForm((p) => ({ ...p, domainProofHash: e.target.value }))} /></label>
                    <label>Initial MLS Hash <input value={groupForm.initialMlsStateHash} onChange={(e) => setGroupForm((p) => ({ ...p, initialMlsStateHash: e.target.value }))} /></label>
                    <label>Invite ID <input value={groupForm.inviteId} onChange={(e) => setGroupForm((p) => ({ ...p, inviteId: e.target.value }))} /></label>
                    <label>Invite MLS Commit Hash <input value={groupForm.inviteMlsCommitHash} onChange={(e) => setGroupForm((p) => ({ ...p, inviteMlsCommitHash: e.target.value }))} /></label>
                    <label>Accept MLS Welcome Hash <input value={groupForm.acceptMlsWelcomeHash} onChange={(e) => setGroupForm((p) => ({ ...p, acceptMlsWelcomeHash: e.target.value }))} /></label>
                  </div>

                  <div className="button-row">
                    <button type="button" disabled={isBusy('groups:create')} onClick={() => void createGroup()}>Create Group</button>
                    <button type="button" disabled={isBusy('groups:invite')} onClick={() => void inviteMember()}>Invite Member</button>
                    <button type="button" disabled={isBusy('groups:accept')} onClick={() => void acceptInvite()}>Accept Invite</button>
                    <button type="button" disabled={isBusy('groups:create')} onClick={() => {
                      const next = createInitialGroupForm();
                      setGroupForm(next);
                      setGroupDiagnostics((previous) => ({ ...createGroupDiagnosticsState(), groupId: next.groupId, membersView: previous.membersView }));
                    }}>Regenerate IDs/Hashes</button>
                  </div>

                  <article className="session-status-card">
                    <h3>Group Diagnostics Controls</h3>
                    <div className="toolbar-grid">
                      <label>
                        Members View
                        <select
                          value={groupDiagnostics.membersView}
                          onChange={(event) => setGroupDiagnostics((previous) => ({
                            ...previous,
                            membersView: normalizeMembersView(event.target.value),
                          }))}
                        >
                          <option value="all">all</option>
                          <option value="pending">pending</option>
                          <option value="finalized">finalized</option>
                        </select>
                      </label>
                    </div>
                    <div className="button-row">
                      <button type="button" disabled={isBusy('groups:sync')} onClick={() => void refreshGroupDiagnostics()}>Refresh Chain State + Members</button>
                    </div>
                  </article>

                  <article className="session-status-card">
                    <h3>Group Diagnostics Status</h3>
                    <div className="status-grid">
                      <div className="status-row"><span>Group ID</span><code>{groupForm.groupId}</code></div>
                      <div className="status-row"><span>Members View</span><code>{groupDiagnostics.membersView}</code></div>
                      <div className="status-row"><span>Last Synced</span><code>{formatIsoOrDash(groupDiagnostics.lastSyncedAt)}</code></div>
                      <div className="status-row"><span>Last Action</span><code>{groupDiagnostics.lastAction || '-'}</code></div>
                      <div className="status-row"><span>Last Error</span><code>{groupDiagnostics.lastError || '-'}</code></div>
                      <div className="status-row"><span>Total</span><code>{memberSummary.total}</code></div>
                      <div className="status-row"><span>Pending</span><code>{memberSummary.pending}</code></div>
                      <div className="status-row"><span>Finalized</span><code>{memberSummary.finalized}</code></div>
                      <div className="status-row"><span>Removed</span><code>{memberSummary.removed}</code></div>
                    </div>
                  </article>

                  <div className="session-layout">
                    <article className="session-list-wrap">
                      <h3>Chain State</h3>
                      <pre>{JSON.stringify(groupDiagnostics.chainState ?? { hint: 'No chain-state loaded yet.' }, null, 2)}</pre>
                    </article>
                    <article className="chat-wrap">
                      <h3>Members</h3>
                      <ul className="group-member-list">
                        {groupDiagnostics.members.length ? groupDiagnostics.members.map((member, index) => (
                          <li className="group-member-row" key={`${String(member.did || 'member')}-${index}`}>
                            <div className="group-member-did">{String(member.did || '-')}</div>
                            <div className="group-member-meta">state={String(member.state || '-')} · invite={String(member.inviteId || '-')}</div>
                          </li>
                        )) : <li className="message-empty">No members loaded yet.</li>}
                      </ul>
                    </article>
                  </div>
                </section>
              )}
            />

            <Route
              path="/identity"
              element={(
                <section className="card">
                  <h2>Identity</h2>
                  <p className="card-subtitle">Self identity, DID resolution and keccak256(utf8(did)) diagnostics.</p>

                  <div className="toolbar-grid">
                    <label>
                      DID Lookup
                      <input value={identityLookupDid} onChange={(event) => setIdentityLookupDid(event.target.value)} />
                    </label>
                  </div>

                  <div className="button-row">
                    <button type="button" disabled={isBusy('identity:self')} onClick={() => void refreshSelfIdentity()}>Load Self Identity</button>
                    <button type="button" disabled={isBusy('identity:resolve')} onClick={() => void resolveIdentity()}>Resolve DID</button>
                  </div>

                  <article className="session-status-card">
                    <h3>DID Diagnostics (Sender)</h3>
                    <div className="status-grid">
                      <div className="status-row"><span>Raw DID</span><code>{senderDidDiagnostics.input || '-'}</code></div>
                      <div className="status-row"><span>Normalized DID</span><code>{senderDidDiagnostics.normalizedDid || '-'}</code></div>
                      <div className="status-row"><span>Method</span><code>{senderDidDiagnostics.method || '-'}</code></div>
                      <div className="status-row"><span>Identifier</span><code>{senderDidDiagnostics.identifier || '-'}</code></div>
                      <div className="status-row"><span>Valid did:claw:*</span><code>{senderDidDiagnostics.isValidDid ? 'true' : 'false'}</code></div>
                      <div className="status-row"><span>DID Hash (keccak256 utf8)</span><code>{senderDidDiagnostics.didHash || '-'}</code></div>
                      <div className="status-row"><span>Node DID Hash</span><code>{senderDidDiagnostics.remoteDidHash || '-'}</code></div>
                      <div className="status-row"><span>Hash Match</span><code>{senderDidDiagnostics.hashMatchesRemote === null ? 'unknown' : String(senderDidDiagnostics.hashMatchesRemote)}</code></div>
                    </div>
                  </article>

                  <article className="session-status-card">
                    <h3>DID Diagnostics (Lookup)</h3>
                    <div className="status-grid">
                      <div className="status-row"><span>Raw DID</span><code>{lookupDidDiagnostics.input || '-'}</code></div>
                      <div className="status-row"><span>Normalized DID</span><code>{lookupDidDiagnostics.normalizedDid || '-'}</code></div>
                      <div className="status-row"><span>Method</span><code>{lookupDidDiagnostics.method || '-'}</code></div>
                      <div className="status-row"><span>Identifier</span><code>{lookupDidDiagnostics.identifier || '-'}</code></div>
                      <div className="status-row"><span>Valid did:claw:*</span><code>{lookupDidDiagnostics.isValidDid ? 'true' : 'false'}</code></div>
                      <div className="status-row"><span>DID Hash (keccak256 utf8)</span><code>{lookupDidDiagnostics.didHash || '-'}</code></div>
                      <div className="status-row"><span>Node DID Hash</span><code>{lookupDidDiagnostics.remoteDidHash || '-'}</code></div>
                      <div className="status-row"><span>Hash Match</span><code>{lookupDidDiagnostics.hashMatchesRemote === null ? 'unknown' : String(lookupDidDiagnostics.hashMatchesRemote)}</code></div>
                    </div>
                  </article>

                  <div className="identity-grid">
                    <article className="mini-card">
                      <h3>Self Identity</h3>
                      <pre>{JSON.stringify(selfIdentity ?? { hint: 'No data' }, null, 2)}</pre>
                    </article>
                    <article className="mini-card">
                      <h3>Resolved Identity</h3>
                      <pre>{JSON.stringify(resolvedIdentity ?? { hint: 'No data' }, null, 2)}</pre>
                    </article>
                  </div>
                </section>
              )}
            />

            <Route
              path="/settings"
              element={(
                <section className="card">
                  <h2>Settings</h2>
                  <p className="card-subtitle">Connection, node health and runtime diagnostics.</p>

                  <div className="toolbar-grid">
                    <label>
                      API Base URL
                      <input value={apiBase} onChange={(event) => setApiBase(event.target.value.trim() || DEFAULT_API_BASE)} />
                    </label>
                  </div>

                  <div className="button-row">
                    <button type="button" onClick={() => saveApiBase()}>Save API Base</button>
                    <button type="button" disabled={isBusy('settings:health')} onClick={() => void checkNodeHealth()}>Refresh Node Diagnostics</button>
                  </div>

                  <article className="session-status-card">
                    <h3>Node Runtime Diagnostics</h3>
                    <div className="status-grid">
                      <div className="status-row"><span>Level</span><code>{nodeRuntimeDiagnostics.level}</code></div>
                      <div className="status-row"><span>Service</span><code>{nodeRuntimeDiagnostics.service || '-'}</code></div>
                      <div className="status-row"><span>Version</span><code>{nodeRuntimeDiagnostics.version || '-'}</code></div>
                      <div className="status-row"><span>Generated At</span><code>{nodeRuntimeDiagnostics.generatedAt || '-'}</code></div>
                      <div className="status-row"><span>Uptime (sec)</span><code>{nodeRuntimeDiagnostics.uptimeSec ?? '-'}</code></div>
                      <div className="status-row"><span>Total Requests</span><code>{nodeRuntimeDiagnostics.totalRequests ?? '-'}</code></div>
                      <div className="status-row"><span>Error Rate Ratio</span><code>{nodeRuntimeDiagnostics.errorRateRatio ?? '-'}</code></div>
                      <div className="status-row"><span>P95 Latency (ms)</span><code>{nodeRuntimeDiagnostics.p95LatencyMs ?? '-'}</code></div>
                      <div className="status-row"><span>Mailbox Stale (sec)</span><code>{nodeRuntimeDiagnostics.mailboxStaleSec ?? '-'}</code></div>
                      <div className="status-row"><span>DLQ Burn Rate</span><code>{nodeRuntimeDiagnostics.dlqBurnRate ?? '-'}</code></div>
                      <div className="status-row"><span>WARN Alerts</span><code>{nodeRuntimeDiagnostics.alertCounts.warn}</code></div>
                      <div className="status-row"><span>CRITICAL Alerts</span><code>{nodeRuntimeDiagnostics.alertCounts.critical}</code></div>
                    </div>
                  </article>

                  <article className="mini-card">
                    <h3>Current Runtime</h3>
                    <pre>{JSON.stringify({ apiBase, activeConversationId }, null, 2)}</pre>
                  </article>

                  <div className="identity-grid">
                    <article className="mini-card">
                      <h3>Node Info</h3>
                      <pre>{JSON.stringify(nodeInfo ?? { hint: 'Run node diagnostics to load /api/v1/node' }, null, 2)}</pre>
                    </article>
                    <article className="mini-card">
                      <h3>Node Metrics</h3>
                      <pre>{JSON.stringify(nodeMetrics ?? { hint: 'Run node diagnostics to load /api/v1/node/metrics' }, null, 2)}</pre>
                    </article>
                  </div>
                </section>
              )}
            />
          </Routes>
        </section>

        <aside className="inspect-panel card">
          <div className="inspect-head">
            <h2>Inspector</h2>
            <button type="button" className="ghost" onClick={clearLogs}>Clear</button>
          </div>

          <h3>Activity</h3>
          <ul className="log-list">
            {logs.length ? logs.map((entry, index) => (
              <li className={`log-item log-${entry.level}`} key={`${entry.timestamp}-${index}`}>
                <div className="log-head">{entry.action} <span>{entry.timestamp}</span></div>
                <div className="log-detail">{entry.detail}</div>
              </li>
            )) : <li className="log-empty">No activity yet.</li>}
          </ul>

          <h3>Last API Response</h3>
          <pre>{JSON.stringify(lastResponse ?? { hint: 'No API response yet.' }, null, 2)}</pre>
        </aside>
      </main>
    </div>
  );
}
