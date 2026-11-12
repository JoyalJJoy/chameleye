# ChamelEye 👁️ — 360° vision for your codebase

> Like a chameleon eye that moves independently to see everything — ChamelEye sees where your code, data, and requests actually go.

Previously called **FlowMap** — renamed to reflect the chameleon-eye philosophy: independent, panoramic, precise flow vision.

```
Client
  │
  ▼
POST /api/orders
  │
  ▼
AuthMiddleware → OrderController → OrderService ─┬─► InventoryService
                                                ├─► PaymentService
                                                └─► OrderRepository → PostgreSQL
```

## Why ChamelEye?

Chameleons see 360° with eyes that move independently. Your architecture should be the same — see every flow from every angle without moving the whole head (reading the whole codebase).

Traditional diagrams show *what exists*. ChamelEye shows *what happens when you do X*:

* What runs when this endpoint is called?
* Where does `user.email` travel?
* What breaks if I change `OrderService.createOrder`?
* Which tables/queues/external APIs are touched?

No source upload, no LLM required. Static analysis first, runtime later.

## Quick start

```bash
npm install -g chameleye        # soon: npm view chameleye
# or local dev
git clone https://github.com/JoyalJJoy/chameleye
cd chameleye && npm install && npm run build

chameleye init                  # creates chameleye.config.ts (flowmap.config.ts also supported)
chameleye architecture          # overall system map — panoramic view
chameleye trace POST /api/orders        # request flow — focus one eye
chameleye trace POST /api/orders --format mermaid --output flow.mmd
chameleye trace POST /api/orders --format json --output flow.json
chameleye dependencies OrderService     # what it sees
chameleye dependents OrderService       # what sees it
chameleye impact UserService.updateUser # blast radius + risk (routes/dbs)
chameleye check                         # guard: Controller→Service→Repo→DB (CI)
chameleye circular                      # find import/call cycles
chameleye doctor                        # validate setup (Node, routes, DB)
```

`flowmap` still works as an alias: `flowmap trace ...` → `chameleye trace ...`

## Daily — S-rank workflow (2s, cache ⚡)

```bash
chameleye status                    # daily dashboard — health + insights + guard (cached)
chameleye trace POST /api/users     # before each change — see flow
chameleye impact OrderService       # before commit — blast radius
chameleye check --strict            # in CI / pre-commit
chameleye hook install              # S-rank: guard on every commit (→ .git/hooks/pre-commit)
chameleye completion zsh > _chameleye  # tab complete (bash|zsh|fish)
chameleye clean                     # clear .chameleye/cache.json
# 2nd run is instant ⚡ via .chameleye/cache.json — --no-cache to bypass
```

## MVP scope (current)

- [x] CLI skeleton (`init`, `architecture`/`vision`, `trace`/`eye`, `dependencies`, `dependents`, `impact`/`blast`, `explain`, `data`/`flow`, `check`, `circular`, `doctor`)
- [x] CLI design: per-command help, `--output`, `--verbose`, `--no-color`, colors (ANSI, no deps), did-you-mean, progress (spinner+bar+steps), reactions for every action, human-readable errors, skim-friendly chunks
- [x] TypeScript/JavaScript AST (imports, functions, calls) — `setParentNodes:true`
- [x] Import graph + call graph → `FlowGraph` with confidence
- [x] Route detection (Express, Next.js)
- [x] Heuristic layer detection (controller/service/repository)
- [x] Terminal renderer (layered green boxes + dot eye), Mermaid subgraphs + `--output` file
- [x] Architecture guard (`check`) + circular + dead code + insights/heatmap/animate
- [x] **S-rank daily**: `status` dashboard, `.chameleye/cache.json` instant ⚡, `hook` pre-commit, `completion` bash|zsh|fish, `clean`
- [ ] DB/Redis/Kafka deep detectors
- [ ] `chameleye serve` web UI — interactive 360° viewer
- [ ] Runtime tracer (`--runtime`)

See [PRD.md](./PRD.md) for full vision & roadmap. See `examples/` for tested fixtures.

## How it works

```
Source Code → Parser (ts AST) → Code Model → Dependency Graph → Flow Engine → Renderer
                                      ↓
                                  FlowGraph { nodes, edges }  → terminal | mermaid | json | svg
                    (chameleon eye = independent subgraphs per flow)
```

Every edge has `confidence` (high = static proof, low = inferred). Unknowns are shown as `?` — never fake a flow.

## Config

Zero-config works for Express/Next.js. Optional `chameleye.config.ts` (or legacy `flowmap.config.ts`):

```ts
export default {
  project: { root: "." },
  analysis: { include: ["src/**"], exclude: ["node_modules/**", "dist/**"] },
  integrations: { postgres: true, redis: true, kafka: true }
}
```

Respects `.gitignore` + `.chameleyeignore` + `.flowmapignore`.

## Open source

MIT. Local-first, no telemetry by default. Contributions welcome.

## Principle

> Never hide uncertainty. A chameleon eye doesn't pretend — it shows what it sees, marks what it infers, admits what it can't.

---
