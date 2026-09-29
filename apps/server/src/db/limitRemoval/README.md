# Complete text storage

Migration `0138_complete_text_limits` removes the specified text ceilings after `0137_glorious_norman_osborn`.
The table declarations retain the required lower bounds, formats, and foreign keys.

Eleven equality exclusion constraints use hash indexes to compare complete identity values.
PostgreSQL checks the original values when hashes collide.
The constraints preserve the project, epic, group, provider, and actor scopes of their keys.
Drizzle declares the backing hash indexes because it cannot generate these exclusion constraints.
The SQL migration creates the constraints that own those indexes.
A generated plain index cannot enforce uniqueness.

The actor registry retains its `(name, kind)` primary key and its foreign keys.
Its B-tree entry size still limits incompressible actor names.
The actor identity work belongs to TRL-739 and its child tickets.

`upgrade.test.ts` opens the real migration history through 0137 and seeds 24 tables.
It checks prior refusals, complete row preservation, the new text values, invalid values, and archive reopen.
`identity.test.ts` checks long incompressible keys, exact duplicates, scope, case rules, and deliberate hash collisions.
`snapshot.test.ts` checks the frozen predecessor and the retained table, column, and foreign key definitions.

Run the fixtures from the repository root:

```sh
bun test apps/server/src/db/limitRemoval --timeout 120000
```
