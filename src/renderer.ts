import { FlowGraph } from "./graph.js";

const useColor = process.stdout.isTTY && !process.argv.includes("--no-color") && !process.env.NO_COLOR;
const gc = {
  green: (s: string) => useColor ? `\x1b[32m${s}\x1b[0m` : s,
  dim: (s: string) => useColor ? `\x1b[2m${s}\x1b[0m` : s,
  cyan: (s: string) => useColor ? `\x1b[36m${s}\x1b[0m` : s,
  yellow: (s: string) => useColor ? `\x1b[33m${s}\x1b[0m` : s,
  bold: (s: string) => useColor ? `\x1b[1m${s}\x1b[0m` : s,
  red: (s: string) => useColor ? `\x1b[31m${s}\x1b[0m` : s,
};

function isArchitecture(optsTitle?: string) {
  return !!optsTitle && /architecture|vision/i.test(optsTitle);
}

function renderArchitecture(g: FlowGraph, title: string): string {
  const lines: string[] = [];
  // header with dot eye small
  lines.push(gc.green("              ●●●●●●●●  ") + gc.bold("👁️  " + title));
  lines.push(gc.dim("─".repeat(title.length + 10)));
  lines.push("");
  // layer order — most visual for devs
  const layerOrder: [string, string][] = [
    ["ROUTE", "Routes"],
    ["MIDDLEWARE", "Middleware"],
    ["CONTROLLER", "Controllers"],
    ["SERVICE", "Services"],
    ["REPOSITORY", "Repositories"],
    ["DATABASE", "Databases"],
    ["CACHE", "Cache / Redis"],
    ["QUEUE", "Queues / Kafka"],
    ["WORKER", "Workers"],
    ["EXTERNAL_API", "External APIs"],
    ["FILE", "Modules"],
  ];
  const byType = new Map<string, typeof g.nodes>();
  for (const n of g.nodes) {
    const k = n.type;
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k)!.push(n);
  }
  // build layered boxes
  const width = 48;
  const inner = width - 2;
  let hasAnyLayer = false;
  for (const [type, label] of layerOrder) {
    const nodes = byType.get(type);
    if (!nodes || nodes.length === 0) continue;
    hasAnyLayer = true;
    const header = `─ ${label} (${nodes.length}) `;
    const hdr = header.padEnd(inner, "─");
    lines.push(gc.green("┌" + hdr + "┐"));
    // show up to 6 nodes per layer
    const show = nodes.slice(0, 6);
    for (const n of show) {
      const icon = iconFor(n.type as any);
      const name = n.name.length > 28 ? n.name.slice(0, 27) + "…" : n.name.padEnd(28);
      const file = n.file ? gc.dim(n.file.slice(0, 32)) : "";
      // first line: icon + name
      const row = ` ${icon} ${name}`;
      lines.push(gc.green("│") + row.padEnd(inner) + gc.green("│"));
      if (file) {
        const f = "  " + file;
        lines.push(gc.green("│") + gc.dim(f.padEnd(inner)) + gc.green("│"));
      }
    }
    if (nodes.length > 6) {
      const more = `  … +${nodes.length - 6} more`;
      lines.push(gc.green("│") + gc.dim(more.padEnd(inner)) + gc.green("│"));
    }
    lines.push(gc.green("└" + "─".repeat(inner) + "┘"));
    // arrow between layers
    const nextExists = layerOrder.slice(layerOrder.findIndex(([t]) => t === type) + 1).some(([t]) => (byType.get(t)?.length ?? 0) > 0);
    if (nextExists) {
      // count edges crossing this layer to next
      const cross = g.edges.filter(e => {
        const from = g.nodes.find(x => x.id === e.from)?.type;
        const to = g.nodes.find(x => x.id === e.to)?.type;
        return from === type && to && layerOrder.some(([lt]) => lt === to);
      }).length;
      const pad = " ".repeat(Math.floor(width / 2) - 1);
      lines.push(pad + gc.dim("│") + (cross ? gc.dim(` ${cross}→`) : ""));
      lines.push(pad + gc.green("▼"));
    }
  }
  if (!hasAnyLayer) {
    // fallback to grouped list
    for (const [type, nodes] of byType) {
      lines.push(gc.bold(type) + ` (${nodes.length})`);
      for (const n of nodes.slice(0, 8)) lines.push(`  • ${n.name}${n.file ? ` — ${n.file}` : ""}`);
      if (nodes.length > 8) lines.push(`  … +${nodes.length - 8} more`);
      lines.push("");
    }
  }
  // footer stats — exciting
  lines.push("");
  lines.push(gc.dim("─".repeat(50)));
  const routes = byType.get("ROUTE")?.length ?? 0;
  const dbs = (byType.get("DATABASE")?.length ?? 0) + (byType.get("CACHE")?.length ?? 0);
  const services = (byType.get("SERVICE")?.length ?? 0) + (byType.get("CONTROLLER")?.length ?? 0);
  lines.push(`${gc.cyan("Nodes:")} ${g.nodes.length}  ${gc.cyan("Edges:")} ${g.edges.length}  ${gc.cyan("Layers:")} ${[...byType.keys()].length}  ${gc.dim(`Routes:${routes} Services:${services} DB:${dbs}`)}`);
  // quick insight
  if (routes && dbs) lines.push(gc.green("✓ Full stack visible — try: ") + gc.cyan("chameleye trace POST /api/users") + gc.dim("  or  ") + gc.cyan("chameleye animate"));
  else if (routes) lines.push(gc.dim("Tip: ") + gc.cyan("chameleye trace <route>") + gc.dim(" to see a flow"));
  lines.push(gc.dim(`Docs: https://github.com/JoyalJJoy/chameleye`));
  return lines.join("\n");
}

export function renderTerminal(g: FlowGraph, opts: { title?: string } = {}): string {
  if (g.nodes.length === 0) return "No nodes found. Try 'flowmap init' and check include globs.\n";
  if (isArchitecture(opts.title)) return renderArchitecture(g, opts.title!);
  const lines: string[] = [];
  if (opts.title) lines.push(opts.title, "─".repeat(opts.title.length), "");
  // group by type for architecture view
  const byType = new Map<string, typeof g.nodes>();
  for (const n of g.nodes) {
    const k = n.type;
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k)!.push(n);
  }
  // if it's a trace (has ROUTE) or small graph, render flow vertically preserving BFS order from analyzer
  const hasRoute = g.nodes.some(n => n.type === "ROUTE");
  if (hasRoute || g.nodes.length < 30) {
    // use graph's node order as BFS order (subgraphFrom already sorted)
    const order = g.nodes.map(n => n.id);

    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const n = g.nodes.find(x => x.id === id)!;
      const icon = iconFor(n.type);
      const label = `${icon} ${n.name}${n.file ? `  (${n.file}${n.line ? `:${n.line}` : ""})` : ""}`;
      lines.push(label);
      // show outgoing edges
      const outs = g.edges.filter(e => e.from === id);
      for (const e of outs) {
        const to = g.nodes.find(x => x.id === e.to);
        if (!to) continue;
        const conf = e.confidence && e.confidence < 90 ? ` [${e.confidence}%]` : "";
        lines.push(`  │  ${e.type.toLowerCase()}${e.label ? `(${e.label})` : ""}${conf} → ${to.name}`);
      }
      if (i < order.length - 1) lines.push("  │", "  ▼");
    }
    lines.push("", `Nodes: ${g.nodes.length}  Edges: ${g.edges.length}`);
    return lines.join("\n");
  }
  // architecture summary
  for (const [type, nodes] of byType) {
    lines.push(`${type} (${nodes.length})`);
    for (const n of nodes.slice(0, 8)) lines.push(`  • ${n.name}${n.file ? ` — ${n.file}` : ""}`);
    if (nodes.length > 8) lines.push(`  … +${nodes.length - 8} more`);
    lines.push("");
  }
  lines.push(`Edges: ${g.edges.length}`);
  for (const e of g.edges.slice(0, 20)) {
    const from = g.nodes.find(n => n.id === e.from)?.name ?? e.from;
    const to = g.nodes.find(n => n.id === e.to)?.name ?? e.to;
    lines.push(`  ${from} —[${e.type}]→ ${to}`);
  }
  if (g.edges.length > 20) lines.push(`  … +${g.edges.length - 20} more edges`);
  return lines.join("\n");
}

function iconFor(t: string) {
  switch (t) {
    case "ROUTE": return "◆";
    case "CONTROLLER": return "◉";
    case "SERVICE": return "⬢";
    case "REPOSITORY": return "⬣";
    case "DATABASE": return "▣";
    case "CACHE": return "⬔";
    case "QUEUE": return "≋";
    case "EXTERNAL_API": return "⬡";
    case "FUNCTION": case "METHOD": return "ƒ";
    default: return "•";
  }
}

export function renderMermaid(g: FlowGraph): string {
  const lines = ["graph TD"];
  const idSafe = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  const byType = new Map<string, typeof g.nodes>();
  for (const n of g.nodes) {
    const k = n.type;
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k)!.push(n);
  }
  const isArch = byType.size >= 3 && g.nodes.length >= 12;
  if (isArch) {
    // layered subgraphs — much better for architecture
    const order = ["ROUTE","CONTROLLER","SERVICE","REPOSITORY","DATABASE","CACHE","QUEUE","WORKER","EXTERNAL_API","FILE"];
    const orderedTypes = [...byType.keys()].sort((a,b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    for (const t of orderedTypes) {
      const nodes = byType.get(t)!;
      lines.push(`  subgraph ${t} ["${t} (${nodes.length})"]`);
      for (const n of nodes) {
        const sid = idSafe(n.id);
        const label = n.name.replace(/"/g, "'").slice(0, 30);
        const shape = n.type === "DATABASE" ? `[( ${label} )]` : n.type === "ROUTE" ? `{{${label}}}` : n.type === "CACHE" ? `[/ ${label} /]` : `[${label}]`;
        lines.push(`    ${sid}${shape}`);
      }
      lines.push("  end");
    }
  } else {
    const seen = new Set<string>();
    for (const n of g.nodes) {
      const sid = idSafe(n.id);
      if (seen.has(sid)) continue;
      seen.add(sid);
      const label = n.name.replace(/"/g, "'").slice(0, 40);
      const shape = n.type === "DATABASE" ? `[( ${label} )]` : n.type === "ROUTE" ? `{{${label}}}` : n.type === "CACHE" ? `[/ ${label} /]` : `[${label}]`;
      lines.push(`  ${sid}${shape}`);
    }
  }
  for (const e of g.edges) {
    const from = idSafe(e.from), to = idSafe(e.to);
    const lbl = e.label ? `|${e.label}|` : "";
    lines.push(`  ${from} -->${lbl} ${to}`);
  }
  return lines.join("\n");
}

export function renderJson(g: FlowGraph): string {
  return JSON.stringify(g, null, 2);
}
