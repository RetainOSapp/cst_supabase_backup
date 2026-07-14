import {
  accessDecision,
  authorizationDecision,
  loadFeatureGate,
  resolveAccessContext,
} from "./database.mjs";

// Authentication and SuperAdmin registration checks are injected so this
// orchestration stays testable without a live auth service. Production indexes
// inject the repo's shared, server-side auth helpers.
export async function resolveBeaconAccess({
  serviceClient,
  token,
  companyId,
  authenticate,
  checkRegisteredSuperAdmin,
}) {
  const actor = await authenticate(serviceClient, token);
  const registeredSuperAdmin = await checkRegisteredSuperAdmin(
    serviceClient,
    actor,
  );
  const context = await resolveAccessContext({
    serviceClient,
    actor,
    companySelector: companyId,
    registeredSuperAdmin,
  });
  const authorization = authorizationDecision(context);
  if (!authorization.allowed) {
    return {
      actor,
      context,
      gate: null,
      decision: authorization,
    };
  }
  const gate = await loadFeatureGate(serviceClient, context);
  return {
    actor,
    context,
    gate,
    decision: accessDecision(context, gate),
  };
}
