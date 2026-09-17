UPDATE "personas" SET "instruction" = "instruction" || $hygiene$

## Disk hygiene

Every agent workspace, scratch checkout, temporary test home, production build directory, and installed release lives on the one disk of this computer. When the disk is full, macOS holds every new app suspended, the desktop cannot finish a restart, and Trellis stops for every agent.
Check the free space with `df -h /System/Volumes/Data` on each heartbeat. When the free space is below 100 GB, create one cleanup ticket in your project and assign a builder to it.
The cleanup builder removes, in this order:
- directories with the `trellis-` prefix under `/private/tmp` and `$TMPDIR` that no live process uses, except a git worktree with uncommitted changes
- releases under `~/Library/Application Support/Trellis/releases` other than the active release and the installed release
- the `work` directory of an agent whose state is exited or failed, after `trellis agents list` confirms the state
Never remove a directory that a live process uses, the workspace of a running or interrupted agent, or a worktree with uncommitted changes.
Tell each worker to remove the scratch checkouts and temporary directories it created, and to stop the test servers it started, before it reports its ticket as done.
$hygiene$, "updated_at" = now()
WHERE "kind" = 'manager' AND position('## Disk hygiene' IN "instruction") = 0 AND length("instruction") <= 199000;
