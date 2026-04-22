// Frontend test harness for Oregon Trail AI.
//
// Serves the real `public/` directory over a local HTTP server and drives
// the Kaplay game in a Playwright chromium context. Scenes render exactly
// as they would in production — no build step, no jsdom, no kaplay mock.

import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import handler from "serve-handler";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page, type Browser } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, "../../public");

export type EngineSeed = {
  profession?: "farmer" | "carpenter" | "banker";
  leaderName?: string;
  memberNames?: string[];
  supplies?: Partial<{
    food: number;
    ammo: number;
    clothing: number;
    spare_parts: number;
    medicine: number;
    money: number;
    oxen: number;
  }>;
  tone?: "low" | "medium" | "high";
  signedStateOverrides?: Record<string, unknown>;
  localStorage?: Record<string, string>;
};

export type SceneStats = {
  total: number;
  pageErrors: string[];
  kaplayErrors: string[];
  overlayActive: boolean;
  overlayText: string;
};

export type Harness = {
  page: Page;
  url: string;
  waitForReady: () => Promise<void>;
  seedEngine: (seed: EngineSeed) => Promise<void>;
  goScene: (name: string, data?: unknown) => Promise<void>;
  readStats: () => Promise<SceneStats>;
  screenshot: (outPath: string) => Promise<void>;
  stop: () => Promise<void>;
};

export async function startHarness(): Promise<Harness> {
  // 1. Server — inline like the working debug test. No fancy wrappers.
  const server: Server = createServer((req, res) => {
    handler(req, res, { public: PUBLIC_DIR } as never);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;

  // 2. Browser — fresh per harness. No caching (caused hangs in vitest).
  const browser: Browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 3. Error capture via Node-side listeners (page.on). Page-side
  //    window.onerror doesn't catch kaplay's styled-text throws because
  //    kaplay wraps in try/catch; console.error is how we see them.
  const pageErrors: string[] = [];
  const kaplayErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (
      t.includes("Styled text") ||
      t.includes("unclosed tags") ||
      t.includes("TypeError") ||
      t.includes("is not a function") ||
      t.includes("Cannot read")
    ) {
      kaplayErrors.push(t);
    }
  });

  // 4. Navigate — query string just cache-busts. DO NOT use viewport:
  //    option on newPage, it changed behavior under vitest's pool config.
  await page.goto(`${url}/?test=1`, { waitUntil: "domcontentloaded" });

  const waitForReady = async () => {
    await page.waitForFunction(() => !!window.k && !!window.engine, { timeout: 15000 });
    await page.waitForTimeout(300);
  };

  const seedEngine = async (seed: EngineSeed) => {
    await page.evaluate((s) => {
      const e = window.engine as Record<string, unknown> & {
        signedState: unknown;
        profession: string | null;
        leaderName: string | null;
        memberNames: string[] | null;
      };
      if (s.profession) e.profession = s.profession;
      if (s.leaderName) e.leaderName = s.leaderName;
      if (s.memberNames) e.memberNames = s.memberNames;
      const defaultState = {
        party: {
          leader_name: s.leaderName || "Ryan",
          members: (s.memberNames || ["Beth", "Carl", "Dana", "Earl"]).map((n) => ({
            name: n, health: 100, alive: true, sanity: 90, morale: 80, disease: null,
          })),
        },
        supplies: {
          food: 180, ammo: 80, clothing: 3, spare_parts: 2, medicine: 2,
          money: 40000, oxen: 6,
          ...(s.supplies || {}),
        },
        position: { current_segment_id: "seg_01", miles_traveled: 100, date: "1848-05-01" },
        settings: {
          pace: "steady", rations: "filling",
          tone_tier: s.tone || "medium", challenge_id: null,
        },
        journal: [],
        deaths: [],
        simulation: {
          starvation_days: 0, days_since_last_event: 0,
          resolved_crossings: [], visited_landmarks: [],
          pending_event_hash: null, pending_event_trigger: null,
          landmark_rest_used: [], bitter_path_taken: "none",
        },
        meta: { run_id: "test-run", event_count: 0 },
        ...(s.signedStateOverrides || {}),
      };
      e.signedState = { state: defaultState, signature: "test-signature" };
      if (s.localStorage) {
        for (const [k, v] of Object.entries(s.localStorage)) {
          try { localStorage.setItem(k, v); } catch (_) {}
        }
      }
    }, seed as unknown as Record<string, unknown>);
  };

  const goScene = async (name: string, data?: unknown) => {
    await page.evaluate(
      ([n, d]) => {
        (window as unknown as { k: { go: (n: string, d?: unknown) => void } }).k.go(n as string, d);
      },
      [name, data ?? null] as [string, unknown],
    );
    await page.waitForTimeout(500);
  };

  const readStats = async (): Promise<SceneStats> => {
    const pageSide = await page.evaluate(() => {
      const k = window.k as unknown as { get: (tag?: string) => unknown[] };
      const all = k.get ? k.get() : [];
      const overlay = document.getElementById("html-overlay");
      const content = overlay?.querySelector(".overlay-content");
      return {
        total: all.length,
        overlayActive: !!overlay?.classList.contains("active"),
        overlayText: (content?.textContent || "").trim(),
      };
    });
    const pe = pageErrors.splice(0);
    const ke = kaplayErrors.splice(0);
    return { ...pageSide, pageErrors: pe, kaplayErrors: ke };
  };

  const screenshot = async (outPath: string) => { await page.screenshot({ path: outPath }); };

  const stop = async () => {
    try { await page.close(); } catch (_) {}
    try { await browser.close(); } catch (_) {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { page, url, waitForReady, seedEngine, goScene, readStats, screenshot, stop };
}
