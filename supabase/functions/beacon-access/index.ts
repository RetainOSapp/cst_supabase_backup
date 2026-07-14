import {
  createServiceClient,
  getBearerToken,
  isRegisteredSuperAdmin,
  requireAuthenticatedActor,
} from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/http.ts";
import {
  earlyProtocolResponse,
  publicErrorResponse,
  readJsonBody,
  rejectUntrustedOrigin,
  requestId,
} from "../beacon-chat/_shared/edge.ts";
import { handleBeaconAccess } from "./handler.mjs";

Deno.serve(async (req) => {
  const id = requestId();
  const originFailure = rejectUntrustedOrigin(req, id);
  if (originFailure) return originFailure;
  const protocolResponse = earlyProtocolResponse(req, id);
  if (protocolResponse) return protocolResponse;

  try {
    const body = await readJsonBody(req);
    const result = await handleBeaconAccess({
      body,
      token: getBearerToken(req),
      serviceClient: createServiceClient(),
      authenticate: requireAuthenticatedActor,
      checkRegisteredSuperAdmin: isRegisteredSuperAdmin,
    });
    return jsonResponse(req, result);
  } catch (error) {
    return publicErrorResponse(req, error, id);
  }
});
