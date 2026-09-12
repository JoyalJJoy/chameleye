#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { analyzeProject } from "./analyzer.js";
import { subgraphFrom } from "./graph.js";
import { renderTerminal, renderMermaid, renderJson } from "./renderer.js";

const VERSION = "0.1.0";
const args = process.argv.slice(2);
const cwd = process.cwd();

function help() {
  return `
ChamelEye ${VERSION} 👁️ — 360° vision for your codebase (like a chameleon eye).

Usage: chameleye <command> [target] [options]   (alias: flowmap)

Commands:
  init                          create chameleye.config.ts
  architecture                  overall system map — panoramic view
  trace <target>                trace request/function flow — focus one eye
                                e.g. trace POST /api/orders
                                     trace function OrderService.createOrder
                                     trace OrderService
  data <field>                  track where data travels (stub)
  dependencies <name>           show dependencies of a service/function
  dependents <name>             show reverse dependencies
  impact <name>                 show impact of changing a function/service
  explain <target>              human-readable steps for a flow

Options:
  --format <terminal|mermaid|json|svg>   default: terminal
  --depth <n>                   BFS depth (default 10)
  --help, -h
  --version, -v

Examples:
  chameleye architecture
  chameleye trace POST /api/orders --format mermaid
  chameleye trace function UserService.create --format json
  flowmap trace POST /api/orders            # alias still works
`.trim();
}

function parseOpts(list: string[]) {
  const o: Record<string, string> = {};
  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith("--")) {
      const k = list[i].slice(2);
      const v = list[i + 1] && !list[i + 1].startsWith("--") ? list[++i] : "true";
      o[k] = v;
    }
  }
  return o;
}

async function main() {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) { console.log(help()); return; }
  if (args.includes("--version") || args.includes("-v")) { console.log(VERSION); return; }

  const cmd = args[0];
  const rest = args.slice(1);
  const opts = parseOpts(rest);
  const positional = rest.filter(a => !a.startsWith("--") && !Object.values(opts).includes(a));
  // better: positional = non-opt args
  const pos = args.slice(1).filter(a => !a.startsWith("--") && !Object.values(opts).includes(a) && a !== opts.format && a !== opts.depth);

  const format = (opts.format ?? "terminal").toLowerCase();
  const depth = parseInt(opts.depth ?? "10", 10);

  if (cmd === "init") {
    const cfgPath = path.join(cwd, "chameleye.config.ts");
    const legacy = path.join(cwd, "flowmap.config.ts");
    if (fs.existsSync(cfgPath) || fs.existsSync(legacy)) { console.log(`Already exists: ${fs.existsSync(cfgPath) ? cfgPath : legacy}`); return; }
    const tpl = `export default {\n  project: { root: "." },\n  analysis: { include: ["src/**"], exclude: ["node_modules/**", "dist/**"] },\n  integrations: { postgres: true, redis: true, kafka: true }\n};\n`;
    fs.writeFileSync(cfgPath, tpl);
    console.log(`Created ${cfgPath} (alias flowmap.config.ts also supported)`);
    return;
  }

  // for all other commands, analyze
  const g = analyzeProject(cwd);

  let outGraph = g;
  let title: string | undefined;

  if (cmd === "architecture") {
    title = `Architecture — ${path.basename(cwd)} (${g.meta?.filesScanned} files)`;
    // keep full graph
  } else if (cmd === "trace") {
    const target = pos.join(" ").trim();
    if (!target) { console.error("trace needs target: e.g. trace POST /api/orders"); process.exit(1); }
    // route trace: "POST /api/orders" or "function OrderService.createOrder"
    let startIds: string[] = [];
    if (/^(GET|POST|PUT|DELETE|PATCH|USE|ALL)\s+\//i.test(target)) {
      const norm = target.toUpperCase().replace(/\s+/g, " ").trim();
      startIds = g.nodes.filter(n => n.type === "ROUTE" && n.name.toUpperCase() === norm).map(n => n.id);
      // fuzzy: match path suffix
      if (startIds.length === 0) {
        const pathOnly = norm.split(/\s+/).slice(1).join(" ");
        startIds = g.nodes.filter(n => n.type === "ROUTE" && n.name.includes(pathOnly)).map(n => n.id);
      }
      // also try without method
      if (startIds.length === 0) startIds = g.nodes.filter(n => n.type === "ROUTE").slice(0, 1).map(n => n.id);
      title = `Trace ${target}`;
      if (startIds.length === 0) {
        console.log(`No route found for "${target}". Showing architecture instead.\n`);
        title = `Trace ${target} (no route match — architecture)`;
      }
    } else if (/^function\s+/i.test(target) || target.includes(".")) {
      const name = target.replace(/^function\s+/i, "").trim();
      const bare = name.split(".").pop()!;
      startIds = g.nodes.filter(n => (n.type === "FUNCTION" || n.type === "METHOD" || n.type === "CLASS") && (n.name === name || n.name === bare || n.name.endsWith(name))).map(n => n.id);
      // also search file nodes
      if (startIds.length === 0) startIds = g.nodes.filter(n => n.type === "FILE" && n.name.includes(bare)).map(n => n.id);
      title = `Trace function ${name}`;
      if (startIds.length === 0) { console.log(`No function found for "${name}"`); startIds = []; }
    } else {
      // generic: treat as name fragment
      const q = target.toLowerCase();
      startIds = g.nodes.filter(n => n.name.toLowerCase().includes(q)).map(n => n.id).slice(0, 3);
      title = `Trace ${target}`;
    }
    if (startIds.length) outGraph = subgraphFrom(g, startIds, depth);
    else outGraph = { nodes: [], edges: [], meta: g.meta };
  } else if (cmd === "dependencies" || cmd === "dependents") {
    const name = pos.join(" ").trim();
    if (!name) { console.error(`${cmd} needs a name e.g. ${cmd} OrderService`); process.exit(1); }
    const hits = g.nodes.filter(n => n.name.toLowerCase().includes(name.toLowerCase())).slice(0, 1);
    if (hits.length === 0) { console.log(`No node found for "${name}"`); outGraph = { nodes: [], edges: [], meta: g.meta }; }
    else {
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
    const name = pos.join(" ").trim();
    if (!name) { console.error("impact needs a name"); process.exit(1); }
    // impact = reverse BFS: who depends on this
    const hits = g.nodes.filter(n => n.name.toLowerCase().includes(name.toLowerCase())).slice(0, 1);
    if (hits.length === 0) { console.log(`No node found for "${name}"`); outGraph = { nodes: [], edges: [], meta: g.meta }; }
    else {
      const id = hits[0].id;
      // reverse graph BFS
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
    }
  } else if (cmd === "data") {
    const field = pos.join(" ").trim();
    console.log(`(stub) data flow for "${field}" — full data-flow analysis in Phase 2. Showing architecture for now.\n`);
    title = `Data ${field} (stub)`;
  } else if (cmd === "explain") {
    const target = pos.join(" ").trim();
    // reuse trace logic but render as numbered steps
    const traceCmd = ["trace", ...pos, "--format", "terminal"];
    // quick: build trace subgraph
    let startIds: string[] = [];
    if (/^(GET|POST|PUT|DELETE|PATCH)\s+\//i.test(target)) {
      const norm = target.toUpperCase();
      startIds = g.nodes.filter(n => n.type === "ROUTE" && n.name.toUpperCase() === norm).map(n => n.id);
    } else {
      startIds = g.nodes.filter(n => n.name.toLowerCase().includes(target.toLowerCase())).slice(0, 1).map(n => n.id);
    }
    const sg = startIds.length ? subgraphFrom(g, startIds, depth) : g;
    if (format === "json") { console.log(renderJson(sg)); return; }
    if (format === "mermaid") { console.log(renderMermaid(sg)); return; }
    // numbered steps
    const adj = new Map<string, string[]>();
    for (const e of sg.edges) { if (!adj.has(e.from)) adj.set(e.from, []); adj.get(e.from)!.push(e.to); }
    const order: string[] = [];
    const vis = new Set<string>();
    const q = sg.nodes.filter(n => n.type === "ROUTE").map(n => n.id);
    if (q.length === 0 && sg.nodes[0]) q.push(sg.nodes[0].id);
    while (q.length) { const id = q.shift()!; if (vis.has(id)) continue; vis.add(id); order.push(id); for (const nxt of adj.get(id) ?? []) q.push(nxt); }
    console.log(`${target}\n`);
    order.forEach((id, i) => {
      const n = sg.nodes.find(x => x.id === id)!;
      console.log(`${i + 1}. ${n.name}${n.file ? ` (${n.file})` : ""} — ${n.type.toLowerCase()}`);
    });
    return;
  } else {
    console.error(`Unknown command: ${cmd}\n`);
    console.log(help());
    process.exit(1);
  }

  if (format === "json") console.log(renderJson(outGraph));
  else if (format === "mermaid") console.log(renderMermaid(outGraph));
  else if (format === "svg") {
    // -lazy svg: wrap mermaid output in svg comment + minimal graph
    const m = renderMermaid(outGraph);
    console.log(`<svg xmlns="http://www.w3.org/2000/svg"><text><![CDATA[\n${m}\n]]></text></svg>`);
  } else {
    console.log(renderTerminal(outGraph, { title }));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
