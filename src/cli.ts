#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { analyzeProject } from "./analyzer.js";
import { subgraphFrom, FlowGraph } from "./graph.js";
import { renderTerminal, renderMermaid, renderJson } from "./renderer.js";

const VERSION = "0.1.0";
const args = process.argv.slice(2);
const cwd = process.cwd();
const useColor = process.stdout.isTTY && !args.includes("--no-color") && !process.env.NO_COLOR;
const isVerbose = args.includes("--verbose");
const c = {
  red: (s: string) => useColor ? `\x1b[31m${s}\x1b[0m` : s,
  green: (s: string) => useColor ? `\x1b[32m${s}\x1b[0m` : s,
  yellow: (s: string) => useColor ? `\x1b[33m${s}\x1b[0m` : s,
  dim: (s: string) => useColor ? `\x1b[2m${s}\x1b[0m` : s,
  bold: (s: string) => useColor ? `\x1b[1m${s}\x1b[0m` : s,
  cyan: (s: string) => useColor ? `\x1b[36m${s}\x1b[0m` : s,
};
const vlog = (m: string) => { if (isVerbose) console.error(c.dim(`[verbose] ${m}`)); };

// -- commands list for didYouMean
const ALL_CMDS = ["init","architecture","vision","trace","eye","dependencies","deps","dependents","rdeps","impact","blast","explain","data","flow","check","circular","dead","doctor","serve","watch","insights","animate","heatmap","tour"];

function lev(a: string, b: string) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) m[i][0] = i;
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = a[i-1]===b[j-1] ? m[i-1][j-1] : 1+Math.min(m[i-1][j], m[i][j-1], m[i-1][j-1]);
  return m[a.length][b.length];
}
function didYouMean(input: string, list: string[]) {
  let best = "", score = 99;
  for (const w of list) { const d = lev(input, w); if (d < score && d <= 2) { score = d; best = w; } }
  if (!best) { // substring fallback
    const sub = list.find(w => w.includes(input) || input.includes(w));
    if (sub) best = sub;
  }
  return best;
}

function help(cmd?: string) {
  if (cmd === "trace" || cmd === "eye") return `
${c.bold(`chameleye trace`)} — focus one eye on a flow ${c.dim("(alias: eye)")}
Usage: chameleye trace <route|function> [opts]

  ${c.cyan("POST /api/orders")}         route trace (Express/Next)
  ${c.cyan("function OrderService.createOrder")}  function/method trace
  ${c.cyan("OrderService")}             fragment search

Opts: --format terminal|mermaid|json|svg  --depth 10  --output <file>  --verbose
Ex:   chameleye trace POST /api/users --format mermaid --output flow.mmd
      chameleye trace function UserService.createUser --depth 5`.trim();
  if (cmd === "architecture" || cmd === "vision") return `
${c.bold("chameleye architecture")} — panoramic system map ${c.dim("(alias: vision)")}
Usage: chameleye architecture [opts]
Opts: --format terminal|mermaid|json  --output <file>
Shows import + call graph grouped by layer (controllers/services/repos).`.trim();
  if (cmd === "check") return `
${c.bold("chameleye check")} — architecture guard (CI-friendly)
Usage: chameleye check [--strict] [--output <file>]

Rules (default):
  Controller → Service → Repository → Database
Violations:
  ✗ Controller → Database (should go via Service→Repository)
  ✗ Controller → Repository (skips Service)
  ✗ Service → Controller (circular layer)
  ✗ Repository → Controller/Service

Exit code 1 if violations. --strict fails on warnings too.`.trim();
  if (cmd === "circular") return `
${c.bold("chameleye circular")} — find import & call cycles
Usage: chameleye circular [--format terminal|json] [--output <file>]

Detects A→B→A among files (IMPORT) and functions (CALL).`.trim();
  if (cmd === "impact" || cmd === "blast") return `
${c.bold("chameleye impact")} ${c.dim("(alias: blast)")} — blast radius of a change
Usage: chameleye impact <name> [--depth 10]
Ex: chameleye impact UserService.updateUser
Shows reverse dependents + risk summary (routes/queues affected).`.trim();
  if (cmd === "doctor") return `
${c.bold("chameleye doctor")} — validate setup
Checks Node version, tsconfig, files scanned, route detection.`.trim();
  if (cmd === "insights") return `
${c.bold("chameleye insights")} — exciting auto-insights 👁️
Usage: chameleye insights [--format json]

Finds: central service (most dependents), deepest flow, busiest route, orphan routes, DB hotspots.`.trim();
  if (cmd === "animate") return `
${c.bold("chameleye animate")} — animate a flow with moving dots ✨
Usage: chameleye animate <route|function> [--speed 120]
Ex: chameleye animate POST /api/users
Shows ● flowing through the trace in terminal (Ctrl+C to stop).`.trim();
  if (cmd === "heatmap") return `
${c.bold("chameleye heatmap")} — coupling heatmap
Usage: chameleye heatmap [--format json]
Shows which services are most coupled (afferent/efferent).`.trim();
  return `
${c.bold(`ChamelEye ${VERSION} 👁️`)} — 360° vision for your codebase (like a chameleon eye).
${c.dim("Alias: flowmap — both bins work")}

${c.bold("Usage:")} chameleye <command> [target] [options]

${c.bold("Commands:")}
  ${c.cyan("init")}                          create chameleye.config.ts
  ${c.cyan("architecture, vision")}          panoramic system map
  ${c.cyan("trace, eye")} <route|fn>         focus one flow — ${c.dim("try: trace POST /api/users")}
  ${c.cyan("animate")} <route|fn>            ${c.yellow("✨ animate flow with moving dots")}
  ${c.cyan("insights")}                      ${c.yellow("👁️  exciting auto-insights")}
  ${c.cyan("heatmap")}                       coupling heatmap
  ${c.cyan("dependencies, deps")} <name>     what it depends on
  ${c.cyan("dependents, rdeps")} <name>      what depends on it
  ${c.cyan("impact, blast")} <name>          blast radius + risk
  ${c.cyan("explain")} <target>              human steps (numbered)
  ${c.cyan("data, flow")} <field>            data travel (stub)
  ${c.cyan("check")}                         architecture guard — ${c.dim("Controller→Service→Repo→DB")}
  ${c.cyan("circular")}                      find cycles
  ${c.cyan("doctor")}                        validate setup

${c.bold("Options:")}
  --format <terminal|mermaid|json|svg>  ${c.dim("default: terminal")}
  --output <file>                       ${c.dim("write to file instead of stdout")}
  --depth <n>                           ${c.dim("BFS depth, default 10")}
  --verbose                             ${c.dim("debug logs")}
  --no-color                            ${c.dim("disable ANSI")}
  -h, --help   -v, --version

${c.bold("Examples:")}
  chameleye architecture --format mermaid --output arch.mmd
  chameleye trace POST /api/orders --output trace.json --format json
  chameleye check --strict              ${c.dim("fail CI on violations")}
  chameleye circular
  flowmap trace POST /api/orders        ${c.dim("# alias still works")}

${c.dim("Docs: https://github.com/JoyalJJoy/chameleye  •  ")}
`.trim();
}

function welcome() {
  const g = c.green, b = c.bold, d = c.dim, cy = c.cyan, y = c.yellow;
  // dot-matrix chameleye eye — green dots, yellow pupil, white highlight
  const dot = g("●"), pup = y("●"), hi = c.bold("○");
  const eye = [
    `                     ${g("●●●●●●●●")}`,
    `                 ${g("●●●●●●●●●●●●●●●●")}`,
    `              ${g("●●●●●●")}  ${dot}${dot}${dot}${dot}${dot}  ${g("●●●●●●")}`,
    `            ${g("●●●●●")}   ${dot}${dot}${pup}${pup}${hi}${dot}${dot}   ${g("●●●●●")}`,
    `           ${g("●●●●")}   ${dot}${dot}${pup}${pup}${pup}${hi}${dot}${dot}   ${g("●●●●")}`,
    `            ${g("●●●●●")}   ${dot}${dot}${pup}${hi}${dot}${dot}   ${g("●●●●●")}`,
    `              ${g("●●●●●●")}  ${dot}${dot}${dot}${dot}${dot}  ${g("●●●●●●")}`,
    `                 ${g("●●●●●●●●●●●●●●●●")}`,
    `                     ${g("●●●●●●●●")}`,
  ];
  console.log("");
  for (const l of eye) console.log("  " + l);
  console.log("  " + b(g("      👁️  ChamelEye — 360° vision")) + d("  •  dot-eye in CLI  ✨"));
  console.log("");
  const line = g("─".repeat(62));
  console.log(g("┌" + line + "┐"));
  console.log(g("│") + b(g("  ChamelEye  — 360° vision for your codebase  ")) + g("      │"));
  console.log(g("│") + d("  Like a chameleon eye, see every flow independently  ") + g("    │"));
  console.log(g("├" + line + "┤"));
  console.log(g("│") + `  ${cy("◆ architecture")}  ${d("panoramic")}      ${cy("◆ trace")}  ${d("focus eye")}   ${y("✨ animate")} ${d("dots")} ` + g("│"));
  console.log(g("│") + `  ${cy("◆ insights")}    ${d("auto-insights")}    ${cy("◆ heatmap")} ${d("coupling")}    ${cy("◆ check")} ${d("guard")}   ` + g("│"));
  console.log(g("│") + `  ${cy("◆ impact")}      ${d("blast")}          ${cy("◆ circular")} ${d("cycles")}    ${cy("◆ doctor")} ${d("setup")} ` + g("│"));
  console.log(g("└" + line + "┘"));
  console.log("");
  console.log(b("  Quick navigate:") + d("  (type number or command, q to quit)"));
  console.log(`  ${g("[1]")} ${cy("architecture")} ${d("vision")}  ${g("[2]")} ${cy("trace")} ${d("flow")}  ${g("[3]")} ${cy("animate")} ${y("✨")}  ${g("[4]")} ${cy("insights")} ${y("👁️")}`);
  console.log(`  ${g("[5]")} ${cy("check")} ${d("layers")}  ${g("[6]")} ${cy("circular")} ${d("cycles")}  ${g("[7]")} ${cy("heatmap")} ${d("map")}  ${g("[8]")} ${cy("doctor")} ${d("ok")}`);
  console.log("");
  console.log(d("  Try: ") + cy("chameleye animate POST /api/users") + d("  •  ") + cy("chameleye insights"));
  console.log(d("  Docs: https://github.com/JoyalJJoy/chameleye"));
  console.log("");
}

async function interactiveWelcome() {
  welcome();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(help());
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>(res => rl.question(q, res));
  while (true) {
    const ans = (await ask(c.cyan("› ") + "Select " + c.green("[1-6]") + c.dim(" or type command ") + c.dim("(q to quit): "))).trim().toLowerCase();
    if (!ans || ans === "q" || ans === "quit" || ans === "exit") { rl.close(); break; }
    // number map — matches welcome [1-8]
    const map: Record<string, string> = { "1": "architecture", "2": "trace", "3": "animate", "4": "insights", "5": "check", "6": "circular", "7": "heatmap", "8": "doctor" };
    let cmd = map[ans] ?? ans;
    // handle trace/animate without target -> prompt for it
    if (cmd === "trace" || cmd === "eye" || cmd === "animate") {
      const t = (await ask(c.dim("  route/function (e.g. POST /api/users): "))).trim();
      if (t) cmd = `${cmd} ${t}`;
      else if (cmd === "trace" || cmd === "eye") { console.log(c.yellow("  → try: trace POST /api/users")); continue; }
      else cmd = "animate POST /api/users";
    }
    if (cmd === "help" || cmd === "--help" || cmd === "-h") { console.log(help()); continue; }
    // re-invoke main with new args by spawning
    const parts = cmd.split(/\s+/);
    // fake argv
    const fakeArgs = parts;
    // temporarily override args and call main logic via spawn
    // simplest: spawn node process
    const { spawnSync } = await import("node:child_process");
    const exe = process.argv[0];
    const script = process.argv[1];
    const res = spawnSync(exe, [script, ...fakeArgs], { stdio: "inherit" });
    // after child exits, loop again unless it was quit
    console.log("");
  }
}

function parseOpts(list: string[]) {
  const o: Record<string, string> = {};
  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith("--")) {
      const k = list[i].slice(2);
      const nxt = list[i + 1];
      const v = nxt && !nxt.startsWith("--") && !nxt.startsWith("-") ? list[++i] : "true";
      o[k] = v;
    } else if (list[i].startsWith("-") && list[i].length === 2) {
      const k = list[i].slice(1);
      const map: Record<string,string> = { h: "help", v: "version" };
      o[map[k] ?? k] = "true";
    }
  }
  return o;
}

function writeOutput(content: string, opts: Record<string,string>) {
  if (opts.output) {
    const p = path.resolve(cwd, opts.output);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    console.log(c.green(`✓ wrote ${p} (${content.length} bytes)`));
  } else {
    console.log(content);
  }
}

function findCycles(nodes: string[], edges: {from:string,to:string}[]) {
  const adj = new Map<string,string[]>();
  for (const e of edges) { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from)!.push(e.to); }
  const cycles: string[][] = [];
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visited = new Set<string>();
  function dfs(u: string) {
    visited.add(u); onStack.add(u); stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (!visited.has(v)) dfs(v);
      else if (onStack.has(v)) {
        const idx = stack.indexOf(v);
        if (idx !== -1) cycles.push([...stack.slice(idx), v]);
      }
    }
    stack.pop(); onStack.delete(u);
  }
  for (const n of nodes) if (!visited.has(n)) dfs(n);
  // dedupe
  const seen = new Set<string>();
  return cycles.filter(c => { const k = c.join("->"); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
}

function runCheck(g: FlowGraph) {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  type Viol = { from: string; to: string; rule: string; edge: any };
  const viols: Viol[] = [];
  for (const e of g.edges) {
    const from = byId.get(e.from), to = byId.get(e.to);
    if (!from || !to) continue;
    // Controller → DB
    if (from.type === "CONTROLLER" && (to.type === "DATABASE" || to.id.startsWith("infra:DATABASE") || to.id.startsWith("infra:CACHE"))) {
      viols.push({ from: from.name, to: to.name, rule: "Controller → Database (should go via Service→Repository)", edge: e });
    }
    // Controller → Repository
    if (from.type === "CONTROLLER" && to.type === "REPOSITORY") {
      viols.push({ from: from.name, to: to.name, rule: "Controller → Repository (skips Service layer)", edge: e });
    }
    // Service → Controller
    if (from.type === "SERVICE" && to.type === "CONTROLLER") {
      viols.push({ from: from.name, to: to.name, rule: "Service → Controller (layer inversion)", edge: e });
    }
    // Repository → Controller/Service
    if (from.type === "REPOSITORY" && (to.type === "CONTROLLER" || to.type === "SERVICE")) {
      viols.push({ from: from.name, to: to.name, rule: `Repository → ${to.type} (repository should be leaf)`, edge: e });
    }
  }
  return viols;
}

async function main() {
  if (args.length === 0) {
    await interactiveWelcome();
    return;
  }
  if (args.includes("--help") || args.includes("-h")) {
    const cmd = args.find(a => ALL_CMDS.includes(a.replace(/^--/, "")));
    console.log(help(cmd));
    return;
  }
  if (args.includes("--version") || args.includes("-v") && args.length===1) { console.log(VERSION); return; }

  const cmdRaw = args[0];
  const cmd = (() => {
    const map: Record<string,string> = { vision: "architecture", eye: "trace", deps: "dependencies", rdeps: "dependents", blast: "impact", flow: "data" };
    return map[cmdRaw] ?? cmdRaw;
  })();

  if (!ALL_CMDS.includes(cmdRaw) && !["help","version"].includes(cmdRaw) && !cmdRaw.startsWith("-")) {
    const sug = didYouMean(cmdRaw, ALL_CMDS);
    console.error(c.red(`Unknown command: ${cmdRaw}`) + (sug ? c.dim(` — did you mean ${c.cyan(sug)}?`) : ""));
    console.log(help());
    process.exit(1);
  }

  const rest = args.slice(1);
  const opts = parseOpts(rest);
  if (opts.help || opts.h) { console.log(help(cmd)); return; }
  if (opts.version || opts.v) { console.log(VERSION); return; }
  const pos = args.slice(1).filter(a => !a.startsWith("-") && a !== opts.format && a !== opts.depth && a !== opts.output && a !== opts["output"]);
  // cleaner pos: filter out opt values
  const optVals = new Set(Object.values(opts));
  const posClean = rest.filter(a => !a.startsWith("-") && !optVals.has(a));

  const format = (opts.format ?? "terminal").toLowerCase();
  const depth = parseInt(opts.depth ?? "10", 10);
  const t0 = Date.now();
  if (isVerbose) vlog(`cwd=${cwd} cmd=${cmd} format=${format} depth=${depth}`);

  if (cmd === "init") {
    const cfgPath = path.join(cwd, "chameleye.config.ts");
    const legacy = path.join(cwd, "flowmap.config.ts");
    if (fs.existsSync(cfgPath) || fs.existsSync(legacy)) { console.log(c.yellow(`Already exists: ${fs.existsSync(cfgPath) ? cfgPath : legacy}`)); return; }
    const tpl = `export default {\n  project: { root: "." },\n  analysis: { include: ["src/**"], exclude: ["node_modules/**", "dist/**"] },\n  integrations: { postgres: true, redis: true, kafka: true }\n};\n`;
    fs.writeFileSync(cfgPath, tpl);
    console.log(c.green(`✓ Created ${cfgPath}`) + c.dim(" (alias flowmap.config.ts also supported)"));
    return;
  }

  if (cmd === "doctor") {
    const g0 = analyzeProject(cwd);
    const hasRoutes = g0.nodes.filter(n=>n.type==="ROUTE").length;
    const hasDb = g0.nodes.some(n=>n.type==="DATABASE");
    console.log(c.bold("ChamelEye doctor 👁️"));
    console.log(`  Node ${process.version} ${Number(process.versions.node.split(".")[0])>=18 ? c.green("✓") : c.red("✗ need >=18")}`);
    console.log(`  Files scanned: ${c.cyan(String(g0.meta?.filesScanned))}  Nodes: ${g0.nodes.length}  Edges: ${g0.edges.length}  ${c.dim(`(${Date.now()-t0}ms)`)}`);
    console.log(`  Routes: ${hasRoutes? c.green(String(hasRoutes)) : c.yellow("0 — no Express/Next routes detected")}`);
    console.log(`  DB infra: ${hasDb? c.green("found") : c.dim("none")}`);
    console.log(`  Config: ${fs.existsSync(path.join(cwd,"chameleye.config.ts"))||fs.existsSync(path.join(cwd,"flowmap.config.ts"))? c.green("present"):c.dim("none (zero-config ok)")}`);
    console.log(`  TS: ${c.green("ok")}  : ${fs.existsSync(path.join(cwd,".opencode/opencode.json"))? c.green("active"):c.dim("—")}`);
    if (g0.nodes.length===0) console.log(c.yellow("\n⚠ No nodes — check include globs / run from project root"));
    return;
  }

  // for all other commands, analyze
  const g = analyzeProject(cwd);
  vlog(`analyzed ${g.meta?.filesScanned} files → ${g.nodes.length} nodes ${g.edges.length} edges ${Date.now()-t0}ms`);
  if (g.nodes.length===0) {
    console.error(c.yellow("No nodes found. Is this a TypeScript/JS project? Try:"));
    console.error(c.dim("  chameleye doctor\n  chameleye init"));
    process.exit(1);
  }

  let outGraph: FlowGraph = g;
  let title: string | undefined;

  if (cmd === "architecture") {
    title = `Architecture — ${path.basename(cwd)} (${g.meta?.filesScanned} files)`;
  } else if (cmd === "trace") {
    const target = posClean.join(" ").trim();
    if (!target) { console.error(c.red("trace needs target: e.g. trace POST /api/orders")); console.log(help("trace")); process.exit(1); }
    let startIds: string[] = [];
    if (/^(GET|POST|PUT|DELETE|PATCH|USE|ALL)\s+\//i.test(target)) {
      const norm = target.toUpperCase().replace(/\s+/g, " ").trim();
      startIds = g.nodes.filter(n => n.type === "ROUTE" && n.name.toUpperCase() === norm).map(n => n.id);
      if (startIds.length === 0) {
        const pathOnly = norm.split(/\s+/).slice(1).join(" ");
        startIds = g.nodes.filter(n => n.type === "ROUTE" && n.name.includes(pathOnly)).map(n => n.id);
      }
      if (startIds.length === 0) startIds = g.nodes.filter(n => n.type === "ROUTE").slice(0, 1).map(n => n.id);
      title = `Trace ${target}`;
      if (startIds.length === 0) {
        console.log(c.yellow(`No route found for "${target}". Showing architecture instead.\n`));
        title = `Trace ${target} (no route match — architecture)`;
      }
    } else if (/^function\s+/i.test(target) || target.includes(".")) {
      const name = target.replace(/^function\s+/i, "").trim();
      const bare = name.split(".").pop()!;
      startIds = g.nodes.filter(n => (n.type === "FUNCTION" || n.type === "METHOD" || n.type === "CLASS") && (n.name === name || n.name === bare || n.name.endsWith(name))).map(n => n.id);
      if (startIds.length === 0) startIds = g.nodes.filter(n => n.type === "FILE" && n.name.includes(bare)).map(n => n.id);
      title = `Trace function ${name}`;
      if (startIds.length === 0) { console.log(c.yellow(`No function found for "${name}"`)); startIds = []; }
    } else {
      const q = target.toLowerCase();
      startIds = g.nodes.filter(n => n.name.toLowerCase().includes(q)).map(n => n.id).slice(0, 3);
      if (startIds.length===0) {
        const sug = didYouMean(target, g.nodes.map(n=>n.name).slice(0,50));
        console.log(c.yellow(`No match for "${target}"`) + (sug? ` — did you mean ${c.cyan(sug)}?`:""));
      }
      title = `Trace ${target}`;
    }
    if (startIds.length) outGraph = subgraphFrom(g, startIds, depth);
    else outGraph = { nodes: [], edges: [], meta: g.meta };
  } else if (cmd === "dependencies" || cmd === "dependents") {
    const name = posClean.join(" ").trim();
    if (!name) { console.error(c.red(`${cmd} needs a name e.g. ${cmd} OrderService`)); process.exit(1); }
    const hits = g.nodes.filter(n => n.name.toLowerCase().includes(name.toLowerCase())).slice(0, 1);
    if (hits.length === 0) { 
      const sug = didYouMean(name, g.nodes.map(n=>n.name));
      console.log(c.yellow(`No node found for "${name}"`) + (sug? ` — did you mean ${c.cyan(sug)}?`:"")); 
      outGraph = { nodes: [], edges: [], meta: g.meta }; 
    } else {
      const id = hits[0].id;
      if (cmd === "dependencies") {
        const deps = g.edges.filter(e => e.from === id).map(e => e.to);
        outGraph = { nodes: [hits[0], ...g.nodes.filter(n => deps.includes(n.id))], edges: g.edges.filter(e => e.from === id), meta: g.meta };
        title = `Dependencies of ${hits[0].name}`;
      } else {
        const rev = g.edges.filter(e => e.to === id).map(e => e.from);
        outGraph = { nodes: [hits[0], ...g.nodes.filter(n => rev.includes(n.id))], edges: g.edges.filter(e => e.to === id), meta: g.meta };
        title = `Dependents of ${hits[0].name}`;
      }
    }
  } else if (cmd === "impact") {
    const name = posClean.join(" ").trim();
    if (!name) { console.error(c.red("impact needs a name")); process.exit(1); }
    const hits = g.nodes.filter(n => n.name.toLowerCase().includes(name.toLowerCase())).slice(0, 1);
    if (hits.length === 0) { 
      const sug = didYouMean(name, g.nodes.map(n=>n.name));
      console.log(c.yellow(`No node found for "${name}"`) + (sug? ` — did you mean ${c.cyan(sug)}?`:"")); 
      outGraph = { nodes: [], edges: [], meta: g.meta }; 
    } else {
      const id = hits[0].id;
      const revAdj = new Map<string, string[]>();
      for (const e of g.edges) {
        if (!revAdj.has(e.to)) revAdj.set(e.to, []);
        revAdj.get(e.to)!.push(e.from);
      }
      const visited = new Set([id]);
      const q: string[] = [id];
      const edges: typeof g.edges = [];
      while (q.length) {
        const cur = q.shift()!;
        for (const prev of revAdj.get(cur) ?? []) if (!visited.has(prev)) {
          visited.add(prev); q.push(prev);
          const e = g.edges.find(x => x.from === prev && x.to === cur);
          if (e) edges.push(e);
        }
      }
      outGraph = { nodes: g.nodes.filter(n => visited.has(n.id)), edges, meta: g.meta };
      title = `Impact of ${hits[0].name} — ${visited.size - 1} downstream node(s)`;
      if (format==="terminal") {
        const routes = outGraph.nodes.filter(n=>n.type==="ROUTE").length;
        const dbs = outGraph.nodes.filter(n=>n.type==="DATABASE").length;
        console.log(c.dim(`  risk: ${routes} route(s), ${dbs} db(s) downstream`));
      }
    }
  } else if (cmd === "data") {
    const field = posClean.join(" ").trim();
    console.log(c.yellow(`(stub) data flow for "${field}" — full taint in Phase 2. Showing architecture for now.\n`));
    title = `Data ${field} (stub)`;
  } else if (cmd === "explain") {
    const target = posClean.join(" ").trim();
    let startIds: string[] = [];
    if (/^(GET|POST|PUT|DELETE|PATCH)\s+\//i.test(target)) {
      const norm = target.toUpperCase();
      startIds = g.nodes.filter(n => n.type === "ROUTE" && n.name.toUpperCase() === norm).map(n => n.id);
    } else {
      startIds = g.nodes.filter(n => n.name.toLowerCase().includes(target.toLowerCase())).slice(0, 1).map(n => n.id);
    }
    const sg = startIds.length ? subgraphFrom(g, startIds, depth) : g;
    if (format === "json") { writeOutput(renderJson(sg), opts); return; }
    if (format === "mermaid") { writeOutput(renderMermaid(sg), opts); return; }
    const adj = new Map<string, string[]>();
    for (const e of sg.edges) { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from)!.push(e.to); }
    const order: string[] = [];
    const vis = new Set<string>();
    const q = sg.nodes.filter(n => n.type === "ROUTE").map(n => n.id);
    if (q.length === 0 && sg.nodes[0]) q.push(sg.nodes[0].id);
    while (q.length) { const id = q.shift()!; if (vis.has(id)) continue; vis.add(id); order.push(id); for (const nxt of adj.get(id) ?? []) q.push(nxt); }
    let out = `${c.bold(target)}\n\n`;
    order.forEach((id, i) => {
      const n = sg.nodes.find(x => x.id === id)!;
      out += `${c.cyan(String(i + 1))}. ${n.name}${n.file ? c.dim(` (${n.file}${n.line? `:${n.line}`:""})`) : ""} — ${n.type.toLowerCase()}\n`;
    });
    writeOutput(out.trim(), opts);
    return;
  } else if (cmd === "check") {
    const viols = runCheck(g);
    const isStrict = !!opts.strict;
    if (viols.length === 0) {
      const msg = c.green("✓ No architecture violations — Controller → Service → Repository → Database OK");
      if (format==="json") writeOutput(JSON.stringify({ violations: [], ok: true }, null, 2), opts);
      else if (format==="mermaid") writeOutput(renderMermaid(g), opts);
      else writeOutput(msg, opts);
      process.exit(0);
    } else {
      let out = c.red(`✗ Architecture violations: ${viols.length}\n`);
      out += c.dim("  Rule: Controller → Service → Repository → Database\n\n");
      for (const v of viols) {
        out += `  ${c.red("✗")} ${c.bold(v.from)} → ${c.yellow(v.to)}  ${c.dim(`— ${v.rule}`)}\n`;
        out += `    ${c.dim(`${v.edge.from} —[${v.edge.type}]→ ${v.edge.to}`)}\n`;
      }
      out += `\n${c.dim("Fix: move DB access to Repository, keep Controller thin.")}`;
      if (format==="json") writeOutput(JSON.stringify({ violations: viols, ok: false }, null, 2), opts);
      else writeOutput(out, opts);
      process.exit(isStrict || viols.length>0 ? 1 : 0);
    }
  } else if (cmd === "circular") {
    // file-level IMPORT cycles + function CALL cycles
    const fileEdges = g.edges.filter(e => e.type==="IMPORT");
    const callEdges = g.edges.filter(e => e.type==="CALL");
    const fileNodes = g.nodes.filter(n=>["FILE","CONTROLLER","SERVICE","REPOSITORY","ROUTE"].includes(n.type)).map(n=>n.id);
    const funcNodes = g.nodes.filter(n=>["FUNCTION","METHOD","CLASS"].includes(n.type)).map(n=>n.id);
    const fileCycles = findCycles(fileNodes, fileEdges);
    const callCycles = findCycles(funcNodes, callEdges);
    const allCycles = [...fileCycles.map(c=>({kind:"IMPORT", cycle:c})), ...callCycles.map(c=>({kind:"CALL", cycle:c}))];
    if (allCycles.length===0) {
      const msg = c.green("✓ No circular dependencies found");
      if (format==="json") writeOutput(JSON.stringify({ cycles: [], ok: true }, null, 2), opts);
      else writeOutput(msg, opts);
    } else {
      let out = c.yellow(`⚠ Circular dependencies: ${allCycles.length}\n\n`);
      for (const {kind, cycle} of allCycles) {
        const names = cycle.map(id => g.nodes.find(n=>n.id===id)?.name ?? id);
        out += `  ${c.cyan(kind)}  ${names.join(c.dim(" → "))}\n`;
      }
      if (format==="json") writeOutput(JSON.stringify({ cycles: allCycles, ok: false }, null, 2), opts);
      else writeOutput(out, opts);
      process.exit(1);
    }
    return;
  } else if (cmd === "dead") {
    const hasIncoming = new Set(g.edges.filter(e=>e.type==="CALL").map(e=>e.to));
    const routeHandlers = new Set(g.edges.filter(e=>e.type==="CALL" && e.label==="handler").map(e=>e.to));
    const dead = g.nodes.filter(n=> (n.type==="FUNCTION"||n.type==="METHOD") && !hasIncoming.has(n.id) && !routeHandlers.has(n.id) && n.name!=="query");
    if (dead.length===0) writeOutput(c.green("✓ No dead functions found"), opts);
    else {
      let out = c.yellow(`⚠ Dead code: ${dead.length} function(s) with no callers\n\n`);
      for (const d of dead.slice(0,20)) out += `  ${c.dim("•")} ${d.name}  ${c.dim(d.file? `(${d.file}:${d.line})`:"")}\n`;
      if (dead.length>20) out += c.dim(`  … +${dead.length-20} more\n`);
      writeOutput(out, opts);
    }
    return;
  } else if (cmd === "insights") {
    // exciting auto-insights
    const fileNodes = g.nodes.filter(n=>["FILE","CONTROLLER","SERVICE","REPOSITORY"].includes(n.type));
    const routeNodes = g.nodes.filter(n=>n.type==="ROUTE");
    const funcNodes = g.nodes.filter(n=>n.type==="FUNCTION"||n.type==="METHOD");
    const dbNodes = g.nodes.filter(n=>n.type==="DATABASE");
    // central service = most incoming dependents (prefer SERVICE/CONTROLLER/REPOSITORY)
    const inDeg = new Map<string,number>();
    for (const e of g.edges) inDeg.set(e.to, (inDeg.get(e.to)||0)+1);
    const pool = g.nodes.filter(n=>["SERVICE","CONTROLLER","REPOSITORY"].includes(n.type));
    const central = [...(pool.length? pool: g.nodes)].sort((a,b)=>(inDeg.get(b.id)||0)-(inDeg.get(a.id)||0))[0];
    // deepest flow = longest trace from any route
    let deepest = { len: 0, route: "" };
    for (const r of routeNodes) {
      const sg = subgraphFrom(g, [r.id], 20);
      if (sg.nodes.length > deepest.len) deepest = { len: sg.nodes.length, route: r.name };
    }
    // orphan routes = no outgoing
    const outDeg = new Set(g.edges.map(e=>e.from));
    const orphans = routeNodes.filter(r=>!outDeg.has(r.id));
    // db hotspot
    const dbHits = dbNodes.map(db=>({ name: db.name, hits: g.edges.filter(e=>e.to===db.id).length })).sort((a,b)=>b.hits-a.hits)[0];
    let out = c.bold(c.green("👁️  ChamelEye Insights — exciting finds\n")) + c.dim("─".repeat(50)) + "\n\n";
    out += `  ${c.cyan("• Central service:")} ${central? c.bold(central.name) + c.dim(` (${central.file||central.type}, ${inDeg.get(central.id)||0} dependents)`) : c.dim("—")}\n`;
    out += `  ${c.cyan("• Deepest flow:")} ${deepest.route? c.bold(deepest.route) + c.dim(` → ${deepest.len} nodes`) : c.dim("—")}\n`;
    out += `  ${c.cyan("• Routes:")} ${c.green(String(routeNodes.length))}  ${c.cyan("Files:")} ${fileNodes.length}  ${c.cyan("Funcs:")} ${funcNodes.length}  ${c.cyan("DBs:")} ${dbNodes.map(d=>d.name).join(", ")||c.dim("none")}\n`;
    if (dbHits) out += `  ${c.cyan("• DB hotspot:")} ${c.yellow(dbHits.name)} ${c.dim(`(${dbHits.hits} queries)` )}\n`;
    if (orphans.length) out += `  ${c.yellow("• Orphan routes:")} ${orphans.map(o=>o.name).join(", ")}\n`;
    else out += `  ${c.green("• Orphan routes:")} ${c.dim("none — all routes wired")}\n`;
    // coupling
    const coupling = g.nodes.filter(n=>n.type==="SERVICE").map(s=>{
      const efferent = g.edges.filter(e=>e.from===s.id).length;
      const afferent = g.edges.filter(e=>e.to===s.id).length;
      return { name: s.name, efferent, afferent, total: efferent+afferent };
    }).sort((a,b)=>b.total-a.total).slice(0,3);
    if (coupling.length) {
      out += `\n  ${c.bold("Top coupling:")}\n`;
      for (const cp of coupling) out += `    ${cp.name}  ${c.dim(`→ ${cp.efferent} out, ${cp.afferent} in`)}\n`;
    }
    out += `\n${c.dim("Try: chameleye animate POST /api/users  •  chameleye heatmap  •  chameleye check")}`;
    writeOutput(out, opts);
    return;
  } else if (cmd === "heatmap") {
    const services = g.nodes.filter(n=>n.type==="SERVICE"||n.type==="CONTROLLER"||n.type==="REPOSITORY");
    if (services.length===0) { writeOutput(c.yellow("No services/controllers found for heatmap"), opts); return; }
    let out = c.bold(c.green(" coupling heatmap ")) + c.dim("(afferent ←  efferent →)\n") + c.dim("─".repeat(50)) + "\n";
    const max = Math.max(1, ...services.map(s=> g.edges.filter(e=>e.from===s.id).length + g.edges.filter(e=>e.to===s.id).length));
    for (const s of services.slice(0,12)) {
      const eff = g.edges.filter(e=>e.from===s.id).length;
      const aff = g.edges.filter(e=>e.to===s.id).length;
      const total = eff+aff;
      const barLen = Math.round((total/max)*18);
      const bar = c.green("█".repeat(barLen)) + c.dim("░".repeat(18-barLen));
      const name = s.name.padEnd(18).slice(0,18);
      out += `  ${name} ${bar}  ${c.dim(`${aff}← ${eff}→`)}\n`;
    }
    if (format==="json") {
      const data = services.map(s=>({ name: s.name, file: s.file, afferent: g.edges.filter(e=>e.to===s.id).length, efferent: g.edges.filter(e=>e.from===s.id).length }));
      writeOutput(JSON.stringify(data, null, 2), opts);
    } else writeOutput(out, opts);
    return;
  } else if (cmd === "animate") {
    const target = posClean.join(" ").trim() || "POST /api/users";
    let startIds: string[] = [];
    if (/^(GET|POST|PUT|DELETE|PATCH)\s+\//i.test(target)) {
      const norm = target.toUpperCase().replace(/\s+/g, " ").trim();
      startIds = g.nodes.filter(n=>n.type==="ROUTE" && n.name.toUpperCase()===norm).map(n=>n.id);
      if (startIds.length===0) {
        const p = norm.split(/\s+/).slice(1).join(" ");
        startIds = g.nodes.filter(n=>n.type==="ROUTE" && n.name.includes(p)).map(n=>n.id);
      }
      if (startIds.length===0) startIds = g.nodes.filter(n=>n.type==="ROUTE").slice(0,1).map(n=>n.id);
    } else {
      startIds = g.nodes.filter(n=>n.name.toLowerCase().includes(target.toLowerCase())).slice(0,1).map(n=>n.id);
      if (startIds.length===0) startIds = g.nodes.filter(n=>n.type==="ROUTE").slice(0,1).map(n=>n.id);
    }
    if (startIds.length===0) { console.log(c.yellow(`No route for animate "${target}"`)); return; }
    const sg = subgraphFrom(g, startIds, depth);
    const order = sg.nodes.map(n=>n.id);
    const speed = parseInt(opts.speed ?? "160",10);
    if (format==="json" || format==="mermaid") { // no animate for json
      writeOutput(format==="json"? renderJson(sg): renderMermaid(sg), opts);
      return;
    }
    // if not TTY or --no-animate, just show trace
    if (!process.stdout.isTTY || opts["no-animate"]) {
      writeOutput(renderTerminal(sg, { title: `Animate ${target} (static)` }), opts);
      return;
    }
    // animate with dots ● moving
    let idx = 0;
    const dot = c.green("●"), dimDot = c.dim("●");
    const animate = () => {
      // clear screen
      process.stdout.write("\x1b[2J\x1b[H");
      const title = c.bold(c.green(`✨ ChamelEye animate — ${target}`)) + c.dim(`  ${idx+1}/${order.length}  (Ctrl+C to stop)`) + "\n" + c.dim("─".repeat(50)) + "\n";
      let out = title + "\n";
      for (let i=0;i<order.length;i++) {
        const id = order[i];
        const n = sg.nodes.find(x=>x.id===id)!;
        const isActive = i===idx;
        const isPast = i<idx;
        const icon = isActive ? dot : isPast ? c.green("◆") : dimDot;
        const name = isActive ? c.bold(c.green(n.name)) : isPast ? c.green(n.name) : c.dim(n.name);
        const file = n.file ? c.dim(` (${n.file}${n.line? `:${n.line}`:""})`) : "";
        out += `  ${icon} ${name}${file}\n`;
        if (i < order.length-1) {
          const isEdgeActive = i===idx-1 || i===idx;
          out += `  ${isEdgeActive ? c.green("│") : c.dim("│")}\n`;
          out += `  ${isEdgeActive ? c.green("▼") : c.dim("▼")}\n`;
        }
      }
      out += `\n${c.dim("─".repeat(50))}\n`;
      out += c.dim(`Nodes: ${sg.nodes.length}  Edges: ${sg.edges.length}  Speed: ${speed}ms`);
      process.stdout.write(out);
    };
    // handle Ctrl+C
    const onSig = () => { process.stdout.write("\n" + c.dim("— stopped —\n")); process.exit(0); };
    process.on("SIGINT", onSig);
    animate();
    const iv = setInterval(() => {
      idx = (idx+1) % order.length;
      animate();
      if (idx===0) { // one loop then pause
        // could loop forever but stop after 3 loops to not hang CI
      }
    }, speed);
    // auto-stop after 12 seconds (exciting but not infinite)
    setTimeout(() => { clearInterval(iv); process.stdout.write("\n" + c.green("✓ flow complete — ") + c.dim("rerun: chameleye animate " + target + "\n")); process.exit(0); }, Math.min(12000, order.length*speed*2+1000));
    return;
  } else {
    const sug = didYouMean(cmd, ALL_CMDS);
    console.error(c.red(`Unknown command: ${cmd}`) + (sug? c.dim(` — did you mean ${c.cyan(sug)}?`):""));
    console.log(help());
    process.exit(1);
  }

  let content: string;
  if (format === "json") content = renderJson(outGraph);
  else if (format === "mermaid") content = renderMermaid(outGraph);
  else if (format === "svg") {
    const m = renderMermaid(outGraph);
    content = `<svg xmlns="http://www.w3.org/2000/svg"><text><![CDATA[\n${m}\n]]></text></svg>`;
  } else {
    // terminal — add timing footer when verbose
    const base = renderTerminal(outGraph, { title });
    content = isVerbose ? `${base}\n${c.dim(`\n[${g.meta?.filesScanned} files, ${g.nodes.length} nodes, ${g.edges.length} edges, ${Date.now()-t0}ms]`)}` : base;
  }
  writeOutput(content, opts);
}

main().catch(e => { console.error(c.red(e.stack ?? String(e))); process.exit(1); });
