# Langflow package probe

This probe owns one Langflow source tree and one Python environment for the feasibility wave.
The pinned source is Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.

The candidate root is `$TMPDIR/trellis-langflow-fec71dca-py312-macos-arm64`.
TRL-667 owns the root and its cleanup.
Keep the source tree and environments unchanged until integrated verification.

Each patch owner supplies a read-only snapshot named by its full SHA256.
The snapshot also contains a manifest with every fixture SHA256 and the focused command.
TRL-667 retains private copies for source review and later integrated verification.
No consumer changes the source tree or the environment.

During integrated verification, record these values before the fixture starts:

- the source commit;
- the SHA256 of the binary Git diff;
- the SHA256 of `uv.lock`;
- the SHA256 of the environment inventory;
- the Python executable and version;
- the import paths and source digests for `langflow` and `lfx`.

The environment inventory uses `uv 0.12.7` and this exact command:

```sh
/opt/homebrew/bin/uv pip freeze --python "$CANDIDATE/venv/bin/python" | LC_ALL=C sort | /usr/bin/shasum -a 256
```

Do not compare this digest with a `pip freeze` digest.
The two tools use different text for editable packages and package names.

The fixture sets `PYTHONDONTWRITEBYTECODE=1` and uses private paths below `runs/<ticket>/<request-id>`.
It runs the environment with frozen dependencies and no sync.
`assertPinnedImports.py` rejects an import outside the patched source tree.
It also checks the private patch SHA256 and its reverse apply.
The overlay manifest covers tracked and untracked patch paths, file modes, and file SHA256 values.
The verifier rejects a source path that the private patch does not own.
It also rejects a patch path that is not a regular file.
Use `--patch-directory src/frontend` when a patch applies below the frontend root.

Copy the complete merged patch series to a private run directory before the apply check.
Use that private copy for the apply and the reverse.
After the integrated fixture, reverse the private patch with `git apply -R`.
Then verify the clean source commit, the empty diff digest, the lock digest, and the environment inventory digest.
A reverse failure or digest change stops all later consumers.
TRL-674 owns the final ordered patch series.

Navid ended the per-ticket serial probe queue on 29 September 2026.
Publish source without another package, engine, editor, browser, or Review check.
Root runs integrated verification after the complete Langflow merge.

The macOS isolation fixture compares two children with the same stripped environment.
The unconfined child can read a same-user file and connect to a private listener.
The sandboxed child can use its private root, but the operating system denies both other actions.
The profile still permits reads of other files that it does not name.
The fixture does not prove full filesystem isolation.
This result proves that environment removal alone is not isolation.

Run these checks after the complete Langflow merge:

```sh
LANGFLOW_PYTHON="$CANDIDATE/venv/bin/python" bun run --cwd integrations/langflow/package-probe test
bun run --cwd integrations/langflow/package-probe typecheck
/Users/navidkhan/projects/trellis/node_modules/.bin/biome check integrations/langflow/package-probe
```
