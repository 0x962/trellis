# Actor identity upgrade

Migration `0139_actor_identity` follows the frozen `0138_complete_text_limits` snapshot.
The actor registry uses UUID keys and exact equality on the original kind and name.
Twenty-two foreign keys retain their original names and `NO ACTION` behavior.
Each role binds its UUID to the complete original actor text.
Optional roles require either three null fields or a complete binding.
Actor UUID, name, and kind remain immutable.

The migration fills UUID columns before it replaces keys or requires non-null values.
Page indexes and comment deduplication use UUIDs.
Six durable request identities use hash exclusion constraints with exact array equality.
The constraints compare complete values when hashes collide.
Drizzle describes the backing hash indexes; the SQL defines their exclusions.

The source inputs are TRL-951 registry `bb7825b27fd69d825411f918e009b1d921e38c17`,
TRL-952 relationships `00f582c5d830cc495622261acdd45f02dc79642f`,
TRL-953 Page tables `ca8ba39383210b7e92003d955d5ef27d73e446fc`,
and TRL-954 request identities `a6aea2ff46e01ec26793503ece2561306e1110e9`.
The repaired relationship consumers use `7263ae71440bf79ac435f138f56fcb625e9dca5c`.
The combined Page consumers use `1bb8296df54ab211f69e39dabe0d29d7656830f0`.
These consumers and the migration require one release batch.

`seed.ts` supplies historical rows before the UUID columns exist.
`upgrade.test.ts` checks every role, retained original fields, invalid bindings, indexes, and archive reopen.
`identities.test.ts` checks complete names, shared prefixes, collisions, Page ownership, duplicates, and receipt cascades.
`snapshot.test.ts` checks the snapshot predecessor and unchanged original columns.
The historical text-limit fixture uses only journal entries through 0138.

Run the focused upgrade fixtures from the repository root:

```sh
bun test apps/server/src/db/actorIdentityMigration apps/server/src/db/limitRemoval --timeout 120000
```
