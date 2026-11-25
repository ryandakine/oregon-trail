import type { Env } from "./index";
import { callAnthropic } from "./anthropic";

export type LLMProvider = "workers-ai" | "custom" | "anthropic";

export interface LLMOptions {
  maxTokens?: number;
  timeout?: number;
  provider?: LLMProvider;
  temperature?: number;
  jsonMode?: boolean;
}

export interface LLMResult {
  text: string;
  provider: LLMProvider;
}

const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_CUSTOM_MODEL = "llama3.2:latest";
const TIMEOUT_CUSTOM_MS = 6000;
const TIMEOUT_WORKERS_AI_MS = 10000;

/**
 * Resolve which LLM provider should serve the request.
 * Priority:
 * 1. Explicit override passed in options
 * 2. Request header: X-LLM-Provider
 * 3. Request URL query param: ?llm=rig|cf|workers-ai|anthropic
 * 4. Configured env.LLM_PROVIDER
 * 5. Environment heuristics:
 *    - env.AI present -> "workers-ai"
 *    - env.ANTHROPIC_API_KEY present (and env.AI absent) -> "anthropic" (preserves unit test mocks)
 *    - env.CUSTOM_LLM_URL present -> "custom"
 *    - Default -> "workers-ai"
 */
export function resolveProvider(
  request?: Request,
  env?: Partial<Env>,
  explicitProvider?: LLMProvider,
): LLMProvider {
  if (explicitProvider) {
    return explicitProvider;
  }

  // 1. Request header: X-LLM-Provider
  if (request) {
    const header = request.headers.get("x-llm-provider")?.trim().toLowerCase();
    if (header) {
      if (header === "rig" || header === "custom" || header === "ollama" || header === "litellm") {
        return "custom";
      }
      if (header === "cf" || header === "workers-ai" || header === "workers_ai") {
        return "workers-ai";
      }
      if (header === "anthropic" || header === "claude") {
        return "anthropic";
      }
    }

    // 2. Request URL query param: ?llm=rig|cf|workers-ai|anthropic
    try {
      const url = new URL(request.url);
      const query = url.searchParams.get("llm")?.trim().toLowerCase();
      if (query) {
        if (query === "rig" || query === "custom" || query === "ollama" || query === "litellm") {
          return "custom";
        }
        if (query === "cf" || query === "workers-ai" || query === "workers_ai") {
          return "workers-ai";
        }
        if (query === "anthropic" || query === "claude") {
          return "anthropic";
        }
      }
    } catch {
      // Ignore URL parse errors on synthetic/mock requests
    }
  }

  // 3. Environment variable
  if (env?.LLM_PROVIDER) {
    const envProv = env.LLM_PROVIDER.trim().toLowerCase();
    if (envProv === "custom" || envProv === "rig" || envProv === "ollama") return "custom";
    if (envProv === "workers-ai" || envProv === "cf" || envProv === "workers_ai") return "workers-ai";
    if (envProv === "anthropic" || envProv === "claude") return "anthropic";
  }

  // 4. Backward-compatibility / Environment heuristics
  if (env?.AI && typeof env.AI.run === "function") {
    return "workers-ai";
  }

  if (env?.ANTHROPIC_API_KEY && !env?.AI) {
    return "anthropic";
  }

  if (env?.CUSTOM_LLM_URL) {
    return "custom";
  }

  return "workers-ai";
}

/**
 * Call Cloudflare Workers AI edge model.
 */
export async function callWorkersAI(
  system: string,
  user: string,
  env: Env,
  opts?: LLMOptions,
): Promise<string> {
  if (!env.AI || typeof env.AI.run !== "function") {
    throw new Error("Workers AI binding (env.AI) is not available");
  }

  const model = env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL;
  const maxTokens = opts?.maxTokens ?? 800;
  const timeoutMs = opts?.timeout ?? TIMEOUT_WORKERS_AI_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const runPromise = env.AI.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature: opts?.temperature ?? 0.2,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => {
        reject(new Error(`Workers AI call timed out after ${timeoutMs}ms`));
      });
    });

    const res = await Promise.race([runPromise, timeoutPromise]);

    let text = "";
    if (typeof res === "string") {
      text = res;
    } else if (typeof (res as any)?.response === "string") {
      text = (res as any).response;
    } else if (typeof (res as any)?.result?.response === "string") {
      text = (res as any).result.response;
    } else if ((res as any)?.response && typeof (res as any).response === "object") {
      text = JSON.stringify((res as any).response);
    } else {
      throw new Error(`Workers AI returned unexpected shape: ${JSON.stringify(res).slice(0, 100)}`);
    }

    if (!text.trim()) {
      throw new Error("Workers AI returned empty response");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call custom OpenAI-compatible endpoint (Ollama / LiteLLM on rig rog).
 */
export async function callCustomLLM(
  system: string,
  user: string,
  env: Env,
  opts?: LLMOptions,
): Promise<string> {
  const baseUrl = env.CUSTOM_LLM_URL || "https://llm.osi-cyber.com/v1";
  const url = `${baseUrl.replace(/\/+$/, "")}${baseUrl.includes("/chat/completions") ? "" : "/chat/completions"}`;
  const model = env.CUSTOM_LLM_MODEL || DEFAULT_CUSTOM_MODEL;
  const maxTokens = opts?.maxTokens ?? 800;
  const timeoutMs = opts?.timeout ?? TIMEOUT_CUSTOM_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.CUSTOM_LLM_API_KEY) {
    headers["Authorization"] = `Bearer ${env.CUSTOM_LLM_API_KEY}`;
  }

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    temperature: opts?.temperature ?? 0.2,
  };
  if (opts?.jsonMode) {
    payload.response_format = { type: "json_object" };
    payload.format = "json"; // Ollama format flag
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Custom LLM API ${response.status}: ${errBody.slice(0, 120)}`);
    }

    const data = (await response.json()) as any;
    const text =
      data?.choices?.[0]?.message?.content ??
      data?.response ??
      data?.message?.content;

    if (typeof text !== "string" || !text.trim()) {
      throw new Error(`Custom LLM empty response: ${JSON.stringify(data).slice(0, 100)}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Unified LLM dispatch with automatic failover ladder:
 * Custom (rig) -> Workers AI (edge) -> Anthropic (if configured as primary) -> throws to handler fallback.
 */
export async function callLLM(
  system: string,
  user: string,
  env: Env,
  opts?: LLMOptions,
): Promise<LLMResult> {
  const provider = opts?.provider ?? resolveProvider(undefined, env);

  if (provider === "custom") {
    try {
      const text = await callCustomLLM(system, user, env, opts);
      return { text, provider: "custom" };
    } catch (err) {
      console.warn("custom_llm_failed_falling_back", JSON.stringify({
        msg: String(err).slice(0, 120),
      }));
      // Fall back to Workers AI if available
      if (env.AI && typeof env.AI.run === "function") {
        try {
          const text = await callWorkersAI(system, user, env, opts);
          return { text, provider: "workers-ai" };
        } catch (cfErr) {
          console.warn("workers_ai_fallback_failed", JSON.stringify({
            msg: String(cfErr).slice(0, 120),
          }));
        }
      }
      throw err;
    }
  }

  if (provider === "workers-ai") {
    const text = await callWorkersAI(system, user, env, opts);
    return { text, provider: "workers-ai" };
  }

  // Anthropic fallback / legacy
  const text = await callAnthropic(system, user, env.ANTHROPIC_API_KEY, {
    maxTokens: opts?.maxTokens,
    timeout: opts?.timeout,
  });
  return { text, provider: "anthropic" };
}
