import { FlowGraph } from "./graph.js";

export function renderTerminal(g: FlowGraph, opts: { title?: string } = {}): string {
  if (g.nodes.length === 0) return "No nodes found. Try 'flowmap init' and check include globs.\n";
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
  const seen = new Set<string>();
  for (const n of g.nodes) {
    const sid = idSafe(n.id);
    if (seen.has(sid)) continue;
    seen.add(sid);
    const label = n.name.replace(/"/g, "'").slice(0, 40);
    const shape = n.type === "DATABASE" ? `[( ${label} )]` : n.type === "ROUTE" ? `{{${label}}}` : n.type === "CACHE" ? `[/ ${label} /]` : `[${label}]`;
    lines.push(`  ${sid}${shape}`);
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
