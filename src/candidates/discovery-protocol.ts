import type { DiscoveryInput, DiscoveryResult } from './discover.ts';

export interface DiscoveryIdentity {
  generation: number;
  workpieceId: string;
  geometryRevision: string;
}

export interface DiscoveryRequest {
  identity: DiscoveryIdentity;
  input: DiscoveryInput;
}

export type DiscoveryResponse =
  | { type: 'result'; identity: DiscoveryIdentity; result: DiscoveryResult }
  | { type: 'error'; identity: DiscoveryIdentity; message: string };
