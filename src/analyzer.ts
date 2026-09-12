import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import ts from "typescript";
import { FlowGraph, FlowNode, FlowEdge, addNode, addEdge } from "./graph.js";

const IGNORE_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git", ".opencode", ".flowmap", ".next", ".turbo"]);
const IGNORE_FILES = [/\.d\.ts$/, /\.test\./, /\.spec\./, /\.config\./];

function walk(dir: string, include: string[] | null, exclude: string[], out: string[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(ent.name)) continue;
      if (exclude.some(p => ent.name.includes(p.replace("**", "").replace("/", "")))) continue;
      walk(path.join(dir, ent.name), include, exclude, out);
    } else if (ent.isFile()) {
      if (!/\.(ts|js|tsx|jsx|mts|cts)$/.test(ent.name)) continue;
      if (IGNORE_FILES.some(r => r.test(ent.name))) continue;
      const full = path.join(dir, ent.name);
      const rel = full;
      if (exclude.some(p => rel.includes(p.replace("**", "").replace("/", "")))) continue;
      out.push(full);
    }
  }
}

function nodeTypeFromFile(file: string): FlowNode["type"] {
  const f = file.toLowerCase();
  if (f.includes("controller")) return "CONTROLLER";
  if (f.includes("service")) return "SERVICE";
  if (f.includes("repository") || f.includes("/repo")) return "REPOSITORY";
  if (f.includes("middleware")) return "MIDDLEWARE";
  if (f.includes("route")) return "ROUTE";
  if (f.includes("worker") || f.includes("queue") || f.includes("consumer")) return "WORKER";
  return "FILE";
}

function fileId(file: string, root: string) {
  return "file:" + path.relative(root, file).replace(/\\/g, "/");
}

function cachePath(root: string) { return path.join(root, ".chameleye", "cache.json"); }
function hashFiles(files: string[]): string {
  const h = crypto.createHash("sha256");
  for (const f of files.sort()) {
    try {
      const s = fs.statSync(f);
      h.update(f);
      h.update(String(s.mtimeMs));
      h.update(String(s.size));
    } catch {}
  }
  return h.digest("hex").slice(0, 16);
}
function loadCache(root: string, hash: string): FlowGraph | null {
  try {
    if (process.argv.includes("--no-cache")) return null;
    const p = cachePath(root);
    if (!fs.existsSync(p)) return null;
    const c = JSON.parse(fs.readFileSync(p, "utf8"));
    if (c.hash === hash && c.graph) return c.graph as FlowGraph;
  } catch {}
  return null;
}
function saveCache(root: string, hash: string, g: FlowGraph) {
  try {
    if (process.argv.includes("--no-cache")) return;
    const p = cachePath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ hash, graph: g, savedAt: new Date().toISOString() }));
  } catch {}
}

export function analyzeProject(root: string, onProgress?: (phase: string, done: number, total: number) => void): FlowGraph {
  const files: string[] = [];
  onProgress?.("Scanning files", 0, 0);
  walk(root, null, ["node_modules", "dist"], files);
  onProgress?.(`Found ${files.length} files`, files.length, files.length);

  const h = hashFiles(files);
  const cached = loadCache(root, h);
  if (cached) {
    onProgress?.("Cache hit — instant ⚡", files.length, files.length);
    onProgress?.("Done", files.length, files.length);
    // refresh meta
    cached.meta = { ...cached.meta, root, filesScanned: files.length, generatedAt: new Date().toISOString(), cached: true } as any;
    return cached;
  }

  const g: FlowGraph = { nodes: [], edges: [], meta: { root, filesScanned: files.length, generatedAt: new Date().toISOString() } };
  const fileNodeByPath = new Map<string, string>();
  const funcByName = new Map<string, string>(); // name -> node id (first)
  const funcByFileAndName = new Map<string, string>();

  // pass 1: file nodes + function/method nodes
  onProgress?.("Parsing AST", 0, files.length);
  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    if (idx % 8 === 0) onProgress?.("Parsing AST", idx, files.length);
    const rel = path.relative(root, file).replace(/\\/g, "/");
    const fid = fileId(file, root);
    fileNodeByPath.set(file, fid);
    const ftype = nodeTypeFromFile(file);
    addNode(g, { id: fid, type: ftype, name: path.basename(file), file: rel, metadata: { kind: "file" } });

    let content: string;
    try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
    const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    function lineOf(n: ts.Node) { try { return sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1; } catch { try { return sf.getLineAndCharacterOfPosition(n.pos).line + 1; } catch { return undefined; } } }
    // collect functions
    function visit(n: ts.Node) {
      if (ts.isFunctionDeclaration(n) && n.name) {
        const name = n.name.text;
        const id = `func:${rel}:${name}`;
        const line = lineOf(n);
        addNode(g, { id, type: "FUNCTION", name, file: rel, line, metadata: { kind: "function" } });
        funcByName.set(name, id);
        funcByFileAndName.set(`${rel}:${name}`, id);
        addEdge(g, { id: `e:${fid}->${id}`, from: fid, to: id, type: "DEPENDS_ON", confidence: 100 });
      } else if (ts.isClassDeclaration(n) && n.name) {
        const cname = n.name.text;
        const cid = `class:${rel}:${cname}`;
        const line = lineOf(n);
        addNode(g, { id: cid, type: "CLASS", name: cname, file: rel, line });
        funcByName.set(cname, cid);
        addEdge(g, { id: `e:${fid}->${cid}`, from: fid, to: cid, type: "DEPENDS_ON", confidence: 100 });
        for (const m of n.members) {
          if ((ts.isMethodDeclaration(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m)) && m.name && ts.isIdentifier(m.name)) {
            const mname = `${cname}.${m.name.text}`;
            const mid = `func:${rel}:${mname}`;
            const ml = lineOf(m);
            const mtype = ftype === "CONTROLLER" || ftype === "SERVICE" || ftype === "REPOSITORY" ? "METHOD" : "METHOD";
            addNode(g, { id: mid, type: mtype as any, name: mname, file: rel, line: ml });
            funcByName.set(mname, mid);
            funcByName.set(m.name.text, mid); // also bare name
            funcByFileAndName.set(`${rel}:${mname}`, mid);
            addEdge(g, { id: `e:${cid}->${mid}`, from: cid, to: mid, type: "DEPENDS_ON", confidence: 100 });
          }
        }
      } else if (ts.isVariableStatement(n)) {
        for (const decl of n.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            const name = decl.name.text;
            const id = `func:${rel}:${name}`;
            const line = lineOf(n);
            addNode(g, { id, type: "FUNCTION", name, file: rel, line });
            funcByName.set(name, id);
            addEdge(g, { id: `e:${fid}->${id}`, from: fid, to: id, type: "DEPENDS_ON", confidence: 100 });
          }
        }
      }
      ts.forEachChild(n, visit);
    }
    visit(sf);
  }
  onProgress?.("Parsing AST", files.length, files.length);

  // pass 2: imports + calls + route detection + db detection
  onProgress?.("Linking graph", 0, files.length);
  const routeNodes: FlowNode[] = [];
  for (let idx2 = 0; idx2 < files.length; idx2++) {
    const file = files[idx2];
    if (idx2 % 8 === 0) onProgress?.("Linking graph", idx2, files.length);
    const rel = path.relative(root, file).replace(/\\/g, "/");
    const fid = fileId(file, root);
    let content: string;
    try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
    const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

    const imports: string[] = [];
    // quick regex for db/integration hints
    const hasDbImport = /(prisma|pg|postgres|mongoose|typeorm|knex|drizzle|redis|kafka|amqp|axios|fetch)/i.test(content);
    let dbNodeId: string | null = null;
    if (hasDbImport) {
      if (/redis/i.test(content)) dbNodeId = ensureInfraNode(g, "CACHE", "Redis");
      if (/postgres|prisma|pg\b|knex|drizzle|typeorm|mongoose/i.test(content)) {
        const db = ensureInfraNode(g, "DATABASE", detectDbName(content));
        dbNodeId = db;
        // link file -> db
        addEdge(g, { id: `e:${fid}->${db}::db`, from: fid, to: db, type: "QUERY", confidence: 85, label: "DB" });
      }
      if (/kafka|amqp|rabbit/i.test(content)) {
        const q = ensureInfraNode(g, "QUEUE", /kafka/i.test(content) ? "Kafka" : "Queue");
        addEdge(g, { id: `e:${fid}->${q}::q`, from: fid, to: q, type: "PUBLISH", confidence: 80 });
      }
      if (/axios|fetch\(|http\.request|stripe|external/i.test(content)) {
        const ext = ensureInfraNode(g, "EXTERNAL_API", "External API");
        // only if file is service-like
        if (nodeTypeFromFile(file) === "SERVICE") addEdge(g, { id: `e:${fid}->${ext}::ext`, from: fid, to: ext, type: "HTTP_REQUEST", confidence: 70 });
      }
    }

    function visit2(n: ts.Node) {
      if (ts.isImportDeclaration(n)) {
        const mod = (n.moduleSpecifier as ts.StringLiteral).text;
        imports.push(mod);
        // resolve relative imports to file nodes
        if (mod.startsWith(".")) {
          const resolved = tryResolveImport(file, mod, root, fileNodeByPath);
          if (resolved) {
            addEdge(g, { id: `e:${fid}->${resolved}::imp`, from: fid, to: resolved, type: "IMPORT", confidence: 95, label: mod });
            // also function-level: if this file's functions call imported file's functions, we add CALL edges later via identifier resolution (heuristic)
          }
        } else if (!mod.startsWith(".") && !mod.startsWith("@")) {
          // external lib - ignore or mark as external
        }
      } else if (ts.isCallExpression(n)) {
        const callee = n.expression;
        let calleeName: string | null = null;
        if (ts.isIdentifier(callee)) calleeName = callee.text;
        else if (ts.isPropertyAccessExpression(callee)) calleeName = callee.name.text;

        // route detection: app.get('/path', handler) etc.
        if (calleeName && /^(get|post|put|delete|patch|options|head|all|use)$/.test(calleeName) && ts.isPropertyAccessExpression(callee)) {
          const obj = callee.expression.getText(sf).toLowerCase();
          if (/app|router|server/.test(obj) && n.arguments.length >= 1) {
            const first = n.arguments[0];
            if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
              const routePath = (first as ts.StringLiteral).text;
              const method = calleeName.toUpperCase() === "USE" ? "USE" : calleeName.toUpperCase();
              const rid = `route:${method} ${routePath}`;
              if (!g.nodes.find(x => x.id === rid)) {
                let rline: number | undefined; try { rline = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1; } catch { rline = undefined; }
                const rn: FlowNode = { id: rid, type: "ROUTE", name: `${method} ${routePath}`, file: rel, line: rline, metadata: { method, path: routePath } };
                addNode(g, rn);
                routeNodes.push(rn);
              }
              // link route -> file
              addEdge(g, { id: `e:${rid}->${fid}`, from: rid, to: fid, type: "ROUTE_HANDLER", confidence: 90, label: "handles" });
              // try to link to second arg handler if identifier
              if (n.arguments.length >= 2) {
                const handler = n.arguments[1];
                let hName: string | null = null;
                if (ts.isIdentifier(handler)) hName = handler.text;
                else if (ts.isPropertyAccessExpression(handler)) hName = handler.name.text;
                if (hName) {
                  const target = funcByName.get(hName);
                  if (target) addEdge(g, { id: `e:${rid}->${target}::h`, from: rid, to: target, type: "CALL", confidence: 90, label: "handler" });
                  // also route -> middleware chain: we keep file edge as fallback
                }
              }
            }
          }
        }

        // generic call edge: current function -> calleeName
        if (calleeName) {
          // find enclosing function (nearest function/method/arrow var)
          let cur: ts.Node | undefined = n.parent;
          let enclosing: string | null = null;
          while (cur) {
            if (ts.isFunctionDeclaration(cur) && cur.name) { enclosing = `func:${rel}:${cur.name.text}`; break; }
            if (ts.isMethodDeclaration(cur) && cur.name && ts.isIdentifier(cur.name)) {
              let cls: ts.Node | undefined = cur.parent;
              while (cls && !ts.isClassDeclaration(cls)) cls = cls.parent;
              const cname = cls && (cls as ts.ClassDeclaration).name ? (cls as ts.ClassDeclaration).name!.text : "Unknown";
              enclosing = `func:${rel}:${cname}.${(cur.name as ts.Identifier).text}`;
              break;
            }
            if (ts.isVariableDeclaration(cur) && ts.isIdentifier(cur.name) && cur.initializer && (ts.isArrowFunction(cur.initializer) || ts.isFunctionExpression(cur.initializer))) {
              const vname = cur.name.text;
              enclosing = `func:${rel}:${vname}`;
              break;
            }
            if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
              // anonymous arrow assigned to var already handled above, skip
            }
            cur = cur.parent;
          }
          if (enclosing && g.nodes.find(x => x.id === enclosing)) {
            const target = funcByName.get(calleeName);
            if (target && target !== enclosing) {
              addEdge(g, { id: `e:${enclosing}->${target}`, from: enclosing, to: target, type: "CALL", confidence: 80 });
            }
          }
        }
      }
      ts.forEachChild(n, visit2);
    }
    visit2(sf);

    // also detect Next.js / file-system routes: app/api/**/route.ts, pages/api/**/*.ts
    if (/app\/api\/.+\/route\.(ts|js)$/.test(rel) || /pages\/api\/.+\.(ts|js)$/.test(rel)) {
      const methodGuess = "GET"; // Next.js route.ts exports GET/POST etc. - cheap parse
      for (const m of ["GET", "POST", "PUT", "DELETE", "PATCH"] as const) {
        if (new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(content) || new RegExp(`export\\s+const\\s+${m}\\b`).test(content)) {
          const routePath = "/" + rel.replace(/^.*app\/api\//, "api/").replace(/\/route\.(ts|js)$/, "").replace(/^pages\/api\//, "api/").replace(/\.(ts|js)$/, "");
          const rid = `route:${m} ${routePath}`;
          if (!g.nodes.find(x => x.id === rid)) {
            addNode(g, { id: rid, type: "ROUTE", name: `${m} ${routePath}`, file: rel });
          }
          addEdge(g, { id: `e:${rid}->${fid}`, from: rid, to: fid, type: "ROUTE_HANDLER", confidence: 85 });
        }
      }
    }
  }

  onProgress?.("Linking graph", files.length, files.length);
  // post: ensure file->file import edges produce some connectivity for architecture view
  onProgress?.("Done", files.length, files.length);
  saveCache(root, h, g);
  return g;
}

function tryResolveImport(fromFile: string, mod: string, root: string, fileNodeByPath: Map<string, string>): string | null {
  const base = path.dirname(fromFile);
  const candidates = [
    path.join(base, mod) + ".ts",
    path.join(base, mod) + ".js",
    path.join(base, mod, "index.ts"),
    path.join(base, mod, "index.js"),
    path.join(base, mod) + ".tsx",
    path.join(base, mod),
  ];
  for (const c of candidates) {
    if (fileNodeByPath.has(c)) return fileNodeByPath.get(c)!;
    // try without extension exact
    for (const [k, v] of fileNodeByPath.entries()) {
      if (k.replace(/\.(ts|js|tsx|jsx)$/, "") === c.replace(/\.(ts|js|tsx|jsx)$/, "")) return v;
    }
  }
  // fallback: fuzzy match by basename
  const baseMod = path.basename(mod);
  for (const [k, v] of fileNodeByPath.entries()) {
    if (path.basename(k, path.extname(k)) === baseMod) return v;
  }
  return null;
}

function ensureInfraNode(g: FlowGraph, type: FlowNode["type"], name: string): string {
  const id = `infra:${type}:${name}`;
  if (!g.nodes.find(n => n.id === id)) addNode(g, { id, type, name });
  return id;
}

function detectDbName(content: string): string {
  if (/prisma/i.test(content)) return "Prisma";
  if (/mongoose|mongodb/i.test(content)) return "MongoDB";
  if (/mysql/i.test(content)) return "MySQL";
  if (/postgres|pg\b/i.test(content)) return "PostgreSQL";
  return "Database";
}
