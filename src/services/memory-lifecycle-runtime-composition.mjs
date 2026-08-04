// Unwired candidate composition. Constructing this object grants no runtime,
// integration, activation, or authority. It exists to make split-coordinator
// construction impossible inside the Memory lifecycle candidate graph.

import { createMemoryLifecycleBatchResolver } from "./memory-lifecycle-batch-resolver.mjs";
import { createMemoryLifecycleBoundaryCoordinator } from "./memory-lifecycle-boundary-coordinator.mjs";
import { createMemoryLifecycleService } from "./memory-lifecycle-service.mjs";
import { createMemoryLifecycleUnifiedService } from "./memory-lifecycle-unified-service.mjs";

export function createMemoryLifecycleRuntimeComposition({
  lifecycleLedger, lifecycleBindingLedger, memoryAuthorityGateway, memoryCandidateProvider, contextFederation,
  recordSource, authoritySource, retentionSource, evidenceSource, sodRules, now,
  lifecycleTimeouts, timeoutMs, freshnessMs
} = {}) {
  const boundaryCoordinator = createMemoryLifecycleBoundaryCoordinator({ lifecycleLedger,
    recordSource, authoritySource, retentionSource, evidenceSource });
  const lifecycleService = createMemoryLifecycleService({ ledger: lifecycleLedger,
    authorityResolver: boundaryCoordinator.resolveAuthority,
    recordResolver: boundaryCoordinator.resolveRecords,
    retentionPolicyResolver: boundaryCoordinator.resolveRetention,
    evidenceResolver: boundaryCoordinator.resolveEvidence,
    boundaryCoordinator, sodRules, now, timeouts: lifecycleTimeouts });
  const lifecycleResolver = createMemoryLifecycleBatchResolver({ lifecycleService,
    issuanceCoordinator: boundaryCoordinator, now });
  const unifiedService = createMemoryLifecycleUnifiedService({ memoryAuthorityGateway, lifecycleResolver,
    memoryCandidateProvider, contextFederation, lifecycleBindingLedger, now,
    ...(timeoutMs === undefined ? {} : { timeoutMs }), ...(freshnessMs === undefined ? {} : { freshnessMs }) });
  return Object.freeze({ boundaryCoordinator, lifecycleService, lifecycleResolver, unifiedService });
}
