# Design documents

`plan.md` is the approved plan and the source of truth. Where a document below disagrees with `plan.md`, `plan.md` wins.

- `plan.md`: the approved plan: stack, domain rules, schema, API contract, live updates, polling, performance budgets, code organization, milestones.
- `product.md`: the product and UX design (routes, ticket page, table, board, filters, Cmd-K, mobile, visual system). Written before the critiques; the plan carries the corrections.
- `engineering.md`: the engineering design (repo layout, schema, contract, poller, CLI, testing, distribution). Written before the critiques; the plan carries the corrections.
- `critique-schema.md`, `critique-api.md`, `critique-performance.md`: the three adversarial critiques and their corrected sections. Their fixes are folded into `plan.md`.
- `mockup.html`: the approved brand mockup. Its `:root` token blocks are the palette; `packages/ui/src/tokens.css` is generated from them.
