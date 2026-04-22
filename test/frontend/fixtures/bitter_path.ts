// trigger_meta fixtures for bitter_path.js scene.
// Schema: worker/src/index.ts handleAdvance — trigger_meta is the sim
// metadata (dead_member_name/cause/days_since_death/trigger_variant)
// shipped alongside the hashed EventResponse.

export const wastingVariant = {
  dead_member_name: "Sarah",
  dead_member_cause: "exhaustion",
  days_since_death: 4,
  trigger_variant: "wasting",
};

export const failingVariant = {
  dead_member_name: "Earl",
  dead_member_cause: "cholera",
  days_since_death: 2,
  trigger_variant: "failing",
};

// Hostile input — trigger_meta is persisted through localStorage and can
// be tampered with. The scene coerces days_since_death to a finite integer
// before interpolation. If it ever stops coercing this fixture catches it.
export const hostileDays = {
  dead_member_name: "Dana",
  dead_member_cause: "exhaustion",
  days_since_death: "<script>alert(1)</script>" as unknown as number,
  trigger_variant: "wasting",
};
