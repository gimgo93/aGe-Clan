import handler from "vinext/server/fetch-handler";
import { realtimeSocket } from "../lib/realtime-router.js";
import { pvpGateway } from "../lib/pvp-gateway.js";
import { recordRequestAggregate } from "../lib/analytics-store.js";
export { ClanRoom } from "../lib/clan-room.js";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const started=performance.now(),path=new URL(request.url).pathname;
    // Clone before any route consumes the stream; the aggregate only inspects
    // a small allowlisted operation name after the response has been produced.
    const requestForAnalytics=request.clone();
    let response:Response|undefined;
    if (['/api/clan','/api/clan/socket','/api/clan/account'].includes(path)||(path==='/api/clan/analytics'&&request.method==='GET')) {
      const external = await pvpGateway(request, env, fetch, ctx);
      if (external) response=external;
    }
    if (!response&&path === '/api/clan/socket') response=realtimeSocket(request, env);
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    if(!response)response=await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    ctx.waitUntil(recordRequestAggregate(env.DB,requestForAnalytics,response.status,performance.now()-started));
    return response;
  },
};
