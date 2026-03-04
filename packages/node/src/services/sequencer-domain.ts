import { ErrorCodes, TelagentError } from '@telagent/protocol';

const DOMAIN_PATTERN =
  /^(localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?::\d{1,5})?$/;

export interface SequencerDomainInput {
  conversationId: string;
  conversationType: 'direct' | 'group';
  targetDomain: string;
}

export interface SequencerDomainResolverDeps {
  selfDomain: string;
  resolveGroupDomain: (groupId: string) => string;
}

export function resolveSequencerDomain(
  input: SequencerDomainInput,
  deps: SequencerDomainResolverDeps,
): string {
  const selfDomain = normalizeFederationDomain(deps.selfDomain, 'selfDomain');
  const targetDomain = normalizeFederationDomain(input.targetDomain, 'targetDomain');

  if (input.conversationType === 'group') {
    const groupId = resolveGroupId(input.conversationId);
    const groupDomain = normalizeFederationDomain(deps.resolveGroupDomain(groupId), 'groupDomain');
    return groupDomain;
  }

  return selfDomain <= targetDomain ? selfDomain : targetDomain;
}

export function normalizeFederationDomain(domain: string, fieldName = 'domain'): string {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) {
    throw new TelagentError(ErrorCodes.VALIDATION, `${fieldName} is required`);
  }
  if (!DOMAIN_PATTERN.test(normalized)) {
    throw new TelagentError(ErrorCodes.VALIDATION, `${fieldName} is not a valid federation domain`);
  }
  return normalized;
}

export function resolveGroupId(conversationId: string): string {
  return conversationId.startsWith('group:')
    ? conversationId.slice('group:'.length)
    : conversationId;
}

export function domainBaseUrl(domain: string): string {
  const normalized = normalizeFederationDomain(domain);
  if (
    normalized.startsWith('localhost')
    || normalized.startsWith('127.')
    || normalized.startsWith('10.')
    || normalized.startsWith('192.168.')
    || normalized.startsWith('172.16.')
    || normalized.startsWith('172.17.')
    || normalized.startsWith('172.18.')
    || normalized.startsWith('172.19.')
    || normalized.startsWith('172.20.')
    || normalized.startsWith('172.21.')
    || normalized.startsWith('172.22.')
    || normalized.startsWith('172.23.')
    || normalized.startsWith('172.24.')
    || normalized.startsWith('172.25.')
    || normalized.startsWith('172.26.')
    || normalized.startsWith('172.27.')
    || normalized.startsWith('172.28.')
    || normalized.startsWith('172.29.')
    || normalized.startsWith('172.30.')
    || normalized.startsWith('172.31.')
  ) {
    return `http://${normalized}`;
  }
  return `https://${normalized}`;
}
