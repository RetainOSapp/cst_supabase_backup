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
} from "./_shared/edge.ts";
import { createOpenAIResponsesProvider } from "./_shared/provider.mjs";
import { handleBeaconChat } from "./handler.mjs";

Deno.serve(async (req) => {
  const id = requestId();
  const originFailure = rejectUntrustedOrigin(req, id);
  if (originFailure) return originFailure;
  const protocolResponse = earlyProtocolResponse(req, id);
  if (protocolResponse) return protocolResponse;

  try {
    const token = getBearerToken(req);
    const body = await readJsonBody(req);
    const result = await handleBeaconChat({
      body,
      token,
      requestId: id,
      serviceClient: createServiceClient(),
      authenticate: requireAuthenticatedActor,
      checkRegisteredSuperAdmin: isRegisteredSuperAdmin,
      providerFactory: () => createOpenAIResponsesProvider({
        apiKey: Deno.env.get("OPENAI_API_KEY"),
      }),
    });
    return jsonResponse(req, result);
  } catch (error) {
    return publicErrorResponse(req, error, id);
  }
});
