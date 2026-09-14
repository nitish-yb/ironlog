declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    IRONLOG_SYNC_KEY?: string;
  }
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
