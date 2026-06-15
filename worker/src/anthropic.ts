import type { EventResponse, ToneTier, EventChoice, PendingEffectSpec } from "./types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

const ALLOWED_CONSEQUENCE_KEYS = new Set([
  "health", "food", "ammo", "clothing", "spare_parts",
  "medicine", "money", "oxen", "morale", "miles", "days",
]);

// Delayed-effect (fuse) mint-time bounds. See docs/design/consequences-pillar.md §2.4.
export const MAX_DELAYED_PER_CHOICE = 3; // count cap per choice (excess truncated)
export const DELAY_MIN_DAYS = 1;         // floor — never fire same-day / double-apply
export const DELAY_MAX_DAYS = 14;        // ceiling — off-screen beyond a ~15-event run

// Retry config: fast-fail ladder. The interactive /advance path must serve an
// instant fallback rather than stall the player, so we cap total latency hard:
// 1 retry only (2 attempts), with shrinking timeouts. Worst case is now
// ~4s + ~1s delay + ~2s ≈ 7s (was ~17s with 3 attempts). The hand-written
// fallback events sit ready behind a failed/timed-out call.
const RETRY_STATUS_CODES = new Set([429, 529]);
const RETRY_TIMEOUTS = [4000, 2000]; // 1st attempt, 1st (and only) retry
const RETRY_DELAYS = [1000]; // delay before the single retry

export async function callAnthropic(
  system: string,
  user: string,
  apiKey: string,
  opts?: { maxTokens?: number; timeout?: number },
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 800;
  const baseTimeout = opts?.timeout ?? RETRY_TIMEOUTS[0];
  const maxAttempts = RETRY_TIMEOUTS.length;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const timeout = attempt === 0 ? baseTimeout : RETRY_TIMEOUTS[attempt];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as {
          content: Array<{ type: string; text: string }>;
        };
        return data.content[0].text;
      }

      const status = response.status;
      const body = await response.text().catch(() => "");
      lastError = new Error(`Anthropic API ${status}: ${body}`);

      // Only retry on 429 (rate limit) or 529 (overloaded)
      if (!RETRY_STATUS_CODES.has(status) || attempt >= maxAttempts - 1) {
        throw lastError;
      }

      // Honor Retry-After header if present
      const retryAfter = response.headers.get("retry-after");
      const delayMs = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 5000)
        : RETRY_DELAYS[attempt];
      await new Promise((r) => setTimeout(r, delayMs || RETRY_DELAYS[attempt]));
    } catch (err) {
      if (err === lastError) throw err; // re-throw non-retryable
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= maxAttempts - 1) throw lastError;
      // Timeout/network errors: retry
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("callAnthropic: unexpected retry exhaustion");
}

// Validate + clamp a consequence delta IN PLACE: keys must be allowed, values
// finite, magnitudes capped at ±10000. Shared by immediate choice consequences
// and delayed-effect fuses so both honor one rule set. Throws on malformed input
// (rejecting the event → a fallback fires).
function validateConsequenceDelta(c: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(c)) {
    if (!ALLOWED_CONSEQUENCE_KEYS.has(key)) {
      throw new Error(`invalid consequence key: ${key}`);
    }
    if (typeof val !== "number" || !Number.isFinite(val)) {
      throw new Error(`consequence ${key} must be a finite number, got ${typeof val}`);
    }
    if (Math.abs(val) > 10000) {
      (c as Record<string, number>)[key] = Math.sign(val) * 10000;
    }
  }
}

// Mint-time guard for LLM/fallback delayed effects: bound count + timing, run the
// shared consequence validation, strip miles/days (drainPendingEffects ignores
// them — stripping stops a "paid-for" fuse from silently no-opping), and normalize
// target. Returns a clean PendingEffectSpec[] or undefined if none survive. Throws
// only via validateConsequenceDelta on a malformed delta, matching the immediate
// path. See docs/design/consequences-pillar.md §2.4.
export function sanitizeDelayedEffects(raw: unknown): PendingEffectSpec[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PendingEffectSpec[] = [];
  for (const item of raw) {
    if (out.length >= MAX_DELAYED_PER_CHOICE) break; // cap on VALID output, not raw slots
    if (typeof item !== "object" || item === null) continue;
    const spec = item as Record<string, unknown>;
    if (typeof spec.consequences !== "object" || spec.consequences === null) continue;
    const consequences = spec.consequences as Record<string, unknown>;
    validateConsequenceDelta(consequences);
    delete consequences.miles; // drain ignores miles/days — strip, don't reject
    delete consequences.days;
    if (Object.keys(consequences).length === 0) continue; // miles/days-only → empty no-op, drop
    const rawDays = spec.days_remaining;
    let days = typeof rawDays === "number" && Number.isFinite(rawDays) ? Math.round(rawDays) : 3;
    days = Math.max(DELAY_MIN_DAYS, Math.min(DELAY_MAX_DAYS, days));
    const target: "actor" | "all" = spec.target === "actor" ? "actor" : "all";
    const clean: PendingEffectSpec = {
      days_remaining: days,
      consequences: consequences as EventChoice["consequences"],
      target,
    };
    if (typeof spec.journal_entry === "string" && spec.journal_entry.length > 0) {
      clean.journal_entry = spec.journal_entry;
    }
    out.push(clean);
  }
  return out.length > 0 ? out : undefined;
}

export function parseEventResponse(raw: string): EventResponse {
  // Strip markdown fences if present
  let stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();

  // If model added text before/after JSON, extract the JSON object
  if (!stripped.startsWith("{")) {
    const firstBrace = stripped.indexOf("{");
    if (firstBrace >= 0) stripped = stripped.slice(firstBrace);
  }
  if (!stripped.endsWith("}")) {
    const lastBrace = stripped.lastIndexOf("}");
    if (lastBrace >= 0) stripped = stripped.slice(0, lastBrace + 1);
  }

  const parsed = JSON.parse(stripped);

  // Validate top-level shape
  if (typeof parsed.title !== "string") throw new Error("missing/invalid title");
  if (typeof parsed.description !== "string") throw new Error("missing/invalid description");
  if (typeof parsed.journal_entry !== "string") throw new Error("missing/invalid journal_entry");

  // Validate choices: array of 1-4
  if (!Array.isArray(parsed.choices) || parsed.choices.length < 1 || parsed.choices.length > 4) {
    throw new Error("choices must be array of 1-4 items");
  }
  for (const choice of parsed.choices) {
    if (typeof choice.label !== "string") throw new Error("choice missing label");
    if (typeof choice.consequences !== "object" || choice.consequences === null) {
      throw new Error("choice missing consequences object");
    }
    validateConsequenceDelta(choice.consequences as Record<string, unknown>);
    // Mint delayed effects (fuses) here — the single point where server-issued
    // event content is created. The event-hash binding carries the sanitized
    // result through to handleChoice, so no re-validation is needed there.
    if (choice.delayed_effects !== undefined) {
      const fuses = sanitizeDelayedEffects(choice.delayed_effects);
      if (fuses) choice.delayed_effects = fuses;
      else delete choice.delayed_effects;
    }
  }

  // Validate personality_effects: Record<string, { sanity?: number; morale?: number }>
  if (typeof parsed.personality_effects !== "object" || parsed.personality_effects === null) {
    throw new Error("missing/invalid personality_effects");
  }
  for (const [, effects] of Object.entries(parsed.personality_effects)) {
    const eff = effects as Record<string, unknown>;
    for (const [k, v] of Object.entries(eff)) {
      if (k !== "sanity" && k !== "morale") throw new Error(`invalid personality key: ${k}`);
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`personality ${k} must be number`);
      if (Math.abs(v as number) > 100) (eff as Record<string, number>)[k] = Math.sign(v as number) * 100;
    }
  }

  return parsed as EventResponse;
}

export const FALLBACK_EVENTS: Record<ToneTier, EventResponse[]> = {
  low: [
    {
      title: "Broken Wheel",
      description: "One of the wagon wheels hits a deep rut and cracks. The party must decide whether to stop and repair it or press on carefully.",
      choices: [
        { label: "Stop and repair with spare parts", consequences: { spare_parts: -1, days: 1 } },
        { label: "Press on slowly", consequences: { miles: -5, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "A wheel cracked on a bad rut today. We lost time dealing with it.",
    },
    {
      title: "Good Hunting",
      description: "A herd of antelope grazes near the trail. There is enough game here to replenish supplies if the party stops to hunt.",
      choices: [
        { label: "Spend the day hunting", consequences: { food: 40, ammo: -10, days: 1 } },
        { label: "Keep moving", consequences: { miles: 12 } },
      ],
      personality_effects: {},
      journal_entry: "We spotted antelope near the trail today.",
    },
    {
      title: "Friendly Travelers",
      description: "Another wagon train headed east shares news of the trail ahead. They offer to trade supplies at fair prices.",
      choices: [
        { label: "Trade food for medicine", consequences: { food: -20, medicine: 2 } },
        { label: "Trade ammo for food", consequences: { ammo: -15, food: 30 } },
        { label: "Thank them and move on", consequences: { morale: 5 } },
      ],
      personality_effects: {},
      journal_entry: "Met eastbound travelers who shared news of the road ahead.",
    },
    {
      title: "Heavy Rain",
      description: "A steady rain falls all day, turning the trail to mud. Progress slows and everyone is soaked through.",
      choices: [
        { label: "Make camp and wait it out", consequences: { days: 1, morale: -5 } },
        { label: "Push through the mud", consequences: { health: -5, miles: -4 }, delayed_effects: [{ days_remaining: 2, consequences: { health: -5, morale: -3 }, target: "all", journal_entry: "The soaking left the party with chills that lingered for days." }] },
      ],
      personality_effects: {},
      journal_entry: "Rain turned the trail to deep mud. Miserable going.",
    },
    {
      title: "Lost Ox",
      description: "One of the oxen wandered off during the night. The party can search for it or continue without.",
      choices: [
        { label: "Search for the ox", consequences: { days: 1 } },
        { label: "Continue without it", consequences: { oxen: -1, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "An ox strayed in the night. A setback for the company.",
    },
    {
      title: "River Ford Decision",
      description: "A shallow creek crosses the trail. The water looks calm, but the bank is steep and muddy on the far side.",
      choices: [
        { label: "Ford carefully", consequences: { days: 1, morale: 5 } },
        { label: "Rush across to save time", consequences: { health: -5, miles: 8 } },
      ],
      personality_effects: {},
      journal_entry: "Crossed a creek today. The far bank was a struggle.",
    },
    {
      title: "Wild Berries",
      description: "The children find a thicket of ripe berries near the camp. There is enough to gather a good amount, if the party spends the time.",
      choices: [
        { label: "Spend the morning gathering", consequences: { food: 15, morale: 5, days: 1 } },
        { label: "Take a handful and move on", consequences: { food: 3, miles: 10 } },
      ],
      personality_effects: {},
      journal_entry: "The children found berries. A small sweetness on a hard road.",
    },
    {
      title: "Trail Fork",
      description: "The trail splits. One branch is the well-worn main route; the other is a shortcut that other parties have warned can be rough.",
      choices: [
        { label: "Take the known route", consequences: { miles: 10 } },
        { label: "Try the shortcut", consequences: { miles: 18, health: -5, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "Came to a fork in the trail and had to choose our road.",
    },
    {
      title: "Worn Boots",
      description: "Several of the party's boots have worn through at the sole. Bare feet on this ground will slow everyone down.",
      choices: [
        { label: "Repair them with spare cloth", consequences: { clothing: -1, days: 1 } },
        { label: "Press on barefoot", consequences: { health: -5, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "Our boots are failing us. The trail is hard on leather and feet alike.",
    },
    {
      title: "Helpful Guide",
      description: "A friendly trapper offers to point out the best water and grazing for the next stretch, for a small fee.",
      choices: [
        { label: "Pay him for the advice", consequences: { money: -200, morale: 5, miles: 6 } },
        { label: "Decline and find your own way", consequences: { morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "A trapper offered to guide us a ways. Good company on the road.",
    },
    {
      title: "Clear Skies",
      description: "After days of grey weather, the sky opens bright and the trail is firm underfoot. Spirits lift across the company.",
      choices: [
        { label: "Make the most of the good weather", consequences: { miles: 14, morale: 10 } },
        { label: "Rest while conditions are good", consequences: { days: 1, health: 5, morale: 5 } },
      ],
      personality_effects: {},
      journal_entry: "A fine clear day. We made good time and laughed for the first time in a while.",
    },
    {
      title: "Prairie Schooner Repair",
      description: "The wagon cover has torn loose in the wind and supplies are exposed to the weather. A morning's work with needle and thread would set it right.",
      choices: [
        { label: "Patch the cover properly", consequences: { days: 1, morale: 5 } },
        { label: "Lash it down and keep rolling", consequences: { food: -10, miles: 10 } },
      ],
      personality_effects: {},
      journal_entry: "The wind tore at our wagon cover. We mended it as best we could.",
    },
  ],

  medium: [
    {
      title: "Tainted Water",
      description: "The only water source for miles has a faint alkali sheen. The oxen are desperate to drink. The party must choose between thirst and poison.",
      choices: [
        { label: "Let the animals drink", consequences: { oxen: -1, health: -5 }, delayed_effects: [{ days_remaining: 3, consequences: { health: -10, morale: -5 }, target: "all", journal_entry: "The alkali water has caught up with the party — cramps and fever in the night." }] },
        { label: "Ration the canteens and press on", consequences: { health: -10, morale: -10, miles: 8 } },
        { label: "Dig for cleaner water nearby", consequences: { days: 1, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "Found nothing but alkali water. No good choices to be had.",
    },
    {
      title: "Abandoned Wagon",
      description: "A wagon sits abandoned beside the trail, its contents scattered. Some supplies remain, but so does a crude warning scratched into the wood.",
      choices: [
        { label: "Scavenge what you can", consequences: { food: 15, spare_parts: 1, morale: -5 } },
        { label: "Leave it alone", consequences: { morale: 5 } },
      ],
      personality_effects: {},
      journal_entry: "Passed an abandoned wagon. Someone's journey ended here.",
    },
    {
      title: "Stampede",
      description: "Thunder startles the oxen and they bolt. The party scrambles to regain control before the wagon overturns.",
      choices: [
        { label: "Chase them down on foot", consequences: { health: -10, days: 1 } },
        { label: "Fire a warning shot", consequences: { ammo: -5, morale: -10 } },
        { label: "Let them run and hope for the best", consequences: { oxen: -1, miles: -8 } },
      ],
      personality_effects: {},
      journal_entry: "The oxen stampeded. A desperate hour before we had them back.",
    },
    {
      title: "Grave Marker",
      description: "A fresh grave beside the trail bears a name and a date just days old. Cholera, most likely. The party falls silent.",
      choices: [
        { label: "Stop and pay respects", consequences: { morale: 5, days: 1 } },
        { label: "Move on quickly", consequences: { morale: -10 } },
      ],
      personality_effects: {},
      journal_entry: "Passed a fresh grave today. A reminder of what the trail takes.",
    },
    {
      title: "Broken Axle",
      description: "The rear axle snaps descending a hill. Without repair, the wagon cannot move.",
      choices: [
        { label: "Use spare parts to fashion a new axle", consequences: { spare_parts: -2, days: 2 } },
        { label: "Lighten the load and drag the wagon", consequences: { food: -30, clothing: -1, morale: -15 } },
      ],
      personality_effects: {},
      journal_entry: "Axle broke on a descent. Had to make hard choices about what to keep.",
    },
    {
      title: "The Beggar Family",
      description: "A family sits beside the trail, their wagon long broken, their food gone. They ask for whatever can be spared. There is not enough for everyone.",
      choices: [
        { label: "Share what little you have", consequences: { food: -40, morale: 10 } },
        { label: "Give them nothing and ride on", consequences: { morale: -15 } },
        { label: "Offer them a place if they can keep pace", consequences: { food: -20, days: 1 } },
      ],
      personality_effects: {},
      journal_entry: "We passed a family with nothing. What we did or did not do will sit with us.",
    },
    {
      title: "Theft in the Night",
      description: "Morning reveals that someone slipped into camp and made off with supplies. Tracks lead toward another train ahead on the trail.",
      choices: [
        { label: "Confront the train ahead", consequences: { days: 1, morale: -10 } },
        { label: "Swallow the loss and move on", consequences: { food: -25, ammo: -10, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "Someone robbed us in the dark. The trail breeds desperation in all of us.",
    },
    {
      title: "Fork in the Weather",
      description: "Storm clouds gather to the west. Pressing on means risking a soaking and worse; stopping means losing a day you may not have.",
      choices: [
        { label: "Race ahead of the storm", consequences: { miles: 16, health: -10 } },
        { label: "Make camp and wait it out", consequences: { days: 1, food: -10, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "A storm chased us across the plain. We gambled against the sky.",
    },
    {
      title: "Snakebite",
      description: "A rattlesnake strikes one of the party as they gather firewood. The wound is already swelling. There is an old remedy, but no certainty.",
      choices: [
        { label: "Cut and draw the poison", consequences: { health: -10, days: 1 } },
        { label: "Dose with medicine and pray", consequences: { medicine: -2, morale: -5 } },
        { label: "Press on and hope it passes", consequences: { health: -20, miles: 8 } },
      ],
      personality_effects: {},
      journal_entry: "A snake found one of us by the woodpile. We did what we could.",
    },
    {
      title: "The Quarrel Over Rations",
      description: "Hunger has frayed tempers. Two members come to blows over how the food is divided. The whole company watches to see how it is settled.",
      choices: [
        { label: "Cut everyone's share equally", consequences: { food: -10, morale: -10 } },
        { label: "Side with the strongest workers", consequences: { morale: -15 } },
      ],
      personality_effects: {},
      journal_entry: "We fought over the food today. There is never enough, and it shows in our faces.",
    },
    {
      title: "Mired Wagon",
      description: "The wagon sinks to its axles in a soft bottom. Every hour spent here is an hour the oxen strain and the food dwindles.",
      choices: [
        { label: "Unload and dig it free", consequences: { days: 1, health: -5 } },
        { label: "Whip the oxen hard to pull through", consequences: { oxen: -1, miles: 6 } },
      ],
      personality_effects: {},
      journal_entry: "Bogged down in soft ground. The trail does not give anything back easily.",
    },
    {
      title: "The Sick Stranger",
      description: "A man staggers out of the brush, feverish and begging for water and a place to lie down. Taking him in risks the sickness; turning him away has its own weight.",
      choices: [
        { label: "Tend to him and risk the fever", consequences: { medicine: -1, health: -5, morale: 5 } },
        { label: "Give water and send him on", consequences: { food: -5, morale: -10 } },
      ],
      personality_effects: {},
      journal_entry: "A sick stranger came to us out of the brush. We chose, and we will live with it.",
    },
  ],

  high: [
    {
      title: "The Fever",
      description: "Someone wakes shivering despite the heat. By midday they cannot stand. The rest of the party watches with the quiet arithmetic of survival — how much medicine, how many days, how much food for someone who cannot walk.",
      choices: [
        { label: "Use precious medicine", consequences: { medicine: -2, days: 1 } },
        { label: "Rest and hope", consequences: { health: -15, days: 2 }, delayed_effects: [{ days_remaining: 4, consequences: { health: -20 }, target: "actor", journal_entry: "The fever did not break. It was only waiting." }] },
        { label: "Keep moving — they ride in the wagon", consequences: { health: -10, morale: -15 } },
      ],
      personality_effects: {},
      journal_entry: "Sickness in the company. We weigh lives against miles now.",
    },
    {
      title: "The Sound at Night",
      description: "Something circled the camp last night. Tracks in the morning — wolves, or maybe dogs gone feral. The oxen are skittish and refuse to eat. Nobody slept.",
      choices: [
        { label: "Post a double watch tonight", consequences: { health: -5, morale: -10 } },
        { label: "Use ammunition to scare them off", consequences: { ammo: -10, morale: -5 } },
        { label: "Move camp at first light", consequences: { days: 1 } },
      ],
      personality_effects: {},
      journal_entry: "Something stalked us in the dark. The oxen know what we pretend not to.",
    },
    {
      title: "The Argument",
      description: "Two members of the party cannot agree on the route. Voices rise. One reaches for a tool. The trail strips courtesy like bark from a dead tree.",
      choices: [
        { label: "Side with the louder voice", consequences: { morale: -15 } },
        { label: "Force them apart and waste a day talking", consequences: { days: 1, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "The company fractured today over which path to take. Mended, barely.",
    },
    {
      title: "Dead Oxen",
      description: "Found two oxen dead by morning, bloated and stiff. Bad water or bad grass — impossible to say which. The yoke is short now and every remaining animal matters more than some of the people think about each other.",
      choices: [
        { label: "Butcher them for meat", consequences: { oxen: -2, food: 40, morale: -10 } },
        { label: "Leave them and redistribute the load", consequences: { oxen: -2, food: -20, clothing: -1 } },
      ],
      personality_effects: {},
      journal_entry: "Lost two oxen in the night. The math of survival grows harder.",
    },
    {
      title: "The Trade",
      description: "A lone man on a mule offers medicine at a price that makes the stomach turn. He knows what he has. He knows what you need. The trail teaches commerce without mercy.",
      choices: [
        { label: "Pay his price", consequences: { money: -500, medicine: 3 } },
        { label: "Threaten him", consequences: { ammo: -5, morale: -20, medicine: 3 } },
        { label: "Walk away", consequences: { morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "Met a trader who knew exactly how desperate we were.",
    },
    {
      title: "The Empty Cradle",
      description: "A family ahead buried something small this morning and would not speak of it. They left the cradle by the trailside, turned to face west. The party walks past it and no one says a word.",
      choices: [
        { label: "Take the wood for the fire", consequences: { morale: -15 } },
        { label: "Leave it and keep walking", consequences: { morale: -5, miles: 8 } },
      ],
      personality_effects: {},
      journal_entry: "We passed what they left behind. Some griefs do not bear naming.",
    },
    {
      title: "Counting Heads",
      description: "Someone counts the party at the cookfire and comes up one short. They count again. The number is right the second time, but no one is sure who they thought they saw.",
      choices: [
        { label: "Say nothing and bank the fire", consequences: { morale: -10 } },
        { label: "Walk the perimeter with the lantern", consequences: { health: -5, days: 0 } },
      ],
      personality_effects: {},
      journal_entry: "We are all accounted for. I keep counting anyway.",
    },
    {
      title: "The Wolves Wait",
      description: "They have followed since the last grave. They keep just out of range, patient as creditors, and at night their eyes catch the firelight. The oxen will not settle.",
      choices: [
        { label: "Spend ammunition to thin them", consequences: { ammo: -12, morale: -5 } },
        { label: "Build the fire high and endure the night", consequences: { health: -10, food: -10 } },
      ],
      personality_effects: {},
      journal_entry: "The wolves know something we do not. They are in no hurry.",
    },
    {
      title: "What the Sick One Says",
      description: "The fevered one has begun to talk through the nights — to people not present, about things not yet happened. By morning they remember none of it. The rest of the party remembers all of it.",
      choices: [
        { label: "Dose them to keep them quiet", consequences: { medicine: -2, morale: -5 } },
        { label: "Let them speak and listen", consequences: { health: -5, morale: -15 } },
      ],
      personality_effects: {},
      journal_entry: "He spoke of the road ahead as though he had already walked it. I did not sleep.",
    },
    {
      title: "The Shared Grave",
      description: "The ground is frozen too hard to dig two holes, and there are two to bury. The choice is whether to lay them together or to spend the strength no one has on a second grave.",
      choices: [
        { label: "Bury them together and move on", consequences: { days: 1, morale: -10 } },
        { label: "Spend the day digging properly", consequences: { days: 2, health: -10 } },
      ],
      personality_effects: {},
      journal_entry: "We laid them in the one hole. The trail does not grant us the dignity of distance.",
    },
    {
      title: "The Mirror Train",
      description: "A wagon train passes going the wrong way — east, against everything. Gaunt, silent, eyes that do not meet yours. One of them says only: 'There is nothing out there worth what it costs.' Then they are gone.",
      choices: [
        { label: "Press west regardless", consequences: { miles: 10, morale: -15 } },
        { label: "Make camp and reconsider the road", consequences: { days: 1, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "We met those who turned back. I cannot stop thinking of what they saw.",
    },
    {
      title: "The Lottery of the Last Dose",
      description: "Two have taken the fever and there is medicine for one. No one will say it aloud, so the matter falls to a drawn lot, or to whoever holds the bottle. The healthy ones do not meet each other's eyes.",
      choices: [
        { label: "Give it to the one most likely to live", consequences: { medicine: -3, morale: -10 } },
        { label: "Split it and hope for both", consequences: { medicine: -3, health: -10, morale: -5 } },
      ],
      personality_effects: {},
      journal_entry: "There was medicine enough for one. We are the kind of people who must now decide such things.",
    },
  ],
};

// ── Bitter Path ("The Long Night") ────────────────────────────────────
//
// Hidden horror-tier mechanic fired by the simulation when a party is late-
// stage starving with a recent death. LLM-generated in McCarthy register
// with strict constraints. Forbidden-word check rejects bad generations; a
// cause-keyed hand-written fallback ships with the worker so the player
// always sees safe period-voice text on LLM failure.

const LONG_NIGHT_SYSTEM_PROMPT = `You are writing a single scene for an Oregon Trail game set in 1848. Tone is High (psychological horror, moral decay). The party is in the late stages of starvation after a recent death. The scene, titled "The Long Night", depicts survivors considering — and confronting — what the trail demands of them. The act of survival cannibalism may be named. It may be described with physical, bodily detail. The dignity of the dead is preserved by the writing, not by evasion.

VOICE (strict):
- Cormac McCarthy register (The Road, Blood Meridian): spare, plainspoken, unflinching. Short sentences. Present tense where possible. Specific physical detail.
- No adjectives of emotion (no "scared", "terrified", "desperate"). Let action carry affect.
- 2 to 4 sentences in the description. Vary between T1 (spare, implied by action) and T2 (visceral, named with bodily detail). Pick whichever fits the cause and the moment. Do not moralize.
- The deceased is referred to by name. Survivors get one specific physical detail each.
- Period (1848): no modern vocabulary, no clinical terms, no therapeutic language, no horror-genre register ("ominous", "whispered", "shadows fell", "like a scene from").
- No second-person instruction to the player.

FORBIDDEN (hard refusal):
- Slurs (racial, ethnic, gendered, religious)
- Sexual content of any kind
- Children as the butchers. Children may watch, may eat, may not act.
- Self-harm framing as resolution ("he hanged himself", "she took her own life to spare them")
- Modern-era breaks ("like a zombie movie", "horror film", "serial killer")
- Purple prose, melodrama, or Halloween register
- Second-person instruction

OUTPUT (JSON exactly this shape):
{
  "title": "The Long Night",
  "description": "<2-4 sentences, voice constraints above>",
  "choices": [
    {"label": "Pray, and starve with dignity.", "consequences": {}},
    {"label": "Travel on. Hope for game.", "consequences": {}},
    {"label": "Do what the trail demands.", "consequences": {}}
  ],
  "journal_entry": "<1-2 sentence retrospective period-voice note>",
  "personality_effects": {}
}

Consequences are intentionally empty in your output. The server applies them deterministically based on the choice picked. Do not attempt to influence numeric outcomes.

Example T1 (spare) for {deceased: Sarah, cause: cholera, days_ago: 4}:

{
  "title": "The Long Night",
  "description": "Sarah has been four nights gone. Thomas was at the wagon with the smaller knife before sunrise and no one asked him to be. Martha watches from the canvas and does not cross herself. The wind moves through the grass and does not stop.",
  "choices": [
    {"label": "Pray, and starve with dignity.", "consequences": {}},
    {"label": "Travel on. Hope for game.", "consequences": {}},
    {"label": "Do what the trail demands.", "consequences": {}}
  ],
  "journal_entry": "We did what was left to us. We did not pray.",
  "personality_effects": {}
}

Example T2 (visceral) for {deceased: Thomas, cause: exhaustion, days_ago: 2}:

{
  "title": "The Long Night",
  "description": "Thomas has been two nights under the canvas and the cold has kept him. Martha holds the liver in both hands a long while before she does what the trail demands of her. The knife is still dark by the time she is finished. The children have stopped asking from what the supper is.",
  "choices": [
    {"label": "Pray, and starve with dignity.", "consequences": {}},
    {"label": "Travel on. Hope for game.", "consequences": {}},
    {"label": "Do what the trail demands.", "consequences": {}}
  ],
  "journal_entry": "There was a supper. God knows what was in it.",
  "personality_effects": {}
}`;

// Multi-category forbidden check. Blocks content categories we never want to ship,
// regardless of register. Loosened from v1 which blocked the word "eat" — now
// allowed; the act of survival cannibalism may be named.
const LONG_NIGHT_FORBIDDEN_PATTERNS: RegExp[] = [
  // Slurs
  /\b(nigger|faggot|spic|chink|kike|gook|injun|savage(s)?)\b/i,
  // Sexual content
  /\b(sex|sexual|rape|rap(ed|ing)|genital(s)?|penis|vagina|breast(s)?|erotic)\b/i,
  // Modern-era breaks
  /\b(zombie|horror (movie|film)|serial killer|psycho|like a (movie|film)|scene from a|trauma bond|ptsd)\b/i,
  // Children as butchers / severe child-harm language
  /\b(child(ren)?|kid(s)?|toddler|infant)s?\s+(butcher|butchered|cut up|killed|murdered|slaughter|slaughtered)\b/i,
  // Self-harm framing as resolution
  /\b((hang(ed|s)? |hung )(him|her|them|my)self|took (his|her|their|my) own life|end it all|killed (him|her|my|them)self)\b/i,
];

export function isLongNightForbidden(text: string): boolean {
  return LONG_NIGHT_FORBIDDEN_PATTERNS.some((re) => re.test(text));
}

type CauseKey = "starvation" | "disease" | "drowning" | "injury" | "event";

const DISEASE_CAUSES = new Set([
  "cholera", "dysentery", "typhoid", "mountain_fever", "measles", "scurvy",
]);
const INJURY_CAUSES = new Set([
  "accidental_injury", "Stampede",
]);

export function pickFallbackKey(cause: string): CauseKey {
  if (cause === "exhaustion") return "starvation";
  if (DISEASE_CAUSES.has(cause)) return "disease";
  if (cause === "drowning") return "drowning";
  if (INJURY_CAUSES.has(cause)) return "injury";
  return "event";
}

function daysAgoWords(days: number): string {
  if (days <= 1) return "yesterday";
  if (days === 2) return "two nights past";
  if (days === 3) return "three nights past";
  return `${days} nights past`;
}

// Hand-written fallbacks that ship with the worker so the player always sees
// period-voice text on LLM failure. Register: McCarthy spare-to-visceral,
// cause-keyed. Three of the five name the act directly (starvation, disease,
// injury); two remain implied by concrete action (drowning, event) so the
// tone varies across replays. All respect the forbidden categories above.
const FALLBACK_LONG_NIGHT: Record<CauseKey, string> = {
  starvation: "The oxen have not moved since morning. {DECEASED} lies under canvas behind the wagon and the grave they dug before dawn was not deep enough for a body to stay in. By evening {SURVIVOR} had cut what could be cut and eaten what could be eaten. The wind moves through the grass and does not stop.",
  disease: "{DECEASED} went {DAYS_AGO_WORDS}. The sickness left the body but the hunger did not care. {SURVIVOR} sat by the cold stove and ate the strip of liver cooked black over the embers and did not look up. The children had theirs. The children did not ask.",
  drowning: "The current took {DECEASED} at the ford. That was {DAYS_AGO_WORDS}. The body came to rest two bends downstream where the willows grow, and {SURVIVOR} returned at dusk with it wrapped in oilcloth and did not say what had been done at the river.",
  injury: "{DECEASED} fell beside the wagon {DAYS_AGO_WORDS}. The body was laid out behind the fire on oilcloth and {SURVIVOR} went at it with the longer knife for an hour before they called the others in. They ate what they could keep down. Nobody sang grace.",
  event: "{DECEASED} was lost {DAYS_AGO_WORDS}. The wagon has not moved since. {SURVIVOR} sits apart from the others with a bundle in their lap and the smaller knife laid beside it on the canvas. Supper will come late tonight, and it will not be what it has been.",
};

// Journal entries keyed to cause — same tone, a retrospective period-voice beat.
const FALLBACK_LONG_NIGHT_JOURNAL: Record<CauseKey, string> = {
  starvation: "We did what was left to us. We did not pray.",
  disease: "There was a supper. No one asked from where it came.",
  drowning: "The river took him. We took what came back.",
  injury: "His body kept us moving. Whatever is left of our souls kept still.",
  event: "We did what the trail required. May the Lord not hold it against us too long.",
};

export function interpolateLongNightFallback(
  template: string,
  ctx: { deceasedName: string; daysSinceDeath: number; survivorName: string },
): string {
  return template
    .replaceAll("{DECEASED}", ctx.deceasedName)
    .replaceAll("{DAYS_AGO_WORDS}", daysAgoWords(ctx.daysSinceDeath))
    .replaceAll("{SURVIVOR}", ctx.survivorName);
}

export function buildLongNightFallback(
  deceasedName: string,
  deceasedCause: string,
  daysSinceDeath: number,
  survivorName: string,
): EventResponse {
  const key = pickFallbackKey(deceasedCause);
  const description = interpolateLongNightFallback(FALLBACK_LONG_NIGHT[key], {
    deceasedName, daysSinceDeath, survivorName,
  });
  return {
    title: "The Long Night",
    description,
    choices: [
      { label: "Pray, and starve with dignity.", consequences: {} },
      { label: "Travel on. Hope for game.", consequences: {} },
      { label: "Do what the trail demands.", consequences: {} },
    ],
    personality_effects: {},
    journal_entry: FALLBACK_LONG_NIGHT_JOURNAL[key],
  };
}

export async function generateLongNight(
  deceasedName: string,
  deceasedCause: string,
  daysSinceDeath: number,
  survivorName: string,
  apiKey: string,
): Promise<EventResponse> {
  const user = `Context:
- deceased_member: {"name": "${deceasedName}", "cause": "${deceasedCause}", "days_ago": ${daysSinceDeath}}
- survivors_include: ["${survivorName}"]

Write The Long Night scene. Follow all voice constraints. Return JSON.`;

  try {
    const raw = await callAnthropic(LONG_NIGHT_SYSTEM_PROMPT, user, apiKey, {
      maxTokens: 500,
      timeout: 8000,
    });
    const parsed = parseEventResponse(raw);
    // Post-parse guard: reject any output that trips the forbidden-category
    // regexes (slurs, sexual, modern-era breaks, children-as-butchers,
    // self-harm framing). Fall through to hand-written fallback.
    if (isLongNightForbidden(parsed.description) || isLongNightForbidden(parsed.journal_entry)) {
      return buildLongNightFallback(deceasedName, deceasedCause, daysSinceDeath, survivorName);
    }
    // Enforce the canonical three choice labels server-side; ignore model drift.
    parsed.title = "The Long Night";
    parsed.choices = [
      { label: "Pray, and starve with dignity.", consequences: {} },
      { label: "Travel on. Hope for game.", consequences: {} },
      { label: "Do what the trail demands.", consequences: {} },
    ];
    return parsed;
  } catch {
    return buildLongNightFallback(deceasedName, deceasedCause, daysSinceDeath, survivorName);
  }
}

/**
 * Asymmetric consequences for the three Long Night choices.
 * Returned as a partial GameState delta the API handler can apply directly.
 */
export function bitterPathConsequences(choiceIndex: 0 | 1 | 2): {
  bitter_path_taken: "dignified" | "hopeful" | "taken";
  food_delta: number;
  starvation_days_reset: boolean;
  morale_delta_per_member: number;
  sanity_delta_per_member: number;
  days_delta: number;
} {
  if (choiceIndex === 0) {
    return {
      bitter_path_taken: "dignified",
      food_delta: 0,
      starvation_days_reset: false,
      morale_delta_per_member: 8,
      sanity_delta_per_member: 0,
      days_delta: 0,
    };
  }
  if (choiceIndex === 1) {
    return {
      bitter_path_taken: "hopeful",
      food_delta: 0,
      starvation_days_reset: false,
      morale_delta_per_member: 5,
      sanity_delta_per_member: 0,
      days_delta: 1,
    };
  }
  return {
    bitter_path_taken: "taken",
    food_delta: 60,
    starvation_days_reset: true,
    morale_delta_per_member: -20,
    sanity_delta_per_member: -30,
    days_delta: 0,
  };
}
