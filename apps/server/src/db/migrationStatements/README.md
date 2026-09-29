# Prepared migration statements

The PGlite migrator executes each statement-breakpoint chunk as one prepared statement. A chunk can contain one top-level command. A function body can contain its own SQL statements within its dollar quotes.

On September 29, 2026, the fixed-main server preload failed with PostgreSQL error 42601. Migration 0140 placed an exclusion constraint, two functions, and two triggers in one prepared chunk. Migration 0142 placed a function and a trigger in one chunk.

The repair adds four breakpoints to 0140 and one to 0142. Removal of the breakpoint markers produces identical bytes before and after the repair. Snapshots, journal timestamps, schema identities, and SQL semantics stay unchanged. A forward migration cannot repair this failure because a fresh database stops at 0140 before it reaches later files.

This is an explicit exception to the frozen SQL hashes for these two files. Existing databases retain their recorded hashes. The production migrator selects pending migrations by their journal timestamps; the repair does not rewrite migration history.

| File | Original SHA256 | Repaired SHA256 |
| --- | --- | --- |
| 0140_hesitant_falcon.sql | 38111cd1c936c5927e55d5aed9ad03719cb058eea0a21c56e1f1bdf5d1f6b5ee | 140d4fac5cf3c96b678cef32f53a798ccd8b7c32bafb2011390a495e1443046c |
| 0142_closed_pyro.sql | 755ebb99eb2e00cc0744ea780d9c9992f7ce225f548a393f0822a7197f869d47 | a005d2ac6bddde4d6ef000d551cf35a2fdf015b562c7cd02d3e9925e978dbc90 |

`bun test apps/server/src/db/migrationStatements/migrationStatements.test.ts` passes one test with seven assertions. It applies the complete journal to a fresh database, checks all three triggers, and confirms the owner constraint and immutable revocation. It then preserves the original hashes in an isolated database, reopens that database, and verifies zero migrations and unchanged records.

TRL-942 inspected its historical fixtures. They pin snapshots 0137 and 0138 and require no hash update for this repair. This scoped proof does not replace the combined server suite or release checks.
