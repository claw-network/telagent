import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadOwnerNodeSnapshot } from './lib/api';
import {
  createDefaultTargets,
  readStoredTargets,
  sanitizeTargets,
  writeStoredTargets,
} from './lib/config';
import {
  formatAgo,
  formatCount,
  formatMs,
  formatPercent,
  formatUptime,
  truncateDid,
} from './lib/format';
import type { HealthLevel, NodeTarget, OwnerNodeSnapshot } from './lib/types';

function nextTargetId(targets: NodeTarget[]): string {
  const existing = new Set(targets.map((target) => target.id));
  let counter = 1;
  while (existing.has(`node-${counter}`)) {
    counter += 1;
  }
  return `node-${counter}`;
}

function healthLabel(level: HealthLevel): string {
  if (level === 'healthy') {
    return 'Healthy';
  }
  if (level === 'degraded') {
    return 'Degraded';
  }
  return 'Offline';
}

export function App() {
  const [targets, setTargets] = useState<NodeTarget[]>(() => readStoredTargets());
  const [snapshots, setSnapshots] = useState<Record<string, OwnerNodeSnapshot>>({});
  const [selectedTargetId, setSelectedTargetId] = useState<string>(() => readStoredTargets()[0]?.id ?? '');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [pollSeconds, setPollSeconds] = useState<number>(20);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState<number>(6500);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const enabledTargets = useMemo(
    () => targets.filter((target) => target.enabled),
    [targets],
  );

  const refreshNow = useCallback(async () => {
    const activeTargets = targets.filter((target) => target.enabled);
    if (activeTargets.length === 0) {
      setSnapshots({});
      setLastRefreshAt(new Date().toISOString());
      return;
    }

    setIsRefreshing(true);
    setRefreshError(null);

    try {
      const latest = await Promise.all(
        activeTargets.map((target) => loadOwnerNodeSnapshot(target, { timeoutMs: requestTimeoutMs })),
      );

      const latestById = Object.fromEntries(latest.map((snapshot) => [snapshot.target.id, snapshot]));

      setSnapshots((previous) => {
        const next: Record<string, OwnerNodeSnapshot> = {};
        for (const target of targets) {
          const snapshot = latestById[target.id] ?? previous[target.id];
          if (snapshot) {
            next[target.id] = snapshot;
          }
        }
        return next;
      });

      setLastRefreshAt(new Date().toISOString());
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [requestTimeoutMs, targets]);

  useEffect(() => {
    if (targets.length === 0) {
      setSelectedTargetId('');
      return;
    }

    if (!targets.some((target) => target.id === selectedTargetId)) {
      setSelectedTargetId(targets[0].id);
    }
  }, [selectedTargetId, targets]);

  useEffect(() => {
    void refreshNow();
    // refresh once on boot; subsequent refreshes are timer/manual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void refreshNow();
    }, Math.max(5, pollSeconds) * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoRefresh, pollSeconds, refreshNow]);

  const fleet = useMemo(() => {
    let healthy = 0;
    let degraded = 0;
    let offline = 0;
    let pending = 0;

    for (const target of enabledTargets) {
      const snapshot = snapshots[target.id];
      if (!snapshot) {
        pending += 1;
        continue;
      }

      if (snapshot.health.level === 'healthy') {
        healthy += 1;
      } else if (snapshot.health.level === 'degraded') {
        degraded += 1;
      } else {
        offline += 1;
      }
    }

    return {
      total: enabledTargets.length,
      healthy,
      degraded,
      offline,
      pending,
    };
  }, [enabledTargets, snapshots]);

  const selectedTarget = targets.find((target) => target.id === selectedTargetId) ?? null;
  const selectedSnapshot = selectedTarget ? snapshots[selectedTarget.id] : undefined;

  function persistTargets(nextTargets: Array<Partial<NodeTarget>>) {
    const sanitized = sanitizeTargets(nextTargets);
    setTargets(sanitized);
    writeStoredTargets(sanitized);
  }

  function updateTarget(id: string, patch: Partial<NodeTarget>) {
    setTargets((previous) => {
      const updated = previous.map((target) => (target.id === id ? { ...target, ...patch } : target));
      const sanitized = sanitizeTargets(updated);
      writeStoredTargets(sanitized);
      return sanitized;
    });
  }

  function addTarget() {
    setTargets((previous) => {
      const id = nextTargetId(previous);
      const next = sanitizeTargets([
        ...previous,
        {
          id,
          label: `Node ${previous.length + 1}`,
          baseUrl: 'https://',
          enabled: true,
        },
      ]);
      writeStoredTargets(next);
      setSelectedTargetId(id);
      return next;
    });
  }

  function removeTarget(id: string) {
    setTargets((previous) => {
      if (previous.length <= 1) {
        return previous;
      }
      const next = sanitizeTargets(previous.filter((target) => target.id !== id));
      writeStoredTargets(next);
      return next;
    });
  }

  function resetToDefaults() {
    const defaults = createDefaultTargets();
    persistTargets(defaults);
    setSnapshots({});
    setSelectedTargetId(defaults[0]?.id ?? '');
  }

  return (
    <div className="owner-console">
      <div className="atmo-layer" />
      <main className="layout">
        <header className="panel hero">
          <div>
            <p className="eyebrow">TelAgent Owner Console</p>
            <h1>Agent Owner 监控控制台</h1>
            <p className="hero-text">
              Owner 不参与 Agent 对话，但需要持续观测 DID、Federation、延迟、错误率与 DLQ。
            </p>
          </div>

          <div className="controls">
            <label>
              <span>自动刷新</span>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
            </label>

            <label>
              <span>轮询间隔 (秒)</span>
              <select
                value={pollSeconds}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  setPollSeconds(Number.isFinite(value) ? value : 20);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </label>

            <label>
              <span>请求超时 (ms)</span>
              <input
                type="number"
                min={1000}
                max={20000}
                step={500}
                value={requestTimeoutMs}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  setRequestTimeoutMs(Number.isFinite(value) ? Math.max(1000, Math.min(20000, value)) : 6500);
                }}
              />
            </label>

            <button type="button" className="primary" disabled={isRefreshing} onClick={() => void refreshNow()}>
              {isRefreshing ? '刷新中...' : '立即刷新'}
            </button>
          </div>

          <div className="hero-footnote">
            <span>Last Refresh: {lastRefreshAt ? `${lastRefreshAt} (${formatAgo(lastRefreshAt)})` : 'never'}</span>
            {refreshError ? <span className="error">{refreshError}</span> : null}
          </div>
        </header>

        <section className="summary-grid">
          <article className="panel summary-card">
            <p>Total Nodes</p>
            <h2>{fleet.total}</h2>
          </article>
          <article className="panel summary-card summary-ok">
            <p>Healthy</p>
            <h2>{fleet.healthy}</h2>
          </article>
          <article className="panel summary-card summary-warn">
            <p>Degraded</p>
            <h2>{fleet.degraded}</h2>
          </article>
          <article className="panel summary-card summary-off">
            <p>Offline / Pending</p>
            <h2>{fleet.offline + fleet.pending}</h2>
          </article>
        </section>

        <section className="workspace">
          <aside className="panel targets-panel">
            <div className="section-head">
              <h2>节点配置</h2>
              <span>{targets.length} configured</span>
            </div>

            <div className="target-list">
              {targets.map((target) => (
                <article className="target-item" key={target.id}>
                  <div className="target-item-head">
                    <strong>{target.id}</strong>
                    <button type="button" className="danger" onClick={() => removeTarget(target.id)} disabled={targets.length <= 1}>
                      删除
                    </button>
                  </div>

                  <label>
                    <span>显示名称</span>
                    <input
                      value={target.label}
                      onChange={(event) => updateTarget(target.id, { label: event.target.value })}
                    />
                  </label>

                  <label>
                    <span>Base URL</span>
                    <input
                      value={target.baseUrl}
                      onChange={(event) => updateTarget(target.id, { baseUrl: event.target.value })}
                      placeholder="https://node.example.org"
                    />
                  </label>

                  <label className="inline-toggle">
                    <input
                      type="checkbox"
                      checked={target.enabled}
                      onChange={(event) => updateTarget(target.id, { enabled: event.target.checked })}
                    />
                    <span>纳入监控</span>
                  </label>
                </article>
              ))}
            </div>

            <div className="target-actions">
              <button type="button" onClick={addTarget}>新增节点</button>
              <button type="button" className="ghost" onClick={resetToDefaults}>恢复默认节点</button>
            </div>
          </aside>

          <section className="panel fleet-panel">
            <div className="section-head">
              <h2>节点状态总览</h2>
              <span>{enabledTargets.length} active</span>
            </div>

            {enabledTargets.length === 0 ? (
              <p className="placeholder">当前没有启用节点，Owner 无法获取监控数据。</p>
            ) : (
              <div className="fleet-grid">
                {enabledTargets.map((target) => {
                  const snapshot = snapshots[target.id];
                  const healthLevel = snapshot?.health.level;
                  const stateClass = healthLevel ? `state-${healthLevel}` : 'state-pending';
                  const stateLabel = healthLevel ? healthLabel(healthLevel) : 'Pending';

                  return (
                    <button
                      type="button"
                      key={target.id}
                      className={`node-card ${stateClass} ${selectedTargetId === target.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedTargetId(target.id)}
                    >
                      <div className="node-card-head">
                        <strong>{target.label}</strong>
                        <span className={`badge ${stateClass}`}>{stateLabel}</span>
                      </div>

                      <p className="node-meta">{snapshot?.federationDomain || target.baseUrl || '-'}</p>

                      <div className="kv-grid">
                        <div>
                          <span>DID</span>
                          <code>{truncateDid(snapshot?.identityDid)}</code>
                        </div>
                        <div>
                          <span>Health Score</span>
                          <b>{snapshot ? snapshot.health.score : '-'}</b>
                        </div>
                        <div>
                          <span>Error Rate</span>
                          <b>{snapshot ? formatPercent(snapshot.errorRateRatio) : '-'}</b>
                        </div>
                        <div>
                          <span>P95 Latency</span>
                          <b>{snapshot ? formatMs(snapshot.p95LatencyMs) : '-'}</b>
                        </div>
                        <div>
                          <span>DLQ Pending</span>
                          <b>{snapshot ? formatCount(snapshot.dlqPending) : '-'}</b>
                        </div>
                        <div>
                          <span>Alerts</span>
                          <b>{snapshot ? `${snapshot.criticalAlerts}C / ${snapshot.warnAlerts}W` : '-'}</b>
                        </div>
                      </div>

                      {snapshot?.errors.length ? (
                        <p className="node-error">{snapshot.errors[0]}</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        <section className="panel detail-panel">
          <div className="section-head">
            <h2>选中节点详情</h2>
            <span>{selectedTarget?.label || '未选择节点'}</span>
          </div>

          {!selectedTarget ? (
            <p className="placeholder">请选择一个节点查看明细。</p>
          ) : !selectedSnapshot ? (
            <p className="placeholder">该节点暂无采样，请点击“立即刷新”。</p>
          ) : (
            <>
              <div className="detail-grid">
                <article className="subpanel">
                  <h3>关键指标</h3>
                  <div className="kv-grid">
                    <div>
                      <span>Health</span>
                      <b>{healthLabel(selectedSnapshot.health.level)}</b>
                    </div>
                    <div>
                      <span>Health Score</span>
                      <b>{selectedSnapshot.health.score}</b>
                    </div>
                    <div>
                      <span>Service Version</span>
                      <b>{selectedSnapshot.serviceVersion || '-'}</b>
                    </div>
                    <div>
                      <span>DID Hash</span>
                      <code>{truncateDid(selectedSnapshot.identityDidHash, 16, 10)}</code>
                    </div>
                    <div>
                      <span>Uptime</span>
                      <b>{formatUptime(selectedSnapshot.raw.metrics?.uptimeSec ?? 0)}</b>
                    </div>
                    <div>
                      <span>Total Requests</span>
                      <b>{formatCount(selectedSnapshot.raw.metrics?.totals.requests ?? 0)}</b>
                    </div>
                    <div>
                      <span>Mailbox Stale</span>
                      <b>{formatCount(selectedSnapshot.mailboxStaleSec)}s</b>
                    </div>
                    <div>
                      <span>Fetch Cost</span>
                      <b>{formatMs(selectedSnapshot.totalLatencyMs)}</b>
                    </div>
                  </div>
                </article>

                <article className="subpanel">
                  <h3>健康判定原因</h3>
                  <ul className="reason-list">
                    {selectedSnapshot.health.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <h3>Federation Capabilities</h3>
                  <p className="capability-list">
                    {selectedSnapshot.capabilities.length ? selectedSnapshot.capabilities.join(' · ') : '-'}
                  </p>
                </article>
              </div>

              <div className="detail-grid">
                <article className="subpanel">
                  <h3>告警列表</h3>
                  {selectedSnapshot.alerts.length ? (
                    <ul className="alert-list">
                      {selectedSnapshot.alerts.map((alert) => (
                        <li className={`alert-item alert-${alert.level.toLowerCase()}`} key={`${alert.code}-${alert.title}`}>
                          <div className="alert-head">
                            <strong>{alert.title}</strong>
                            <span>{alert.level}</span>
                          </div>
                          <p>{alert.message}</p>
                          <p className="alert-metric">value={formatCount(alert.value)} threshold={formatCount(alert.threshold)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="placeholder">暂无活跃告警。</p>
                  )}
                </article>

                <article className="subpanel">
                  <h3>热点路由</h3>
                  {selectedSnapshot.routeHotspots.length ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Path</th>
                          <th>Count</th>
                          <th>Error</th>
                          <th>P95</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSnapshot.routeHotspots.map((route) => (
                          <tr key={route.path}>
                            <td><code>{route.path}</code></td>
                            <td>{formatCount(route.count)}</td>
                            <td>{formatPercent(route.errorRateRatio)}</td>
                            <td>{formatMs(route.p95LatencyMs)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="placeholder">暂无路由样本。</p>
                  )}
                </article>
              </div>

              <article className="subpanel">
                <h3>接口错误</h3>
                {selectedSnapshot.errors.length ? (
                  <ul className="reason-list">
                    {selectedSnapshot.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="placeholder">本轮采样无接口失败。</p>
                )}
              </article>

              <details className="raw-payload">
                <summary>Raw Payload</summary>
                <pre>{JSON.stringify(selectedSnapshot.raw, null, 2)}</pre>
              </details>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
