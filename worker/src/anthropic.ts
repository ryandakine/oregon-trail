import type { EventResponse, ToneTier } from "./types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20250415";

const ALLOWED_CONSEQUENCE_KEYS = new Set([
  "health", "food", "ammo", "clothing", "spare_parts",
  "medicine", "money", "oxen", "morale", "miles", "days",
]);

export async function callAnthropic(
  system: string,
  user: string,
  apiKey: string,
  opts?: { maxTokens?: number; timeout?: number },
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 800;
  const timeout = opts?.timeout ?? 8000;

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

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Anthropic API ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content[0].text;
  } finally {
    clearTimeout(timer);
  }
}

export function parseEventResponse(raw: string): EventResponse {
  // Strip markdown fences if present
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
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
    for (const [key, val] of Object.entries(choice.consequences)) {
      if (!ALLOWED_CONSEQUENCE_KEYS.has(key)) {
        throw new Error(`invalid consequence key: ${key}`);
      }
      if (typeof val !== "number" || !Number.isFinite(val)) {
        throw new Error(`consequence ${key} must be a finite number, got ${typeof val}`);
      }
      // Clamp to reasonable bounds
      if (Math.abs(val as number) > 10000) {
        (choice.consequences as Record<string, number>)[key] = Math.sign(val as number) * 10000;
      }
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
        { label: "Push through the mud", consequences: { health: -5, miles: -4 } },
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
  ],

  medium: [
    {
      title: "Tainted Water",
      description: "The only water source for miles has a faint alkali sheen. The oxen are desperate to drink. The party must choose between thirst and poison.",
      choices: [
        { label: "Let the animals drink", consequences: { oxen: -1, health: -5 } },
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
  ],

  high: [
    {
      title: "The Fever",
      description: "Someone wakes shivering despite the heat. By midday they cannot stand. The rest of the party watches with the quiet arithmetic of survival — how much medicine, how many days, how much food for someone who cannot walk.",
      choices: [
        { label: "Use precious medicine", consequences: { medicine: -2, days: 1 } },
        { label: "Rest and hope", consequences: { health: -15, days: 2 } },
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
  ],
};
