# FlowMap — Product Requirements Document

> Developer CLI for understanding how data and execution flow through a software system.

Status: Draft 1.0 | Type: Developer Tool / CLI | Users: Devs, Architects, Leads | Target: TS/JS initial

---

## 1. Overview
FlowMap visually represents execution + data movement. Answers: What happens when this API is called? Which functions run? Where does data go? What breaks if I change this?

## 2. Problem
Modern apps have hundreds of files/services/DBs. Architecture diagrams show components, not flows for a specific action. Devs manually trace imports/calls/queries.

## 3. Vision
Turn `What happens when I call this API?` → visual flow in seconds.

## 4. Goals
Analyze source, build architecture model, detect relationships, trace execution, visualize data, terminal 2D diagrams, export Mermaid/SVG, endpoint/function tracing, dependency/impact analysis, runtime tracing eventually.

## 5. Non-Goals
No IDE replacement, no observability platform, no all-languages day-one, no LLM dependency, no full graphical IDE.

## ... (full PRD as provided — 64 sections)
See README for MVP milestone: `flowmap trace POST /api/users` → Controller → Service → Repository → Database with --format mermaid|json.

### MVP (Phase 1)
- init, architecture, trace, dependencies, impact
- TS/JS parsing via tsc AST
- Import graph + call graph
- Route detection (Express, Next.js)
- Graph IR {nodes, edges}
- Terminal + Mermaid + JSON renderers
- Example: src/routes/user.ts → UserController → UserService → UserRepository → PostgreSQL

### Phases
2: DB/Redis/Kafka detectors, data-flow, impact, better UI
3: runtime tracing (`--runtime`)
4: `flowmap serve` web viewer
5: architecture rules (`flowmap check`), coupling, AI explain
6: multi-language (Python/Go/Java/C#)

### Key Decisions
- Local-first, no telemetry, no upload
- Intermediate FlowGraph IR (not code→diagram directly)
- Confidence per edge (known/inferred/unknown)
- Never hide uncertainty
- Performance: <1s small, <5s medium, <15s large; caching

### Data Model
```ts
interface FlowNode { id, type: NodeType, name, file?, line?, metadata? }
interface FlowEdge { id, from, to, type: EdgeType, confidence?, metadata? }
interface FlowGraph { nodes: FlowNode[], edges: FlowEdge[] }
```

NodeTypes: APPLICATION/MODULE/FILE/FUNCTION/CLASS/METHOD/CONTROLLER/MIDDLEWARE/SERVICE/REPOSITORY/DATABASE/TABLE/CACHE/QUEUE/TOPIC/WORKER/EXTERNAL_API/MICROSERVICE/EVENT
EdgeTypes: IMPORT/CALL/READ/WRITE/HTTP_REQUEST/PUBLISH/CONSUME/QUERY/CACHE_READ/etc.

### CLI
```
flowmap <command> [target] [options]
flowmap init | architecture | trace <target> | data <field> | dependencies <svc> | dependents <svc> | impact <fn> | explain <target> | serve | watch
```

### Rendering
FlowGraph → TerminalRenderer / MermaidRenderer / SVGRenderer / JSONRenderer / HTMLRenderer

---

Original full PRD: 64 sections covering Action Flow, Data Flow, Function Flow, Impact, Auth, Static/Runtime analysis, TUI, output formats, web viewer, tracking, config, watch, rules, AI, plugins, examples, testing, vision.

> One-line pitch: FlowMap — See where your code, data, and requests actually go.
