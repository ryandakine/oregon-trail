import { describe, it, expect } from "vitest";
import {
  pickFallbackKey,
  interpolateLongNightFallback,
  buildLongNightFallback,
  bitterPathConsequences,
  isLongNightForbidden,
} from "../src/anthropic";

describe("pickFallbackKey — cause-keyed Bitter Path fallback dispatch", () => {
  it("maps disease causes to 'disease'", () => {
    for (const c of ["cholera", "dysentery", "typhoid", "mountain_fever", "measles", "scurvy"]) {
      expect(pickFallbackKey(c)).toBe("disease");
    }
  });

  it("maps exhaustion to 'starvation'", () => {
    expect(pickFallbackKey("exhaustion")).toBe("starvation");
  });

  it("maps drowning to 'drowning'", () => {
    expect(pickFallbackKey("drowning")).toBe("drowning");
  });

  it("maps injury-like causes to 'injury'", () => {
    expect(pickFallbackKey("accidental_injury")).toBe("injury");
    expect(pickFallbackKey("Stampede")).toBe("injury");
  });

  it("maps unknown LLM event titles to 'event'", () => {
    expect(pickFallbackKey("Rattlesnake Bite at Dusk")).toBe("event");
    expect(pickFallbackKey("")).toBe("event");
  });
});

describe("interpolateLongNightFallback", () => {
  it("replaces {DECEASED}, {DAYS_AGO_WORDS}, {SURVIVOR}", () => {
    const out = interpolateLongNightFallback(
      "{DECEASED} was buried {DAYS_AGO_WORDS}. {SURVIVOR} sharpens a knife.",
      { deceasedName: "Martha", daysSinceDeath: 2, survivorName: "Thomas" },
    );
    expect(out).toBe("Martha was buried two nights past. Thomas sharpens a knife.");
  });

  it("handles yesterday (days=1) correctly", () => {
    const out = interpolateLongNightFallback(
      "{DAYS_AGO_WORDS}",
      { deceasedName: "", daysSinceDeath: 1, survivorName: "" },
    );
    expect(out).toBe("yesterday");
  });

  it("handles days=0 as yesterday (edge case)", () => {
    const out = interpolateLongNightFallback(
      "{DAYS_AGO_WORDS}",
      { deceasedName: "", daysSinceDeath: 0, survivorName: "" },
    );
    expect(out).toBe("yesterday");
  });
});

describe("buildLongNightFallback — full event shape", () => {
  it("produces a complete EventResponse with the canonical 3 choices", () => {
    const ev = buildLongNightFallback("Sarah", "cholera", 2, "Martha");
    expect(ev.title).toBe("The Long Night");
    expect(ev.choices).toHaveLength(3);
    expect(ev.choices[0].label).toBe("Pray, and starve with dignity.");
    expect(ev.choices[1].label).toBe("Travel on. Hope for game.");
    expect(ev.choices[2].label).toBe("Do what the trail demands.");
    expect(ev.description).toContain("Sarah");
    expect(ev.description).toContain("two nights past");
    expect(ev.description).toContain("Martha");
  });

  it("fallback output passes the multi-category forbidden guard for every cause", () => {
    for (const cause of ["exhaustion", "cholera", "drowning", "accidental_injury", "Stampede", "custom_event"]) {
      const ev = buildLongNightFallback("Jacob", cause, 2, "Ellen");
      expect(isLongNightForbidden(ev.description), `description for cause=${cause}`).toBe(false);
      expect(isLongNightForbidden(ev.journal_entry), `journal for cause=${cause}`).toBe(false);
    }
  });

  it("fallback journal entry is cause-keyed, not a generic template", () => {
    const drowning = buildLongNightFallback("Kate", "drowning", 1, "Owen");
    const starvation = buildLongNightFallback("Moss", "exhaustion", 1, "Owen");
    expect(drowning.journal_entry).not.toBe(starvation.journal_entry);
  });

  it("routes cause to the correct physical setting", () => {
    const drowning = buildLongNightFallback("Kate", "drowning", 1, "Owen");
    expect(drowning.description).toContain("current");

    const injury = buildLongNightFallback("Pete", "Stampede", 1, "Owen");
    expect(injury.description).toContain("fell");

    const starvation = buildLongNightFallback("Moss", "exhaustion", 1, "Owen");
    expect(starvation.description).toContain("oxen");
  });
});

describe("isLongNightForbidden — multi-category guard (slurs/sexual/modern/child-butcher/self-harm)", () => {
  it("allows the act to be named — 'eat', 'flesh', 'meat', 'butchered' are NOT forbidden", () => {
    // Behavior change from v1: the old guard rejected these words. T2 visceral
    // register needs them. Other forbidden categories still block.
    expect(isLongNightForbidden("They ate in silence.")).toBe(false);
    expect(isLongNightForbidden("The flesh was cold.")).toBe(false);
    expect(isLongNightForbidden("Martha held the liver in both hands.")).toBe(false);
    expect(isLongNightForbidden("Thomas butchered the body behind the wagon.")).toBe(false);
  });

  it("blocks sexual content", () => {
    expect(isLongNightForbidden("Sexual overtones lingered at the wagon.")).toBe(true);
    expect(isLongNightForbidden("She was raped before she died.")).toBe(true);
  });

  it("blocks slurs", () => {
    // Period slurs that might plausibly land in a bad generation
    expect(isLongNightForbidden("The savages came at dusk.")).toBe(true);
    expect(isLongNightForbidden("An injun stood at the ridge.")).toBe(true);
  });

  it("blocks modern-era breaks", () => {
    expect(isLongNightForbidden("She moved like a zombie through the grass.")).toBe(true);
    expect(isLongNightForbidden("It was like a scene from a horror movie.")).toBe(true);
    expect(isLongNightForbidden("Thomas became a serial killer that night.")).toBe(true);
  });

  it("blocks children as butchers", () => {
    expect(isLongNightForbidden("The children butchered the body.")).toBe(true);
    expect(isLongNightForbidden("Kids cut up their father.")).toBe(true);
  });

  it("blocks self-harm framing as resolution", () => {
    expect(isLongNightForbidden("Martha hanged herself in the night.")).toBe(true);
    expect(isLongNightForbidden("He took his own life to spare them.")).toBe(true);
  });
});

describe("bitterPathConsequences — asymmetric payoffs per choice", () => {
  it("choice 0: dignified — +8 morale, no food, no sanity hit, flag=dignified", () => {
    const c = bitterPathConsequences(0);
    expect(c.bitter_path_taken).toBe("dignified");
    expect(c.food_delta).toBe(0);
    expect(c.starvation_days_reset).toBe(false);
    expect(c.morale_delta_per_member).toBe(8);
    expect(c.sanity_delta_per_member).toBe(0);
    expect(c.days_delta).toBe(0);
  });

  it("choice 1: hopeful — +5 morale, +1 day burned, flag=hopeful", () => {
    const c = bitterPathConsequences(1);
    expect(c.bitter_path_taken).toBe("hopeful");
    expect(c.morale_delta_per_member).toBe(5);
    expect(c.days_delta).toBe(1);
    expect(c.food_delta).toBe(0);
  });

  it("choice 2: taken — +60 food, starvation reset, -30 sanity, -20 morale, flag=taken", () => {
    const c = bitterPathConsequences(2);
    expect(c.bitter_path_taken).toBe("taken");
    expect(c.food_delta).toBe(60);
    expect(c.starvation_days_reset).toBe(true);
    expect(c.sanity_delta_per_member).toBe(-30);
    expect(c.morale_delta_per_member).toBe(-20);
  });
});
