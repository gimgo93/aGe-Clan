declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CLAN_ROOMS?: DurableObjectNamespace;
    CLAN_BACKEND_URL?: string;
    CLAN_BACKEND_TOKEN?: string;
    BUCKET?: R2Bucket;
  }
}
