export type NodeType =
  | "APPLICATION" | "MODULE" | "FILE" | "FUNCTION" | "CLASS" | "METHOD"
  | "CONTROLLER" | "MIDDLEWARE" | "SERVICE" | "REPOSITORY"
  | "DATABASE" | "TABLE" | "CACHE" | "QUEUE" | "WORKER" | "EXTERNAL_API"
  | "ROUTE" | "UNKNOWN";

export type EdgeType =
  | "IMPORT" | "CALL" | "READ" | "WRITE"
  | "HTTP_REQUEST" | "PUBLISH" | "CONSUME" | "QUERY" | "DEPENDS_ON" | "ROUTE_HANDLER";

export interface FlowNode {
  id: string;
  type: NodeType;
  name: string;
  file?: string;
  line?: number;
  metadata?: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  label?: string;
  confidence?: number; // 0-100
  metadata?: Record<string, unknown>;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  meta?: { root: string; filesScanned: number; generatedAt: string };
}

export function createGraph(): FlowGraph {
  return { nodes: [], edges: [], meta: { root: ".", filesScanned: 0, generatedAt: new Date().toISOString() } };
}

export function addNode(g: FlowGraph, n: FlowNode) {
  if (!g.nodes.find(x => x.id === n.id)) g.nodes.push(n);
}

export function addEdge(g: FlowGraph, e: FlowEdge) {
  if (!g.edges.find(x => x.id === e.id)) g.edges.push(e);
}

// bfs follow edges from start ids — preserves BFS discovery order for rendering
export function subgraphFrom(g: FlowGraph, startIds: string[], depth = 10): FlowGraph {
  const visited = new Set<string>();
  const order: string[] = [];
  const queue: { id: string; d: number }[] = startIds.map(id => ({ id, d: 0 }));
  for (const s of startIds) { visited.add(s); order.push(s); }
  const edgeSet = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.d >= depth) continue;
    for (const e of g.edges) {
      if (e.from === cur.id) {
        edgeSet.add(e.id);
        if (!visited.has(e.to)) {
          visited.add(e.to);
          order.push(e.to);
          queue.push({ id: e.to, d: cur.d + 1 });
        }
      }
    }
  }
  const idToNode = new Map(g.nodes.map(n => [n.id, n]));
  return {
    nodes: order.map(id => idToNode.get(id)!).filter(Boolean),
    edges: g.edges.filter(e => edgeSet.has(e.id)),
    meta: g.meta,
  };
}

export function findNodes(g: FlowGraph, pred: (n: FlowNode) => boolean) {
  return g.nodes.filter(pred);
}
