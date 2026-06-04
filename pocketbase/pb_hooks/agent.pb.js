/// <reference path="../pb_data/types.d.ts" />

/**
 * Backend proxy for the in-app AI agent (ADR-0010).
 *
 * POST /api/factoria/agent
 *   body: an OpenAI Chat Completions request (model, messages, tools, …)
 *   auth: requires an authenticated user (closed signup — ADR-0002)
 *
 * The OpenAI API key lives only on the server. It is read from the
 * OPENAI_API_KEY process environment variable (Fly secret in production),
 * falling back to a local `pocketbase/.env` file for development convenience.
 * The client never sees it.
 *
 * NOTE: PocketBase runs each route handler in an isolated JSVM where top-level
 * helper functions are NOT in scope. Everything the handler needs is therefore
 * defined inside the handler.
 */
routerAdd(
  "POST",
  "/api/factoria/agent",
  (e) => {
    // --- config: process env first, then a local .env fallback -------------
    const readConfig = (key) => {
      const fromEnv = $os.getenv(key);
      if (fromEnv) return fromEnv;

      const candidates = [".env", "./pocketbase/.env"];
      try {
        if (typeof __hooks === "string") candidates.unshift(__hooks + "/../.env");
      } catch (_) {
        /* __hooks not defined in this PB version */
      }
      for (const p of candidates) {
        let raw = null;
        try {
          raw = toString($os.readFile(p));
        } catch (_) {
          continue;
        }
        if (!raw) continue;
        const lines = raw.split(/\r?\n/);
        for (const line of lines) {
          const m = line.match(/^\s*([^#=\s][^=]*)=(.*)$/);
          if (!m) continue;
          if (m[1].trim() !== key) continue;
          let v = m[2].trim();
          if (
            (v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))
          ) {
            v = v.slice(1, -1);
          }
          return v;
        }
      }
      return "";
    };

    const apiKey = readConfig("OPENAI_API_KEY");
    if (!apiKey) {
      return e.json(500, { error: "OPENAI_API_KEY is not configured." });
    }

    // --- forward to OpenAI -------------------------------------------------
    const body = e.requestInfo().body || {};
    if (!body.model) body.model = readConfig("OPENAI_MODEL") || "gpt-4o";

    const res = $http.send({
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeout: 120,
    });

    return e.json(res.statusCode, res.json);
  },
  $apis.requireAuth(),
);
