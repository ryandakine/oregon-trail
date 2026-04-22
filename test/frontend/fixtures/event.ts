// EventResponse fixtures for event.js + bitter_path.js scene tests.
// Schema: worker/src/types.ts EventResponse.

export const threeChoice = {
  title: "Dead Oxen",
  description: "Found two oxen dead by morning. The yoke is short now.",
  choices: [
    { label: "Butcher them for meat", consequences: { oxen: -2, food: 40, morale: -10 } },
    { label: "Leave them and push on", consequences: { oxen: -2 } },
    { label: "Rest a day and recover", consequences: { days: 1, morale: 5 } },
  ],
  personality_effects: {},
  journal_entry: "Lost two oxen in the night.",
};

export const noChoices = {
  title: "Nothing Happens",
  description: "The day passes without incident.",
  choices: [],
  personality_effects: {},
  journal_entry: "A quiet day on the trail.",
};

export const longDescription = {
  ...threeChoice,
  description: "Found two oxen dead by morning, bloated and stiff. ".repeat(30).trim(),
};

export const bitterPathScene = {
  title: "The Long Night",
  description: "Sarah has been four nights gone. Thomas was at the wagon with the smaller knife before sunrise and no one asked him to be.",
  choices: [
    { label: "Pray, and starve with dignity.", consequences: {} },
    { label: "Travel on. Hope for game.", consequences: {} },
    { label: "Do what the trail demands.", consequences: {} },
  ],
  personality_effects: {},
  journal_entry: "We did what was left to us. We did not pray.",
};
