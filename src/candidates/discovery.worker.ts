/// <reference lib="webworker" />
import { discoverJunctionCandidates } from './discover.ts';
import type { DiscoveryRequest, DiscoveryResponse } from './discovery-protocol.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<DiscoveryRequest>) => {
  const { identity, input } = event.data;
  let response: DiscoveryResponse;
  try {
    response = { type: 'result', identity, result: discoverJunctionCandidates(input) };
  } catch (error) {
    response = { type: 'error', identity, message: error instanceof Error ? error.message : 'Geometry analysis failed.' };
  }
  scope.postMessage(response);
};
