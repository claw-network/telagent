import { ErrorCodes, TelagentError, isDidClaw, type AgentDID } from '@telagent/protocol';
import { keccak256, toUtf8Bytes } from 'ethers';

const GROUP_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DOMAIN_PATTERN =
  /^(localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?::\d{1,5})?$/;
const NODE_INFO_PATH = '/api/v1/federation/node-info';

const DEFAULT_CHALLENGE_TTL_SEC = 86_400;
const DEFAULT_ROTATE_BEFORE_EXPIRY_SEC = 900;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

export type DomainProofEnforcementMode = 'enforced' | 'report-only';

export interface DomainProofChallengeServiceClock {
  now(): number;
}

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<FetchLikeResponse>;

export interface DomainProofChallengeServiceOptions {
  enforcementMode?: DomainProofEnforcementMode;
  challengeTtlSec?: number;
  rotateBeforeExpirySec?: number;
  requestTimeoutMs?: number;
  clock?: DomainProofChallengeServiceClock;
  fetcher?: FetchLike;
}

export interface DomainProofDocument {
  groupId: string;
  groupDomain: string;
  creatorDid: AgentDID;
  nodeInfoUrl: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  signature: string;
}

export interface ValidateDomainProofInput {
  groupId: string;
  groupDomain: string;
  creatorDid: AgentDID;
  domainProofHash: string;
}

export interface ValidateDomainProofResult {
  enforced: boolean;
  passed: boolean;
  challengeId?: string;
  rotated: boolean;
  computedDomainProofHash?: string;
  warning?: string;
}

interface NormalizedInput {
  groupId: string;
  groupDomain: string;
  creatorDid: AgentDID;
  domainProofHash: string;
}

interface ParsedDomainProofDocument {
  document: DomainProofDocument;
  groupDomain: string;
  creatorDid: AgentDID;
  issuedAtMs: number;
  expiresAtMs: number;
}

interface DomainProofChallengeRecord {
  challengeId: string;
  nonce: string;
  revision: number;
  issuedAtMs: number;
  expiresAtMs: number;
}

const SYSTEM_CLOCK: DomainProofChallengeServiceClock = {
  now: () => Date.now(),
};

function resolveFetcher(fetcher: FetchLike | undefined): FetchLike {
  if (fetcher) {
    return fetcher;
  }

  if (typeof globalThis.fetch !== 'function') {
    throw new Error('global fetch is unavailable');
  }

  return async (input, init) => {
    return globalThis.fetch(input, init) as Promise<FetchLikeResponse>;
  };
}

export class DomainProofChallengeService {
  private readonly challengeByKey = new Map<string, DomainProofChallengeRecord>();
  private readonly enforcementMode: DomainProofEnforcementMode;
  private readonly challengeTtlMs: number;
  private readonly rotateBeforeExpiryMs: number;
  private readonly requestTimeoutMs: number;
  private readonly clock: DomainProofChallengeServiceClock;
  private readonly fetcher: FetchLike;

  constructor(options: DomainProofChallengeServiceOptions = {}) {
    this.enforcementMode = options.enforcementMode ?? 'enforced';
    this.challengeTtlMs = Math.max(60_000, (options.challengeTtlSec ?? DEFAULT_CHALLENGE_TTL_SEC) * 1_000);
    const requestedRotateBeforeExpiryMs = Math.max(
      30_000,
      (options.rotateBeforeExpirySec ?? DEFAULT_ROTATE_BEFORE_EXPIRY_SEC) * 1_000,
    );
    this.rotateBeforeExpiryMs = Math.min(requestedRotateBeforeExpiryMs, this.challengeTtlMs - 1_000);
    this.requestTimeoutMs = Math.max(500, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.fetcher = resolveFetcher(options.fetcher);
  }

  async validateForCreateGroup(input: ValidateDomainProofInput): Promise<ValidateDomainProofResult> {
    if (this.enforcementMode === 'report-only') {
      try {
        return await this.validateStrict(input, false);
      } catch (error) {
        return {
          enforced: false,
          passed: false,
          rotated: false,
          warning: error instanceof Error ? error.message : 'domain proof validation failed',
        };
      }
    }

    return this.validateStrict(input, true);
  }

  private async validateStrict(input: ValidateDomainProofInput, enforced: boolean): Promise<ValidateDomainProofResult> {
    const normalized = this.normalizeInput(input);
    const proofUrl = this.buildProofUrl(normalized.groupDomain, normalized.groupId);
    const proof = await this.fetchDomainProofDocument(proofUrl);
    this.assertDomainProofDocument(proof, normalized);
    await this.assertNodeInfoDomain(proof.document.nodeInfoUrl, normalized.groupDomain);

    const computedHash = hashDomainProofDocument(proof.document);
    if (computedHash.toLowerCase() !== normalized.domainProofHash.toLowerCase()) {
      throw new TelagentError(ErrorCodes.CONFLICT, 'domainProofHash does not match canonical proof document hash');
    }

    const challenge = this.upsertChallenge(normalized, proof);
    return {
      enforced,
      passed: true,
      challengeId: challenge.challengeId,
      rotated: challenge.rotated,
      computedDomainProofHash: computedHash,
    };
  }

  private upsertChallenge(
    normalized: NormalizedInput,
    proof: ParsedDomainProofDocument,
  ): { challengeId: string; rotated: boolean } {
    const now = this.clock.now();
    const key = this.challengeKey(normalized);
    const previous = this.challengeByKey.get(key);
    const boundedExpiresAtMs = Math.min(proof.expiresAtMs, now + this.challengeTtlMs);

    if (!previous) {
      const next = this.newChallengeRecord(normalized, proof.document.nonce, 1, proof.issuedAtMs, boundedExpiresAtMs);
      this.challengeByKey.set(key, next);
      return {
        challengeId: next.challengeId,
        rotated: false,
      };
    }

    const rotationRequired = now >= previous.expiresAtMs - this.rotateBeforeExpiryMs;
    if (!rotationRequired && proof.document.nonce !== previous.nonce) {
      throw new TelagentError(ErrorCodes.CONFLICT, 'domain proof nonce does not match active challenge');
    }

    if (rotationRequired && proof.document.nonce === previous.nonce) {
      throw new TelagentError(
        ErrorCodes.UNPROCESSABLE,
        'domain proof challenge is near expiry and requires nonce rotation',
      );
    }

    const revision = rotationRequired ? previous.revision + 1 : previous.revision;
    const next = this.newChallengeRecord(normalized, proof.document.nonce, revision, proof.issuedAtMs, boundedExpiresAtMs);
    this.challengeByKey.set(key, next);
    return {
      challengeId: next.challengeId,
      rotated: rotationRequired,
    };
  }

  private newChallengeRecord(
    normalized: NormalizedInput,
    nonce: string,
    revision: number,
    issuedAtMs: number,
    expiresAtMs: number,
  ): DomainProofChallengeRecord {
    return {
      challengeId: keccak256(
        toUtf8Bytes(`${normalized.groupId}:${normalized.groupDomain}:${normalized.creatorDid}:${nonce}:${revision}`),
      ),
      nonce,
      revision,
      issuedAtMs,
      expiresAtMs,
    };
  }

  private async fetchDomainProofDocument(url: string): Promise<ParsedDomainProofDocument> {
    const payload = await this.fetchJson(url, 'domain proof');
    const record = this.assertRecord(payload, 'domain proof document');

    const groupId = this.readRequiredString(record, 'groupId');
    if (!GROUP_ID_PATTERN.test(groupId)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'groupId in domain proof must be bytes32 hex string');
    }

    const groupDomainRaw = this.readRequiredString(record, 'groupDomain');
    const groupDomain = this.normalizeDomain(groupDomainRaw, 'groupDomain');
    const creatorDid = this.readRequiredString(record, 'creatorDid');
    if (!isDidClaw(creatorDid)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'creatorDid in domain proof must use did:claw format');
    }

    const nodeInfoUrl = this.readRequiredString(record, 'nodeInfoUrl');
    const issuedAt = this.readRequiredString(record, 'issuedAt');
    const expiresAt = this.readRequiredString(record, 'expiresAt');
    const nonce = this.readRequiredString(record, 'nonce');
    const signature = this.readRequiredString(record, 'signature');

    const issuedAtMs = this.parseIsoTimestamp(issuedAt, 'issuedAt');
    const expiresAtMs = this.parseIsoTimestamp(expiresAt, 'expiresAt');
    if (expiresAtMs <= issuedAtMs) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'expiresAt must be greater than issuedAt');
    }
    if (expiresAtMs <= this.clock.now()) {
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, 'domain proof has expired');
    }

    return {
      document: {
        groupId,
        groupDomain: groupDomainRaw,
        creatorDid,
        nodeInfoUrl,
        issuedAt,
        expiresAt,
        nonce,
        signature,
      },
      groupDomain,
      creatorDid,
      issuedAtMs,
      expiresAtMs,
    };
  }

  private assertDomainProofDocument(proof: ParsedDomainProofDocument, normalized: NormalizedInput): void {
    if (proof.document.groupId.toLowerCase() !== normalized.groupId.toLowerCase()) {
      throw new TelagentError(ErrorCodes.CONFLICT, 'domain proof groupId does not match createGroup request');
    }
    if (proof.groupDomain !== normalized.groupDomain) {
      throw new TelagentError(ErrorCodes.CONFLICT, 'domain proof groupDomain does not match createGroup request');
    }
    if (proof.creatorDid !== normalized.creatorDid) {
      throw new TelagentError(ErrorCodes.CONFLICT, 'domain proof creatorDid does not match createGroup request');
    }
  }

  private async assertNodeInfoDomain(nodeInfoUrl: string, expectedDomain: string): Promise<void> {
    const parsed = this.parseNodeInfoUrl(nodeInfoUrl);
    if (parsed.domain !== expectedDomain) {
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, 'nodeInfoUrl domain does not match groupDomain');
    }

    const payload = await this.fetchJson(nodeInfoUrl, 'node-info');
    const envelope = this.assertRecord(payload, 'node-info response');
    const data = this.assertRecord(envelope.data, 'node-info data');
    const nodeDomainRaw = this.readRequiredString(data, 'domain');
    const nodeDomain = this.normalizeDomain(nodeDomainRaw, 'node-info domain');
    if (nodeDomain !== expectedDomain) {
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, 'node-info domain does not match groupDomain');
    }
  }

  private parseNodeInfoUrl(raw: string): { domain: string } {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new TelagentError(ErrorCodes.VALIDATION, 'nodeInfoUrl must be an absolute URL');
    }

    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(isLocalhost && url.protocol === 'http:')) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'nodeInfoUrl must use https (localhost allows http)');
    }
    if (url.pathname !== NODE_INFO_PATH) {
      throw new TelagentError(
        ErrorCodes.VALIDATION,
        `nodeInfoUrl pathname must be ${NODE_INFO_PATH}`,
      );
    }

    return {
      domain: this.normalizeDomain(url.host.toLowerCase(), 'nodeInfoUrl host'),
    };
  }

  private async fetchJson(url: string, target: string): Promise<unknown> {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), this.requestTimeoutMs);
    timer.unref();

    try {
      const response = await this.fetcher(url, {
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw new TelagentError(
          ErrorCodes.UNPROCESSABLE,
          `${target} request failed with status ${response.status} ${response.statusText}`,
        );
      }

      try {
        return await response.json();
      } catch {
        throw new TelagentError(ErrorCodes.UNPROCESSABLE, `${target} response is not valid JSON`);
      }
    } catch (error) {
      if (error instanceof TelagentError) {
        throw error;
      }
      throw new TelagentError(ErrorCodes.UNPROCESSABLE, `${target} request failed`);
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizeInput(input: ValidateDomainProofInput): NormalizedInput {
    if (!GROUP_ID_PATTERN.test(input.groupId)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'groupId must be bytes32 hex string');
    }
    if (!BYTES32_PATTERN.test(input.domainProofHash)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'domainProofHash must be bytes32 hex string');
    }
    if (!isDidClaw(input.creatorDid)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'creatorDid must use did:claw format');
    }
    return {
      groupId: input.groupId,
      creatorDid: input.creatorDid,
      domainProofHash: input.domainProofHash,
      groupDomain: this.normalizeDomain(input.groupDomain, 'groupDomain'),
    };
  }

  private buildProofUrl(groupDomain: string, groupId: string): string {
    return `https://${groupDomain}/.well-known/telagent/group-proof/${groupId}.json`;
  }

  private challengeKey(input: Pick<NormalizedInput, 'groupId' | 'groupDomain' | 'creatorDid'>): string {
    return `${input.groupId}:${input.groupDomain}:${input.creatorDid}`;
  }

  private normalizeDomain(value: string, field: string): string {
    const normalized = value.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(normalized)) {
      throw new TelagentError(ErrorCodes.VALIDATION, `${field} is not a valid domain`);
    }
    return normalized;
  }

  private parseIsoTimestamp(value: string, field: string): number {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) {
      throw new TelagentError(ErrorCodes.VALIDATION, `${field} must be an ISO timestamp`);
    }
    return ms;
  }

  private assertRecord(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TelagentError(ErrorCodes.VALIDATION, `${field} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private readRequiredString(record: Record<string, unknown>, field: string): string {
    const value = record[field];
    if (typeof value !== 'string' || !value.trim()) {
      throw new TelagentError(ErrorCodes.VALIDATION, `${field} is required`);
    }
    return value;
  }
}

export function hashDomainProofDocument(document: DomainProofDocument): string {
  return keccak256(toUtf8Bytes(canonicalizeJson(document)));
}

function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObject(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
    const item = record[key];
    if (typeof item === 'undefined') {
      continue;
    }
    sorted[key] = sortObject(item);
  }
  return sorted;
}
