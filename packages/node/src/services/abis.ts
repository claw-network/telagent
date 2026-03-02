import type { InterfaceAbi } from 'ethers';

export const CLAW_IDENTITY_ABI: InterfaceAbi = [
  'function isActive(bytes32 didHash) view returns (bool)',
  'function getController(bytes32 didHash) view returns (address)',
  'function getActiveKey(bytes32 didHash) view returns (bytes)',
];

export const CLAW_TOKEN_ABI: InterfaceAbi = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export const TELAGENT_GROUP_REGISTRY_ABI: InterfaceAbi = [
  'function createGroup(bytes32 groupId, bytes32 creatorDidHash, string groupDomain, bytes32 domainProofHash, bytes32 initialMlsStateHash)',
  'function inviteMember(bytes32 groupId, bytes32 inviteId, bytes32 inviterDidHash, bytes32 inviteeDidHash, bytes32 mlsCommitHash)',
  'function acceptInvite(bytes32 groupId, bytes32 inviteId, bytes32 inviteeDidHash, bytes32 mlsWelcomeHash)',
  'function removeMember(bytes32 groupId, bytes32 operatorDidHash, bytes32 memberDidHash, bytes32 mlsCommitHash)',
  'function getGroup(bytes32 groupId) view returns (tuple(bytes32 creatorDidHash, string groupDomain, bytes32 domainProofHash, bytes32 mlsStateHash, uint64 createdAt, uint64 updatedAt, bool active))',
  'function getMemberState(bytes32 groupId, bytes32 memberDidHash) view returns (uint8)',
  'event GroupCreated(bytes32 indexed groupId, bytes32 indexed creatorDidHash, bytes32 indexed domainHash, bytes32 domainProofHash, uint256 blockNumber)',
  'event MemberInvited(bytes32 indexed groupId, bytes32 indexed inviteId, bytes32 indexed inviterDidHash, bytes32 inviteeDidHash, bytes32 mlsCommitHash)',
  'event MemberAccepted(bytes32 indexed groupId, bytes32 indexed inviteId, bytes32 indexed memberDidHash, bytes32 mlsWelcomeHash)',
  'event MemberRemoved(bytes32 indexed groupId, bytes32 indexed memberDidHash, bytes32 indexed operatorDidHash, bytes32 mlsCommitHash)',
];

export const CLAW_ROUTER_ABI: InterfaceAbi = [
  'function registerModule(bytes32 key, address addr)',
  'function getModuleOrZero(bytes32 key) view returns (address)',
];
