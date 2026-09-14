# Security

## The security model

trellis is a single-user tool for one machine. Local agents run under the same operating system account as the host.

- The server binds `127.0.0.1` by default. Only a process on the same machine can reach it.
- The desktop host requires a bearer token and rejects a browser origin that differs from its host origin.
- A standalone server requires a bearer token when `TRELLIS_AUTH_TOKEN` is set. Without that variable, it accepts requests without authentication.
- The desktop keeps the token outside the renderer. Its session adds the token only to requests from its window to its exact host origin.
- The header `x-trellis-actor` is a label. It records who made a write. It is not authentication, and any client can send any value.
- The agent policy is a guard rail, not a permission system. An agent that sends `human:<name>` moves a ticket to Done.
- CORS allows the two development origins only: `http://localhost:5173` and `http://trellis.localhost`. Every other origin gets no CORS header, so a page elsewhere cannot read the API from a browser.
- An attachment downloads unless its type is in the inline allowlist. The file route sets `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`, so an uploaded SVG or HTML file never runs as script on the app origin.

## Agents run shell commands

The agent launch command is a template in the settings. `PUT /api/settings`
writes it, and a start of an agent runs it as a shell command under the account
that runs the server. `POST /api/choose-directory` opens a folder picker on the
server computer, and `POST /api/agent-runs` starts an agent.

An authenticated client can set a command template and start an agent. If authentication is disabled, any client that reaches the API can do this.

An agent gets its own actor, `agent:<run id>`. A native attempt also gets a token in `TRELLIS_ATTEMPT_TOKEN`.
The API checks that token and the current attempt before it accepts that actor's writes.
The host stores the token hash. A stopped or replaced attempt cannot use its old token to write as that run.
The actor header remains a caller-supplied label. This check does not sandbox a process with the user's filesystem and host credentials.

The native runtime uses an owner-only Unix socket and a lifetime file lock.
The structured Claude harness requires explicit repository trust and human tool permission decisions.
Worktrees separate file changes. They do not restrict operating system access.

## The network flag

`trellis serve --host 0.0.0.0` and `TRELLIS_HOST=0.0.0.0` bind every interface.
`trellis install --host 0.0.0.0` does the same for the installed service. The
mobile app needs this flag, because a phone cannot reach `127.0.0.1`.

CAUTION: If authentication is disabled, on `0.0.0.0` anyone who reaches the
port reads and writes every ticket, reads and downloads every attachment,
triggers a backup, and streams the full export.

Use the flag on a network you trust. Use `127.0.0.1` otherwise.

## GitHub access

trellis reads pull requests and CI results through the `gh` binary on the
machine. It runs `gh` as the user who runs the server, with the login that
`gh auth login` stored. trellis stores no GitHub token of its own, and asks for
no scope of its own. A repository that the local `gh` login can read is a
repository that trellis can read.

`trellis pr diff` and the diff view run `gh pr diff` and cut the output at 1 MB.

## Data on disk

The standalone server writes to `~/.trellis`, and `TRELLIS_HOME` moves that
directory. The desktop uses its application data directory. The database, the attachments, the backups, and the log carry no
encryption. They inherit the permissions of the account that runs the server.

## Report a vulnerability

Report a vulnerability through a private GitHub security advisory. Open
`https://github.com/0x962/trellis/security/advisories/new` and describe the
issue. Do not open a public issue for a vulnerability.

Include the version, the platform, the steps that reproduce the issue, and what
an attacker gains. Expect a first reply within 7 days.
