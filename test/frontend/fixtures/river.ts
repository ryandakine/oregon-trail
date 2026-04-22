// RiverCrossing fixtures for river.js scene tests.
// Schema: worker/src/types.ts RiverCrossing.
// ford_difficulty is `1 | 2 | 3 | 4 | 5` — the numeric-not-string nature of
// this field is the regression we pin in T-river-2 (commit 4af2434).

export const happy = {
  id: "rc_kansas_river",
  name: "Kansas River",
  mile_marker: 102,
  width_ft: 230,
  depth_ft_summer: 2,
  depth_ft_spring: 4,
  ford_difficulty: 3,
  ferry_available: true,
  ferry_cost_1848_dollars: 200,
  description: "A wide, slow river. The ferry is a log raft.",
};

// Regression pin for commit 4af2434 — scene called .toUpperCase() on a
// number and blue-screened. This fixture is the exact shape that crashed
// prod on 2026-04-18.
export const edgeNumericMax = {
  ...happy,
  name: "Snake River",
  ford_difficulty: 5,
};

export const edgeFerryUnaffordable = {
  ...happy,
  name: "Green River",
  ferry_cost_1848_dollars: 99999,
};

export const edgeMinimal = {
  id: "rc_min",
  name: "Creek",
  ford_difficulty: 1,
};
