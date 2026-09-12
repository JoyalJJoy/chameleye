# FlowMap — See where your code, data, and requests actually go.

> A local-first CLI that turns source code into explorable execution & data-flow maps.

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

## Why

Traditional diagrams show *what exists*. FlowMap shows *what happens when you do X*:

* What runs when this endpoint is called?
* Where does `user.email` travel?
* What breaks if I change `OrderService.createOrder`?
* Which tables/queues/external APIs are touched?

No source upload, no LLM required. Static analysis first, runtime later.

## Quick start

```bash
npm install -g flowmap        # soon
# or local dev
git clone https://github.com/your-org/flowmap
cd flowmap && npm install && npm run build

flowmap init                  # creates flowmap.config.ts
flowmap architecture          # overall system map
flowmap trace POST /api/orders        # request flow
flowmap trace POST /api/orders --format mermaid
flowmap trace POST /api/orders --format json
flowmap dependencies OrderService
flowmap dependents OrderService
flowmap impact UserService.updateUser
```

## MVP scope (current)

- [x] CLI skeleton (`init`, `architecture`, `trace`, `dependencies`, `dependents`, `impact`, `explain`, `data`)
- [x] TypeScript/JavaScript AST (imports, functions, calls)
- [x] Import graph + call graph → `FlowGraph`
- [x] Route detection (Express, Next.js)
- [x] Heuristic layer detection (controller/service/repository)
- [x] Terminal renderer, Mermaid & JSON exporters
- [ ] DB/Redis/Kafka detectors
- [ ] `flowmap serve` web UI
- [ ] Runtime tracer

See [PRD.md](./PRD.md) for full vision & roadmap. See `examples/` for tested fixtures.

## How it works

```
Source Code → Parser (ts AST) → Code Model → Dependency Graph → Flow Engine → Renderer
                                      ↓
                                  FlowGraph { nodes, edges }  → terminal | mermaid | json | svg
```

Every edge has `confidence` (high = static proof, low = inferred). Unknowns are shown as `?` — never fake a flow.

## Config

Zero-config works for Express/Next.js. Optional `flowmap.config.ts`:

```ts
export default {
  project: { root: "." },
  analysis: { include: ["src/**"], exclude: ["node_modules/**", "dist/**"] },
  integrations: { postgres: true, redis: true, kafka: true }
}
```

Respects `.gitignore` + `.flowmapignore`.

## Open source

MIT. Local-first, no telemetry by default. Contributions welcome — see `CONTRIBUTING.md` (coming).

## Principle

> Never hide uncertainty. Show what you know, mark what you infer, admit what you can't tell.

---

 
