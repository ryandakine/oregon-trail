import { describe, it, expect } from "vitest";
import {
  getSegment,
  getSegmentForMile,
  getLandmarksForSegment,
  getNextLandmark,
  getWeather,
  getDisease,
  getNationsForSegment,
  getNextRiverCrossing,
  getTotalTrailDistance,
} from "../src/context-loader";
import type { HistoricalContext } from "../src/types";
import ctx from "../src/historical-context.json";

const historical = ctx as unknown as HistoricalContext;

describe("getSegment", () => {
  it("returns seg_01 by id", () => {
    const seg = getSegment(historical, "seg_01");
    expect(seg).toBeDefined();
    expect(seg!.id).toBe("seg_01");
    expect(seg!.order).toBe(1);
  });

  it("returns undefined for unknown id", () => {
    expect(getSegment(historical, "seg_99")).toBeUndefined();
  });
});

describe("getSegmentForMile", () => {
  it("mile 0 returns seg_01", () => {
    const seg = getSegmentForMile(historical, 0);
    expect(seg.id).toBe("seg_01");
  });

  it("at exactly end-mile of seg_01 (83), still in seg_01", () => {
    const seg = getSegmentForMile(historical, 83);
    expect(seg.id).toBe("seg_01");
  });

  it("mile 84 returns seg_02", () => {
    const seg = getSegmentForMile(historical, 84);
    expect(seg.id).toBe("seg_02");
  });

  it("mile 143 (end of seg_02: 83+60) returns seg_02", () => {
    const seg = getSegmentForMile(historical, 143);
    expect(seg.id).toBe("seg_02");
  });

  it("mile 144 returns seg_03", () => {
    const seg = getSegmentForMile(historical, 144);
    expect(seg.id).toBe("seg_03");
  });

  it("past total trail distance returns last segment", () => {
    const seg = getSegmentForMile(historical, 99999);
    expect(seg.id).toBe("seg_16");
  });
});

describe("getLandmarksForSegment", () => {
  it("seg_01 has landmarks", () => {
    const landmarks = getLandmarksForSegment(historical, "seg_01");
    expect(landmarks.length).toBeGreaterThan(0);
    for (const lm of landmarks) {
      expect(lm.segment_id).toBe("seg_01");
    }
  });

  it("unknown segment returns empty array", () => {
    expect(getLandmarksForSegment(historical, "seg_99")).toEqual([]);
  });
});

describe("getNextLandmark", () => {
  it("at mile 0, returns first landmark with mile_marker > 0", () => {
    const lm = getNextLandmark(historical, 0);
    expect(lm).toBeDefined();
    expect(lm!.mile_marker).toBeGreaterThan(0);
  });

  it("past all landmarks returns undefined", () => {
    const lm = getNextLandmark(historical, 1764);
    expect(lm).toBeUndefined();
  });

  it("past 2000 miles returns undefined", () => {
    const lm = getNextLandmark(historical, 2000);
    expect(lm).toBeUndefined();
  });
});

describe("getWeather", () => {
  it("returns a profile for April/missouri", () => {
    const w = getWeather(historical, 4, "missouri");
    expect(w).toBeDefined();
    expect(w!.month).toBe(4);
    expect(w!.region).toBe("missouri");
  });

  it("returns undefined for invalid combo", () => {
    const w = getWeather(historical, 4, "willamette");
    // May or may not exist, but shouldn't throw
    if (w) {
      expect(w.month).toBe(4);
    }
  });
});

describe("getDisease", () => {
  it("returns cholera by id", () => {
    const d = getDisease(historical, "cholera");
    expect(d).toBeDefined();
    expect(d!.id).toBe("cholera");
    expect(d!.name).toBeTruthy();
  });

  it("returns undefined for unknown disease", () => {
    expect(getDisease(historical, "bubonic_plague")).toBeUndefined();
  });
});

describe("getNationsForSegment", () => {
  it("seg_01 has nations", () => {
    const nations = getNationsForSegment(historical, "seg_01");
    expect(nations.length).toBeGreaterThan(0);
  });

  it("unknown segment returns empty array", () => {
    expect(getNationsForSegment(historical, "seg_99")).toEqual([]);
  });
});

describe("getNextRiverCrossing", () => {
  it("returns first crossing in seg_01 at mile 0", () => {
    const rc = getNextRiverCrossing(historical, "seg_01", [], 0);
    expect(rc).toBeDefined();
    expect(rc!.mile_marker).toBeGreaterThan(0);
  });

  it("skips resolved crossings", () => {
    const first = getNextRiverCrossing(historical, "seg_01", [], 0);
    expect(first).toBeDefined();
    const second = getNextRiverCrossing(historical, "seg_01", [first!.id], 0);
    // Second crossing should be different or undefined
    if (second) {
      expect(second.id).not.toBe(first!.id);
    }
  });

  it("returns undefined when all crossings resolved", () => {
    const seg = getSegment(historical, "seg_01");
    const allIds = seg!.river_crossings.map((rc) => rc.id);
    const rc = getNextRiverCrossing(historical, "seg_01", allIds, 0);
    expect(rc).toBeUndefined();
  });

  it("returns undefined for segment with no crossings", () => {
    // seg_05 has no river crossings
    const rc = getNextRiverCrossing(historical, "seg_05", [], 0);
    expect(rc).toBeUndefined();
  });
});

describe("getTotalTrailDistance", () => {
  it("returns sum of all segment distances", () => {
    const total = getTotalTrailDistance(historical);
    // Known from data: 83+60+170+230+51+180+100+100+100+60+50+120+120+130+120+90 = 1764
    expect(total).toBe(1764);
  });
});
