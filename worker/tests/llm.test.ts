import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveProvider,
  callWorkersAI,
  callCustomLLM,
  callLLM,
  type LLMProvider,
} from "../src/llm";
import { parseEventResponse } from "../src/anthropic";
import type { Env } from "../src/index";

describe("resolveProvider — provider resolution and fallback rules", () => {
  it("honors explicitProvider override above all else", () => {
    const req = new Request("https://test.local/api/advance?llm=cf", {
      headers: { "X-LLM-Provider": "rig" },
    });
    const env: Partial<Env> = { LLM_PROVIDER: "anthropic" };
    expect(resolveProvider(req, env, "workers-ai")).toBe("workers-ai");
  });

  it("extracts provider from X-LLM-Provider header", () => {
    const req1 = new Request("https://test.local/api/advance", {
      headers: { "X-LLM-Provider": "rig" },
    });
    expect(resolveProvider(req1, {})).toBe("custom");

    const req2 = new Request("https://test.local/api/advance", {
      headers: { "X-LLM-Provider": "cf" },
    });
    expect(resolveProvider(req2, {})).toBe("workers-ai");

    const req3 = new Request("https://test.local/api/advance", {
      headers: { "X-LLM-Provider": "anthropic" },
    });
    expect(resolveProvider(req3, {})).toBe("anthropic");
  });

  it("extracts provider from ?llm= query parameter", () => {
    const req1 = new Request("https://test.local/api/advance?llm=rig");
    expect(resolveProvider(req1, {})).toBe("custom");

    const req2 = new Request("https://test.local/api/advance?llm=cf");
    expect(resolveProvider(req2, {})).toBe("workers-ai");

    const req3 = new Request("https://test.local/api/advance?llm=anthropic");
    expect(resolveProvider(req3, {})).toBe("anthropic");
  });

  it("header takes precedence over query parameter", () => {
    const req = new Request("https://test.local/api/advance?llm=cf", {
      headers: { "X-LLM-Provider": "rig" },
    });
    expect(resolveProvider(req, {})).toBe("custom");
  });

  it("falls back to env.LLM_PROVIDER when request provides no override", () => {
    const req = new Request("https://test.local/api/advance");
    expect(resolveProvider(req, { LLM_PROVIDER: "custom" })).toBe("custom");
    expect(resolveProvider(req, { LLM_PROVIDER: "workers-ai" })).toBe("workers-ai");
  });

  it("preserves legacy anthropic in vitest envs where ANTHROPIC_API_KEY is present and AI is absent", () => {
    const req = new Request("https://test.local/api/advance");
    const testEnv: Partial<Env> = { ANTHROPIC_API_KEY: "test-anthropic-key" };
    expect(resolveProvider(req, testEnv)).toBe("anthropic");
  });

  it("prefers workers-ai when env.AI is bound", () => {
    const req = new Request("https://test.local/api/advance");
    const edgeEnv: Partial<Env> = {
      AI: { run: vi.fn() },
      ANTHROPIC_API_KEY: "test-anthropic-key",
    };
    expect(resolveProvider(req, edgeEnv)).toBe("workers-ai");
  });
});

describe("callWorkersAI — Cloudflare Workers AI edge integration", () => {
  it("throws when env.AI is missing or invalid", async () => {
    const env = {} as Env;
    await expect(callWorkersAI("sys", "user", env)).rejects.toThrow("Workers AI binding");
  });

  it("handles standard { response: string } return shape", async () => {
    const env: Env = {
      AI: {
        run: vi.fn(async () => ({ response: '{"title":"Storm"}' })),
      },
    } as any;

    const out = await callWorkersAI("sys", "user", env);
    expect(out).toBe('{"title":"Storm"}');
    expect(env.AI?.run).toHaveBeenCalledWith(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      expect.objectContaining({
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "user" },
        ],
      }),
    );
  });

  it("handles REST-style nested { result: { response: string } } shape", async () => {
    const env: Env = {
      AI: {
        run: vi.fn(async () => ({ result: { response: '{"title":"Fog"}' } })),
      },
    } as any;

    const out = await callWorkersAI("sys", "user", env);
    expect(out).toBe('{"title":"Fog"}');
  });

  it("rejects empty response string from Workers AI", async () => {
    const env: Env = {
      AI: {
        run: vi.fn(async () => ({ response: "   " })),
      },
    } as any;

    await expect(callWorkersAI("sys", "user", env)).rejects.toThrow("empty response");
  });

  it("extracts OpenAI chat-completion choices[0].message.content shape (Gemma 4)", async () => {
    const env: Env = {
      AI: {
        run: vi.fn(async () => ({
          choices: [{ message: { content: '{"title":"Prairie Squall"}' } }],
        })),
      },
    } as any;

    const out = await callWorkersAI("sys", "user", env);
    expect(out).toBe('{"title":"Prairie Squall"}');
  });

  it("passes response_format json_object when jsonMode is true and omits it when false", async () => {
    const run = vi.fn(async (_model: string, _inputs: Record<string, unknown>) => ({ response: '{"title":"Mud"}' }));
    const env: Env = { AI: { run } } as any;

    await callWorkersAI("sys", "user", env, { jsonMode: true });
    expect(run).toHaveBeenNthCalledWith(
      1,
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      expect.objectContaining({
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    );

    await callWorkersAI("sys", "user", env, { jsonMode: false });
    const secondPayload = run.mock.calls[1][1];
    expect(secondPayload).not.toHaveProperty("response_format");
    expect(secondPayload.max_tokens).toBe(1024);
  });

  it("retries once without response_format on non-timeout error when jsonMode is true", async () => {
    const run = vi.fn<(_model: string, _inputs: Record<string, unknown>) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("response_format unsupported"))
      .mockResolvedValueOnce({ response: '{"title":"Recovered"}' });
    const env: Env = { AI: { run } } as any;

    const out = await callWorkersAI("sys", "user", env, { jsonMode: true });
    expect(out).toBe('{"title":"Recovered"}');
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][1].response_format).toEqual({ type: "json_object" });
    expect(run.mock.calls[1][1]).not.toHaveProperty("response_format");
  });

  it("does NOT retry without response_format on timeout / AbortError", async () => {
    const run = vi.fn(() => new Promise(() => {})); // never resolves
    const env: Env = { AI: { run } } as any;

    await expect(callWorkersAI("sys", "user", env, { jsonMode: true, timeout: 25 })).rejects.toThrow(/timed out/i);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("callCustomLLM — OpenAI-compatible local rig / Ollama integration", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("formats chat/completions payload with JSON mode when requested", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"title":"Broken Axle"}' } }],
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mockFetch as any;

    const env: Env = {
      CUSTOM_LLM_URL: "http://100.92.26.19:11434/v1",
      CUSTOM_LLM_MODEL: "llama3.2:latest",
    } as any;

    const out = await callCustomLLM("sys", "user", env, { jsonMode: true });
    expect(out).toBe('{"title":"Broken Axle"}');

    expect(mockFetch).toHaveBeenCalledWith(
      "http://100.92.26.19:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining('"response_format":{"type":"json_object"}'),
      }),
    );
  });

  it("omits JSON mode for plain text calls like epitaphs or canary pings", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Here lies John." } }],
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mockFetch as any;

    const env: Env = {
      CUSTOM_LLM_URL: "http://100.92.26.19:11434/v1",
      CUSTOM_LLM_MODEL: "llama3.2:latest",
    } as any;

    const out = await callCustomLLM("sys", "user", env, { jsonMode: false });
    expect(out).toBe("Here lies John.");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://100.92.26.19:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.not.stringContaining('"response_format"'),
      }),
    );
  });

  it("attaches Authorization header when CUSTOM_LLM_API_KEY is configured", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"title":"Oasis"}' } }],
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mockFetch as any;

    const env: Env = {
      CUSTOM_LLM_URL: "https://llm.osi-cyber.com/v1",
      CUSTOM_LLM_API_KEY: "sk-test-master-key",
    } as any;

    await callCustomLLM("sys", "user", env);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://llm.osi-cyber.com/v1/chat/completions",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-test-master-key",
        },
      }),
    );
  });
});

describe("callLLM — failover ladder", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("falls back to workers-ai when custom rig fails", async () => {
    // Custom rig fetch fails (e.g. rig offline/timeout)
    const mockFetch = vi.fn(async () => {
      throw new Error("Connection refused");
    });
    globalThis.fetch = mockFetch as any;

    const env: Env = {
      CUSTOM_LLM_URL: "http://100.92.26.19:11434/v1",
      AI: {
        run: vi.fn(async () => ({ response: '{"title":"Fallback Weather"}' })),
      },
    } as any;

    const res = await callLLM("sys", "user", env, { provider: "custom" });
    expect(res.provider).toBe("workers-ai");
    expect(res.text).toBe('{"title":"Fallback Weather"}');
  });

  it("retries workers-ai once on failure before succeeding", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("transient edge 503"))
      .mockResolvedValueOnce({ response: '{"title":"Retry Worked"}' });
    const env: Env = { AI: { run } } as any;

    const res = await callLLM("sys", "user", env, { provider: "workers-ai" });
    expect(res.provider).toBe("workers-ai");
    expect(res.text).toBe('{"title":"Retry Worked"}');
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("parseEventResponse — hardening for open-weight models", () => {
  const validEvent = {
    title: "Buffalo Herd",
    description: "A large herd crosses the trail.",
    choices: [
      { label: "Wait for them to pass", consequences: { days: 1 } },
      { label: "Fire a warning shot", consequences: { ammo: -1 } },
    ],
    personality_effects: {},
    journal_entry: "A massive herd of buffalo halted our train.",
  };

  it("strips <think>...</think> reasoning blocks from thinking models", () => {
    const raw = `<think>
I need to write an event about a buffalo herd.
Format must be JSON.
</think>
${JSON.stringify(validEvent)}`;

    const parsed = parseEventResponse(raw);
    expect(parsed.title).toBe("Buffalo Herd");
    expect(parsed.choices).toHaveLength(2);
  });

  it("cleans trailing commas produced by LLM JSON generators", () => {
    const malformedJson = `{
      "title": "Buffalo Herd",
      "description": "A large herd crosses the trail.",
      "choices": [
        { "label": "Wait", "consequences": { "days": 1, }, },
      ],
      "personality_effects": {},
      "journal_entry": "Buffalos crossed today.",
    }`;

    const parsed = parseEventResponse(malformedJson);
    expect(parsed.title).toBe("Buffalo Herd");
    expect(parsed.choices[0].consequences.days).toBe(1);
  });

  it.each([
    {
      name: "maps supply aliases (parts/meds/clothes/hp) to canonical keys",
      raw: JSON.stringify({
        ...validEvent,
        choices: [
          {
            label: "Patch up",
            consequences: { parts: -1, meds: -2, clothes: -1, hp: 10 },
          },
        ],
      }),
      assert: (parsed: ReturnType<typeof parseEventResponse>) => {
        expect(parsed.choices[0].consequences).toEqual({
          spare_parts: -1,
          medicine: -2,
          clothing: -1,
          health: 10,
        });
      },
    },
    {
      name: "strips unknown consequence keys and null/undefined values",
      raw: JSON.stringify({
        ...validEvent,
        choices: [
          {
            label: "Press on",
            consequences: { food: -10, water: -5, luck: 3, ammo: null },
          },
        ],
      }),
      assert: (parsed: ReturnType<typeof parseEventResponse>) => {
        expect(parsed.choices[0].consequences).toEqual({ food: -10 });
      },
    },
    {
      name: "coerces finite numeric strings like '-10' and '+15'",
      raw: JSON.stringify({
        ...validEvent,
        choices: [
          {
            label: "Trade",
            consequences: { food: "-10", morale: "+15", money: "250" },
          },
        ],
      }),
      assert: (parsed: ReturnType<typeof parseEventResponse>) => {
        expect(parsed.choices[0].consequences).toEqual({
          food: -10,
          morale: 15,
          money: 250,
        });
      },
    },
    {
      name: "defaults missing/null personality_effects, ignores non-object entries, strips unknown sub-keys, coerces strings",
      raw: JSON.stringify({
        title: "Campfire Dispute",
        description: "Tempers flare by the embers.",
        choices: [{ label: "Mediate", consequences: { morale: 5 } }],
        personality_effects: {
          Ezra: { morale: "+5", sanity: "-10", health: -20 },
          Martha: null,
          Thomas: 5,
        },
        journal_entry: "Settled a dispute at camp.",
      }),
      assert: (parsed: ReturnType<typeof parseEventResponse>) => {
        expect(parsed.personality_effects).toEqual({
          Ezra: { morale: 5, sanity: -10 },
        });
      },
    },
    {
      name: "defaults missing personality_effects and missing choice consequences to {}, and slices >4 choices to 4",
      raw: JSON.stringify({
        title: "Quiet Noon",
        description: "The prairie stretches out without incident. Everyone catches their breath.",
        choices: [
          { label: "Continue" },
          { label: "Rest", consequences: null },
          { label: "Scout", consequences: { miles: 5 } },
          { label: "Repair", consequences: { spare_parts: -1 } },
          { label: "Extra fifth choice", consequences: { food: -5 } },
        ],
      }),
      assert: (parsed: ReturnType<typeof parseEventResponse>) => {
        expect(parsed.personality_effects).toEqual({});
        expect(parsed.choices).toHaveLength(4);
        expect(parsed.choices[0].consequences).toEqual({});
        expect(parsed.choices[1].consequences).toEqual({});
        expect(parsed.journal_entry).toBe("The prairie stretches out without incident.");
      },
    },
    {
      name: "extracts fenced JSON block directly amidst prose with braces and strips <thought> + unclosed <think>",
      raw: `<thought>Drafting event {internal: true}</thought>
Here is the event {note: 1848}:
\`\`\`json
${JSON.stringify({ ...validEvent, journal_entry: undefined, journal: "Herds blocked the road." })}
\`\`\`
Hope this helps {done}! <think>trailing unclosed reasoning`,
      assert: (parsed: ReturnType<typeof parseEventResponse>) => {
        expect(parsed.title).toBe("Buffalo Herd");
        expect(parsed.journal_entry).toBe("Herds blocked the road.");
      },
    },
    {
      name: "isolates bad delayed_effects fuses instead of rejecting the whole event",
      raw: JSON.stringify({
        ...validEvent,
        choices: [
          {
            label: "Drink creek water",
            consequences: { days: 1 },
            delayed_effects: [
              { days_remaining: 2, consequences: { health: "not-a-number" } },
              { days_remaining: 3, consequences: { bogus_key: -5 } },
              { days_remaining: "4", consequences: { hp: "-15" }, journal_entry: "Fever struck." },
            ],
          },
        ],
      }),
      assert: (parsed: ReturnType<typeof parseEventResponse>) => {
        expect(parsed.choices[0].delayed_effects).toEqual([
          {
            days_remaining: 4,
            consequences: { health: -15 },
            target: "all",
            journal_entry: "Fever struck.",
          },
        ]);
      },
    },
  ])("$name", ({ raw, assert }) => {
    const parsed = parseEventResponse(raw);
    assert(parsed);
  });
});
