# Design documents

`plan.md` is the approved plan and the source of truth. Where a document below disagrees with `plan.md`, `plan.md` wins.

- `plan.md`: the approved plan: stack, domain rules, schema, API contract, live updates, polling, performance budgets, code organization, milestones.
- `product.md`: the product and UX design (routes, ticket page, table, board, filters, Cmd-K, mobile, visual system). The critiques came after this document. `plan.md` has the corrections.
- `engineering.md`: the engineering design (repo layout, schema, contract, poller, CLI, testing, distribution). The critiques came after this document. `plan.md` has the corrections.
- `critique-schema.md`, `critique-api.md`, `critique-performance.md`: the three adversarial critiques and their corrected sections. `plan.md` includes their fixes.
- `mockup.html`: the approved brand mockup. Its `:root` token blocks are the palette. `packages/ui/src/tokens.css` is generated from them.
