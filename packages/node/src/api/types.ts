import type { AttachmentService } from '../services/attachment-service.js';
import type { FederationService } from '../services/federation-service.js';
import type { GasService } from '../services/gas-service.js';
import type { GroupService } from '../services/group-service.js';
import type { IdentityAdapterService } from '../services/identity-adapter-service.js';
import type { MessageService } from '../services/message-service.js';

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
}
