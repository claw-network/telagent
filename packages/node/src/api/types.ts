import type { AttachmentService } from '../services/attachment-service.js';
import type { ClawNetGatewayService } from '../clawnet/gateway-service.js';
import type { NonceManager } from '../clawnet/nonce-manager.js';
import type { SessionManager } from '../clawnet/session-manager.js';
import type { FederationDeliveryService } from '../services/federation-delivery-service.js';
import type { FederationService } from '../services/federation-service.js';
import type { GasService } from '../services/gas-service.js';
import type { GroupService } from '../services/group-service.js';
import type { IdentityAdapterService } from '../services/identity-adapter-service.js';
import type { KeyLifecycleService } from '../services/key-lifecycle-service.js';
import type { MessageService } from '../services/message-service.js';
import type { NodeMonitoringService } from '../services/node-monitoring-service.js';
import type { OwnerPermissionService } from '../services/owner-permission-service.js';

export interface ApiServerConfig {
  host: string;
  port: number;
}

export interface RuntimeContext {
  config: ApiServerConfig;
  identityService: IdentityAdapterService;
  groupService: GroupService;
  gasService: GasService;
  messageService: MessageService;
  attachmentService: AttachmentService;
  federationService: FederationService;
  monitoringService: NodeMonitoringService;
  keyLifecycleService: KeyLifecycleService;
  clawnetGateway: ClawNetGatewayService;
  sessionManager: SessionManager;
  nonceManager: NonceManager;
  ownerPermissionService?: OwnerPermissionService;
  federationDeliveryService?: FederationDeliveryService;
}
