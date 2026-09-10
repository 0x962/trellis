# trellis

![The Needs you page in dark theme, with a review queue and a failing CI section](docs/images/needs-you.png)

## What it is

trellis is a local ticket tracker for work that humans give to coding agents. One server on your machine stores:

- projects and tickets
- comments and attachments
- linked pull requests and their CI results

Agents use the `trellis` CLI or the HTTP API. Each write records the name of the actor that made it. You use the web app, or the mobile app on your phone. The Needs you page shows the tickets that wait for a human: reviews, failing CI, and stalled work. An agent can move a ticket to review. Only a human can move a ticket to Done.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the stack, the domain rules, the schema, and the API.

## Install

trellis needs [Bun](https://bun.sh) 1.3. The launchd service needs macOS. To see pull requests and CI, install `gh` and run `gh auth login`.

Version 0.1 publishes no package. The CLI installs from a clone, and the clone stays on disk, because the installed command and the launchd service run the server from it.

```sh test skip
git clone https://github.com/0x962/trellis.git
cd trellis
bun install
```

Run the install command one time from the clone:

```sh
bun packages/cli/src/index.ts install
```

`trellis install` does these steps:

1. It builds the web app into `apps/web/dist`.
2. It writes the `trellis` command to `~/.local/bin/trellis`. Add `~/.local/bin` to your `PATH`.
3. It writes the launchd agent `~/Library/LaunchAgents/com.trellis.server.plist`. The agent starts the server at login and starts it again after a crash.
4. It loads the agent with `launchctl` and waits until `http://127.0.0.1:4521/api/health` answers.
5. It prints the gateway line for `http://trellis.localhost`.

`--no-launchd` writes the files and loads nothing. `trellis uninstall` removes the agent and the command.

To serve trellis at `http://trellis.localhost`, add this line to `ROUTES` in `~/projects/margin/src/gateway.ts`:

```ts
trellis: 4521,
```

Then restart the gateway with `launchctl kickstart -k gui/$UID/com.margin.gateway`. `trellis install --gateway` adds the line and restarts the gateway.

To run the server in the foreground and not as a launchd agent, run this command in a separate terminal:

```sh test background
trellis serve
```

## Daily use

Open `http://trellis.localhost`. Without the gateway, open `http://127.0.0.1:4521`. On the first visit, the setup page asks for your name and your first project.

Create a project and a ticket from the CLI:

```sh test
trellis projects create --key TRL --name trellis
```

```sh test
trellis create -p TRL -t "Write the README"
```

In a terminal, the CLI prints aligned text. When you pipe the output or pass `--json`, the CLI prints JSON:

```sh test
trellis list --project TRL --json
```

![A ticket page with a linked pull request and its check ribbon](docs/images/ticket-pr.png)

The ticket page shows:

- the description and the sub-tickets
- each linked pull request with its check ribbon
- the attachments
- one timeline of comments and activity

If the title, the branch, or the body of a pull request contains the ticket identifier, trellis links the pull request to the ticket.

### Keyboard map

Press `?` in the web app for the full list. `Cmd` is `Ctrl` outside macOS.

| Keys | Action |
|---|---|
| `Cmd+K` | Open the command palette |
| `/` | Search tickets |
| `c` | New ticket |
| `g h`, `g a`, `g p` | Go to Needs you, All tickets, or a project |
| `g b`, `g t` | Switch to the board or the table |
| `j`, `k` | Move to the next row or the row above |
| `Enter`, `o` | Open the peek or the full page |
| `x` | Select the row |
| `s`, `p`, `m` | Change the status, the priority, or the project |
| `a`, `r` | Approve the ticket or send it back |
| `e` | Edit the description |
| `Cmd+Enter` | Submit the form |
| `Cmd+\` | Switch between dark and light |

## Agents

Run `trellis instructions --project TRL` to print the workflow block below. Paste the block into the `AGENTS.md` file of the repository that the agent works in. The [agent setup guide](docs/agents.md) has the actor rules and the Done rule.

Every write sends the header `x-trellis-actor: <human|agent>:<name>`. The CLI sets the header. Inside Claude Code, every command runs as `agent:claude-code`. Elsewhere, `TRELLIS_ACTOR` or `--as` sets the actor. `trellis whoami` prints how the CLI chose the actor.

## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://trellis.localhost. Use the `trellis` CLI. When you pipe its output, it prints JSON.
Inside Claude Code, every command runs as `agent:claude-code`. Elsewhere, set `TRELLIS_ACTOR=agent:<name>`.

1. Pick work:        trellis list --project TRL --status todo
2. Read the ticket:  trellis show TRL-42 --comments
3. Start:            trellis move TRL-42 in-progress
4. Put the identifier in the branch name, for example TRL-42-dark-mode. If the title, branch, or body of a PR contains TRL-42, trellis links the PR. To link a PR by hand: trellis pr add TRL-42 <url>
5. Split work:       trellis sub TRL-42 -t "Write tests"
6. Ask a question:   trellis comment TRL-42 --body "..." and then wait for the reply: trellis watch --ticket TRL-42
7. Finish coding:    trellis move TRL-42 agent-review
8. When CI is green and the self-review is done: trellis move TRL-42 human-review
Never move a ticket to Done; a human does that. Never delete tickets.

Without the CLI, use the HTTP API. It has the same actions. This call creates a ticket:
curl -X POST http://127.0.0.1:4521/api/tickets -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' -d '{"project":"TRL","title":"First"}'
The OpenAPI spec is at http://127.0.0.1:4521/api/openapi.json.

### Exit codes

A failed command writes one line to stderr: `error: <message> (<CODE>)`.

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Server error |
| 2 | Usage error |
| 3 | Not found |
| 4 | Refused or conflict, for example an agent that moves a ticket to Done |
| 5 | Server unreachable |
| 6 | gh unavailable |
| 7 | CLI newer than the server |

## CLI cheat sheet

Global flags: `--json`, `--jsonl`, `--quiet`, `--as`, `--url`, and `--no-color`. `--url` defaults to `TRELLIS_URL`, then `http://127.0.0.1:4521`.

| Command | Purpose |
|---|---|
| `trellis projects list` | List projects. |
| `trellis projects create` | Create a project. |
| `trellis projects show` | Show a project. |
| `trellis projects move` | Move a project. |
| `trellis projects repos` | Add or remove project repositories. |
| `trellis statuses list` | List statuses. |
| `trellis statuses add` | Add a status. |
| `trellis statuses edit` | Edit a status. |
| `trellis statuses rm` | Remove a status. |
| `trellis statuses clear` | Clear inherited statuses. |
| `trellis create` | Create a ticket. |
| `trellis show` | Show a ticket. |
| `trellis list` | List tickets. |
| `trellis edit` | Edit a ticket. |
| `trellis move` | Move a ticket to a status. |
| `trellis comment` | Add a comment. |
| `trellis comments` | List comments. |
| `trellis attach` | Add an attachment. |
| `trellis attachments` | List attachments. |
| `trellis pr add` | Link a pull request. |
| `trellis pr list` | List pull requests. |
| `trellis pr rm` | Unlink a pull request. |
| `trellis pr refresh` | Refresh pull request data. |
| `trellis pr diff` | Show a pull request diff. |
| `trellis sub` | Create a sub-ticket. |
| `trellis delete` | Delete a ticket. |
| `trellis search` | Search tickets. |
| `trellis activity` | List ticket or project activity. |
| `trellis brief` | Print an agent brief. |
| `trellis inbox` | Show work that needs a human. |
| `trellis watch` | Stream events. |
| `trellis open` | Print or open a ticket URL. |
| `trellis whoami` | Show how the CLI chose the actor. |
| `trellis instructions` | Print the agent workflow. |
| `trellis status` | Show server status. |
| `trellis logs` | Show server logs. |
| `trellis serve` | Start the server. |
| `trellis install` | Install the local service. |
| `trellis uninstall` | Remove the local service. |
| `trellis backup` | Create a backup. |
| `trellis restore` | Restore a backup. |
| `trellis export` | Stream all data as JSON. |

## Mobile

The iOS app is in `apps/mobile` and uses Expo. The app stores its settings in a native module, so it runs as a development build, not in Expo Go. This command uses Xcode to build the app and install it on a simulator or a connected iPhone:

```sh
cd apps/mobile
bunx expo run:ios
```

By default, the server listens on `127.0.0.1`, so a phone cannot reach it.

CAUTION: The server has no auth. When you open the server to your network, anyone on the network can reach it.

To open the server to your network, run `trellis install --host 0.0.0.0`. `trellis serve --host` and `TRELLIS_HOST` do the same.

To pair the phone:

1. In the app, open Settings, then Server.
2. Tap Scan QR code.
3. Scan the code under Pair a phone in the web app settings. The app fills in the server URL and tests the connection.
4. Type your name and tap Save.

To pair without the QR code, type the server URL and tap Test connection. The app shows the server version and the ticket count.

## Security model

trellis is a single-user tool for one machine.

- The server binds `127.0.0.1` by default, so only this machine reaches it.
- The server has no authentication.
- The header `x-trellis-actor` records who made a write. It is a label, not authentication.
- CORS allows the development origins only, so a page on another origin cannot read the API.
- `--host 0.0.0.0` puts the tickets, the attachments, the backups, and the export on your network.
- trellis reads GitHub through the `gh` binary and its local login. trellis stores no token.

Read [SECURITY.md](SECURITY.md) for the full model and for how to report a vulnerability.

## Data and backups

trellis keeps all data in `~/.trellis`. To use a different directory, set `TRELLIS_HOME`. To use a port other than 4521, set `TRELLIS_PORT`.

| Path | Content |
|---|---|
| `db/` | The PGlite database |
| `attachments/` | Uploaded files, stored by content hash |
| `backups/` | Archives from `trellis backup` |
| `server.log` | The server log, rotated at 10 MB with five files kept |

`trellis backup [dest]` creates a consistent archive while the server runs. The server keeps the ten newest backups in the default directory. To restore an archive, stop the server. Then run `trellis restore <archive>`. The command refuses while the server runs. `trellis export` streams all data as JSON.

## Architecture

![The trellis architecture](docs/architecture.svg)

The web app, the mobile app, and the CLI share the contract from `@trellis/api`.
Only the web app imports the tokens and primitives from `@trellis/ui`.
Only the local server reads and writes the database. The server sends live updates as server-sent events.

## Development

```sh
bun run dev
```

`bun run dev` starts the server on port 4521 and vite on port 5173. Vite sends `/api` and `/rpc` requests to the server. Open `http://localhost:5173`.

| Command | What it runs |
|---|---|
| `bun run check` | Lint, typecheck, every test, the web size budget, and the perf suite at 10k rows. Add `--force` to skip the turbo cache. |
| `bun run e2e` | The Playwright suite against the real server and vite on free ports. Run `bunx playwright install chromium` in `apps/web` one time. |
| `bun run perf` | The perf suite at 50k rows. |
| `bun run db:generate` | The Drizzle migrations for a change to `apps/server/src/db/schema.ts`. |
| `bun run --cwd apps/mobile test:native` | The mobile Jest suite. |

`test/readme.test.ts` runs each shell block in this README that has the info string `sh test`. The blocks run against a temporary data home, so a command that stops working fails the test.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development loop, the TDD rules, and the review pass.

## License

MIT. See [LICENSE](LICENSE).
