// Landmark fixtures for landmark.js scene tests.
// Schema: worker/src/types.ts Landmark.

export const fort = {
  id: "lm_fort_kearney",
  name: "Fort Kearney",
  segment_id: "seg_03",
  mile_marker: 320,
  type: "fort" as const,
  operator_1848: "U.S. Army",
  description: "A military outpost on the Platte. Travelers rest and resupply.",
  diary_quote: "Saw the fort today. Men in blue coats.",
  diary_source: "Test",
  trade_inventory: [
    { item: "flour", price_1848_cents: 400, availability: "common" as const },
    { item: "coffee", price_1848_cents: 600, availability: "scarce" as const },
  ],
  services: ["blacksmith", "general_store", "rest"],
  event_hooks: [],
};

export const naturalWonder = {
  id: "lm_chimney_rock",
  name: "Chimney Rock",
  segment_id: "seg_05",
  mile_marker: 590,
  type: "natural" as const,
  operator_1848: null,
  description: "A rock spire visible for days before the wagon reaches it.",
  diary_quote: "Saw Chimney Rock at sunrise. A pillar of stone.",
  diary_source: "Test",
  trade_inventory: [],
  services: [],
  event_hooks: [],
};

export const settlement = {
  id: "lm_settlement",
  name: "Little Blue River Settlement",
  segment_id: "seg_02",
  mile_marker: 180,
  type: "settlement" as const,
  operator_1848: null,
  description: "A cluster of sod houses along the river.",
  diary_quote: "Traded eggs for salt.",
  diary_source: "Test",
  trade_inventory: [
    { item: "eggs", price_1848_cents: 10, availability: "common" as const },
  ],
  services: ["trade"],
  event_hooks: [],
};

export const emptyInventory = {
  ...fort,
  name: "Abandoned Fort",
  trade_inventory: [],
  services: [],
};
