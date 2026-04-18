#!/usr/bin/env node
// Phase A calibration harness — runs N playthroughs in batches, aggregates
// survival stats with Wilson 95% confidence intervals, writes JSON + updates
// DIFFICULTY_STATUS.md.
//
// Usage:
//   node scripts/measure-calibration.mjs                       # default prod, 30 runs
//   node scripts/measure-calibration.mjs --url=http://localhost:8765
//   node scripts/measure-calibration.mjs --parallel=3          # 3 concurrent (default 5)

import { spawn } from "node:child_process";
import { writeFile, readFile } from "node:fs/promises";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }
    return [a, true];
  }),
);

const URL = args.url || "https://trail.osi-cyber.com";
const PARALLEL = Number(args.parallel || 5);
const OUT_JSON = args.out || ".gstack/qa-reports/difficulty-calibration-v3.json";
const STATUS_MD = "DIFFICULTY_STATUS.md";

const SCENARIOS = [
  { name: "farmer-steady-medium",    profession: "farmer",    pace: "steady", tone: "medium", runs: 15 },
  { name: "carpenter-steady-medium", profession: "carpenter", pace: "steady", tone: "medium", runs: 5 },
  { name: "farmer-steady-high",      profession: "farmer",    pace: "steady", tone: "high",   runs: 5 },
  { name: "banker-steady-medium",    profession: "banker",    pace: "steady", tone: "medium", runs: 5 },
];

function wilson95(successes, n) {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function median(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function runOne(scenario, runIndex) {
  return new Promise((resolve) => {
    const cp = spawn("node", [
      "scripts/playthrough.mjs",
      `--url=${URL}`,
      `--profession=${scenario.profession}`,
      `--tone=${scenario.tone}`,
      `--pace=${scenario.pace}`,
      "--maxTicks=400",
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    cp.stdout.on("data", (d) => (stdout += d.toString()));
    cp.stderr.on("data", (d) => (stderr += d.toString()));

    const timeout = setTimeout(() => {
      try { cp.kill("SIGKILL"); } catch { /* already exited */ }
    }, 180000);

    cp.on("close", (code) => {
      clearTimeout(timeout);
      const outcome = /outcome:\s*(\S+)/.exec(stdout)?.[1] ?? "UNKNOWN";
      const miles = Number(/miles:\s*(\d+)/.exec(stdout)?.[1] ?? 0);
      const partsSurv = /survivors:\s*(\d+)\/(\d+)/.exec(stdout);
      const survivors = partsSurv ? Number(partsSurv[1]) : 0;
      const partySize = partsSurv ? Number(partsSurv[2]) : 5;
      const deathLines = [...stdout.matchAll(/^ {2}([A-Za-z]+) — (\S+) \((\d{4}-\d{2}-\d{2})\)/gm)];
      const deaths = deathLines.map((m) => ({ name: m[1], cause: m[2], date: m[3] }));
      const eventsHandled = Number(/events handled:\s*(\d+)/.exec(stdout)?.[1] ?? 0);
      const firstDeathDay = (() => {
        if (!deaths.length) return null;
        const first = deaths.reduce((a, b) => (a.date < b.date ? a : b));
        const start = new Date("1848-04-15T00:00:00Z");
        const d = new Date(first.date + "T00:00:00Z");
        return Math.round((d.getTime() - start.getTime()) / 86400000);
      })();
      resolve({
        scenario: scenario.name,
        run: runIndex,
        outcome,
        miles,
        survivors,
        partySize,
        deaths,
        eventsHandled,
        firstDeathDay,
        exitCode: code,
        wiped: outcome === "WIPE",
        arrived: outcome === "ARRIVAL" || outcome === "NEWSPAPER" || outcome === "SHARE",
      });
    });
  });
}

async function runBatch(tasks, parallel) {
  const results = [];
  let inFlight = 0;
  let nextIdx = 0;
  return await new Promise((resolve) => {
    function dispatch() {
      while (inFlight < parallel && nextIdx < tasks.length) {
        const idx = nextIdx++;
        inFlight++;
        const [scenario, runIdx] = tasks[idx];
        const startedAt = Date.now();
        runOne(scenario, runIdx).then((r) => {
          r.duration_ms = Date.now() - startedAt;
          results[idx] = r;
          inFlight--;
          const done = results.filter(Boolean).length;
          console.log(`  [${done}/${tasks.length}] ${r.scenario} run ${r.run}: ${r.outcome} @ mile ${r.miles} (${(r.duration_ms/1000).toFixed(0)}s)`);
          if (done === tasks.length) resolve(results);
          else dispatch();
        });
      }
    }
    dispatch();
  });
}

function aggregate(results) {
  const byScenario = {};
  for (const r of results) {
    if (!byScenario[r.scenario]) byScenario[r.scenario] = { runs: [], wipes: 0, arrivals: 0 };
    byScenario[r.scenario].runs.push(r);
    if (r.wiped) byScenario[r.scenario].wipes++;
    if (r.arrived) byScenario[r.scenario].arrivals++;
  }
  const out = {};
  for (const [name, bucket] of Object.entries(byScenario)) {
    const n = bucket.runs.length;
    const wipes = bucket.wipes;
    const wipeRate = wipes / n;
    const [lb, ub] = wilson95(wipes, n);
    const medianMiles = median(bucket.runs.map((r) => r.miles));
    const medianFirstDeath = median(
      bucket.runs.map((r) => r.firstDeathDay).filter((x) => x !== null),
    );
    const firstEventFatalityRate = bucket.runs.filter(
      (r) => r.firstDeathDay !== null && r.firstDeathDay <= 10,
    ).length / n;
    const causeCounts = {};
    for (const r of bucket.runs) for (const d of r.deaths) causeCounts[d.cause] = (causeCounts[d.cause] ?? 0) + 1;
    out[name] = {
      n,
      wipes,
      arrivals: bucket.arrivals,
      wipe_rate: Number(wipeRate.toFixed(3)),
      wipe_rate_ci95: [Number(lb.toFixed(3)), Number(ub.toFixed(3))],
      median_miles: medianMiles,
      median_first_death_day: medianFirstDeath,
      first_10_days_fatality_rate: Number(firstEventFatalityRate.toFixed(3)),
      cause_counts: causeCounts,
    };
  }
  return out;
}

function decideGate(agg) {
  const farmer = agg["farmer-steady-medium"];
  if (!farmer) return { decision: "UNKNOWN", reason: "no farmer-medium scenario data" };

  const [lb, ub] = farmer.wipe_rate_ci95;
  const rate = farmer.wipe_rate;
  const early = farmer.first_10_days_fatality_rate;

  if (ub < 0.40 && early < 0.30) {
    return { decision: "STOP", reason: `farmer-medium wipe_rate_UB ${(ub*100).toFixed(1)}% < 40% AND early-fatality rate ${(early*100).toFixed(1)}% < 30%. Medium is not catastrophically broken. Ship nothing.` };
  }
  if (early >= 0.30) {
    return { decision: "PHASE_B", reason: `farmer-medium first-10-days fatality rate ${(early*100).toFixed(1)}% ≥ 30%. Early deaths signal broken pacing. Ship Phase B tune.` };
  }
  if (lb >= 0.70) {
    return { decision: "PHASE_B", reason: `farmer-medium wipe_rate_LB ${(lb*100).toFixed(1)}% ≥ 70%. Medium is clearly broken. Ship Phase B tune.` };
  }
  return { decision: "PHASE_B_BORDERLINE", reason: `farmer-medium wipe_rate ${(rate*100).toFixed(1)}% [${(lb*100).toFixed(1)}%–${(ub*100).toFixed(1)}%], CI overlaps 40%. Borderline — Phase B tune likely helpful but may be premature. Re-measure after.` };
}

async function updateStatusMd(agg, gate, outJsonPath) {
  const current = await readFile(STATUS_MD, "utf8");
  const timestamp = new Date().toISOString().slice(0, 10);
  const scenariosTable = SCENARIOS.map((s) => {
    const r = agg[s.name];
    if (!r) return `| ${s.name} | — | — | — | — | — |`;
    const [lb, ub] = r.wipe_rate_ci95;
    return `| ${s.name} | ${r.n} | ${(r.wipe_rate*100).toFixed(1)}% | [${(lb*100).toFixed(1)}%–${(ub*100).toFixed(1)}%] | ${r.median_miles ?? "—"} | ${r.median_first_death_day ?? "—"} |`;
  }).join("\n");

  let phaseBState = "⚪ gated on A";
  if (gate.decision === "STOP") phaseBState = "🟢 not needed (A decision: STOP)";
  else if (gate.decision.startsWith("PHASE_B")) phaseBState = "🟡 triggered — implementing";

  const farmerBucket = agg["farmer-steady-medium"];
  const farmerCI = farmerBucket ? `[${(farmerBucket.wipe_rate_ci95[0]*100).toFixed(1)}–${(farmerBucket.wipe_rate_ci95[1]*100).toFixed(1)}%]` : "—";
  const farmerRate = farmerBucket ? `${(farmerBucket.wipe_rate*100).toFixed(1)}%` : "—";

  const updated = current
    .replace(/## 🎯 CURRENT PHASE: .+\n\n\*\*Status:\*\* .+/, `## 🎯 CURRENT PHASE: ${gate.decision === "STOP" ? "Complete (A STOP)" : "Phase B — Medium tune"}\n\n**Status:** ${gate.decision === "STOP" ? "🟢 done — Phase A measurement shipped, no further changes needed" : "🟡 Phase A complete, Phase B triggered"}`)
    .replace(/\| \*\*A\*\* — Measure .+\|/, `| **A** — Measure 30 playthroughs, decide STOP/B | 🟢 done | ${gate.decision} | see calibration JSON | ${timestamp} |`)
    .replace(/\| \*\*B\*\* — Disease ×0\.7.+\|/, `| **B** — Disease ×0.7, starvation grace 3→4 | ${phaseBState} | — | — | ${gate.decision !== "STOP" ? timestamp : "—"} |`)
    .replace(/\*\*Calibration JSON:\*\* .+/, `**Calibration JSON:** \`${outJsonPath}\``)
    .replace(/\*\*Scenarios run:\*\* .+/, `**Scenarios run:** ${Object.values(agg).reduce((s, r) => s + r.n, 0)} / 30`)
    .replace(
      /\| Scenario \| N \| Wipe rate \| 95% CI \| Median miles \| First-death day \|\n\|[^\n]+\|\n(\| [^\n]+\n)+/,
      `| Scenario | N | Wipe rate | 95% CI | Median miles | First-death day |\n|---|---|---|---|---|---|\n${scenariosTable}\n`,
    )
    .replace(
      /\| # \| Date \| Phase \| Decision \| Data \| Rationale \|\n\|[^\n]+\|\n\| — \| — \| — \| — \| — \| — \|/,
      `| # | Date | Phase | Decision | Data | Rationale |\n|---|---|---|---|---|---|\n| 1 | ${timestamp} | A | ${gate.decision} | wipe ${farmerRate} CI ${farmerCI} | ${gate.reason.slice(0, 160)} |`,
    );

  await writeFile(STATUS_MD, updated);
  console.log(`\n📝 Updated ${STATUS_MD}`);
}

async function run() {
  const totalRuns = SCENARIOS.reduce((s, x) => s + x.runs, 0);
  console.log(`\nCALIBRATION HARNESS (Phase A)`);
  console.log(`URL: ${URL}`);
  console.log(`Scenarios: ${SCENARIOS.length} | Total runs: ${totalRuns} | Parallelism: ${PARALLEL}\n`);

  const tasks = [];
  for (const s of SCENARIOS) for (let i = 0; i < s.runs; i++) tasks.push([s, i + 1]);
  const startedAt = Date.now();
  const results = await runBatch(tasks, PARALLEL);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\nAll ${totalRuns} runs complete in ${elapsed}s.\n`);

  const agg = aggregate(results);
  const gate = decideGate(agg);

  const report = {
    run_date: new Date().toISOString(),
    url: URL,
    scenarios: agg,
    gate,
    all_runs: results.map((r) => ({
      scenario: r.scenario, run: r.run, outcome: r.outcome, miles: r.miles,
      survivors: r.survivors, eventsHandled: r.eventsHandled, firstDeathDay: r.firstDeathDay,
      deaths: r.deaths.map((d) => `${d.name} — ${d.cause} (${d.date})`),
    })),
  };
  await writeFile(OUT_JSON, JSON.stringify(report, null, 2));

  console.log("=== Calibration summary ===\n");
  for (const [name, s] of Object.entries(agg)) {
    const [lb, ub] = s.wipe_rate_ci95;
    console.log(`  ${name}: N=${s.n}, wipe=${(s.wipe_rate*100).toFixed(1)}% [${(lb*100).toFixed(1)}%–${(ub*100).toFixed(1)}%], median ${s.median_miles}mi, early-death ${(s.first_10_days_fatality_rate*100).toFixed(1)}%`);
  }
  console.log(`\n=== GATE DECISION ===`);
  console.log(`  ${gate.decision}`);
  console.log(`  ${gate.reason}\n`);
  console.log(`Report: ${OUT_JSON}`);

  await updateStatusMd(agg, gate, OUT_JSON);
  process.exit(gate.decision === "STOP" ? 0 : 10);
}

run().catch((err) => {
  console.error("measure-calibration fatal:", err);
  process.exit(1);
});
