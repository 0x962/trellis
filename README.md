# trellis

![The Needs you page in dark theme, with a review queue and a failing CI section](docs/images/needs-you.png)

## What it is

trellis is a local ticket tracker for work that humans give to coding agents. One server on your machine keeps every project, ticket, comment, attachment, linked pull request, and CI result. Agents use the `trellis` CLI or the HTTP API, and every write carries the name of the actor that made it. You use the web app, or the mobile app on your phone. The Needs you page collects the tickets that wait for a human: reviews, failing CI, and stalled work. An agent can move a ticket to review, but only a human moves it to Done.

The [approved plan](docs/design/plan.md) defines the v1 product.

## Install

trellis needs [Bun](https://bun.sh) 1.3 and macOS for the launchd service. Install `gh` and run `gh auth login` to see pull requests and CI.

```sh test skip
git clone git@github.com:0x962/trellis.git
cd trellis
bun install
```

Run the install command once from the clone:

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

Agents need the Superset CLI. launchd gives the server a short `PATH`, so `trellis install` writes the full path of the `superset` on your `PATH` into the agent as `TRELLIS_SUPERSET_BIN`. `--superset-bin <path>` names another binary, and `trellis serve` takes the same flag.

To serve trellis at `http://trellis.localhost`, add this line to `ROUTES` in `~/projects/margin/src/gateway.ts`:

```ts
trellis: 4521,
```

Then restart the gateway with `launchctl kickstart -k gui/$UID/com.margin.gateway`. `trellis install --gateway` adds the line and restarts the gateway for you.

To run the server in the foreground and not as a launchd agent, run it in its own terminal:

```sh test background
trellis serve
```

## Daily use

Open `http://trellis.localhost`, or `http://127.0.0.1:4521` without the gateway. On the first visit, the setup page asks for your name and your first project.

Create a project and a ticket from the CLI:

```sh test
trellis projects create --key TRL --name trellis
```

```sh test
trellis create -p TRL -t "Write the README"
```

The CLI prints aligned text in a terminal and JSON when you pipe it or pass `--json`:

```sh test
trellis list --project TRL --json
```

![A ticket page with a linked pull request and its check ribbon](docs/images/ticket-pr.png)

The ticket page shows the description, the sub-tickets, each linked pull request with its check ribbon, the attachments, and one timeline of comments and activity. A pull request links itself when its title, branch, or body carries the ticket identifier.

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

Run `trellis instructions --project TRL` to print the workflow block below. Paste it into the `AGENTS.md` file of the repository that the agent works in. The [agent setup guide](docs/agents.md) gives more detail.

Every write carries the header `x-trellis-actor: <human|agent>:<name>`. The CLI sets it for you: inside Claude Code every command runs as `agent:claude-code`, and `TRELLIS_ACTOR` or `--as` sets it elsewhere. `trellis whoami` prints how the CLI chose the actor.

## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://trellis.localhost. Use the `trellis` CLI. It prints JSON when piped.
Identify yourself: inside Claude Code every command runs as `agent:claude-code`. Elsewhere set `TRELLIS_ACTOR=agent:<name>`.

1. Pick work:        trellis list --project TRL --status todo
2. Read the ticket:  trellis show TRL-42 --comments
3. Start:            trellis move TRL-42 in-progress
4. Put the identifier in the branch name, for example TRL-42-dark-mode. A PR whose title, branch, or body carries TRL-42 links itself. To link one by hand: trellis pr add TRL-42 <url>
5. Split work:       trellis sub TRL-42 -t "Write tests"
6. Ask a question:   trellis comment TRL-42 --body "..." and then wait for the reply: trellis watch --ticket TRL-42
7. Finish coding:    trellis move TRL-42 agent-review
8. When CI is green and the self-review is done: trellis move TRL-42 human-review
Never move a ticket to Done; a human does that. Never delete tickets.

Without the CLI, the HTTP API takes the same actions. One call creates a ticket:
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
| `trellis projects repos` | Manage project repositories. |
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
| `trellis activity` | List ticket activity. |
| `trellis brief` | Print an agent brief. |
| `trellis inbox` | Show work that needs a human. |
| `trellis watch` | Stream events. |
| `trellis open` | Print or open a ticket URL. |
| `trellis whoami` | Show actor resolution. |
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

The iOS app lives in `apps/mobile` and uses Expo. It stores its settings in a native module, so it runs as a development build and not in Expo Go. Xcode builds it and installs it on a simulator or a connected iPhone:

```sh
cd apps/mobile
bunx expo run:ios
```

The server listens on `127.0.0.1` by default, so a phone cannot reach it. Run `trellis install --host 0.0.0.0` to open it to your network (`trellis serve --host` and `TRELLIS_HOST` do the same). The server has no auth, so anyone on the network can reach it.

The server answers a request only when its Host header names an IP address, `localhost`, a `*.localhost` name, or the `TRELLIS_HOST` name. A proxy keeps its own hostname in the Host header. To allow a proxy hostname, add it to `TRELLIS_ALLOWED_HOSTS`, a comma-separated list. `trellis install --allow-host <name>` and `trellis serve --allow-host <name>` set the list. Repeat the flag for each name. For Tailscale Serve, which forwards `https://<machine>.<tailnet>.ts.net` to `127.0.0.1:4521`:

```sh
trellis install --allow-host canary-jqv57w1hpl.tail4a5b4c.ts.net
```

To pair the phone, open Settings, then Server in the app. Tap Scan QR code and scan the code under Pair a phone in the web app settings. The app fills in the server URL and tests the connection. To pair by hand, type the server URL and tap Test connection. The app shows the server version and the ticket count. Type your name and tap Save.

## Data and backups

trellis keeps all data under `~/.trellis`. Set `TRELLIS_HOME` to use a different directory, and `TRELLIS_PORT` to use a port other than 4521.

| Path | Content |
|---|---|
| `db/` | The PGlite database |
| `attachments/` | Uploaded files, stored by content hash |
| `backups/` | Archives from `trellis backup` |
| `server.log` | The server log, rotated at 10 MB with five files kept |

Run `trellis backup [dest]` to create a consistent archive while the server stays available. The server keeps the ten newest default backups. To restore an archive, stop the server first and run `trellis restore <archive>`; the command refuses while the server runs. `trellis export` streams all data as JSON.

## Architecture

![The trellis architecture](docs/architecture.svg)

The web app, mobile app, and CLI share the contract from `@trellis/api`.
Only the web app imports the tokens and primitives from `@trellis/ui`.
The local server owns all database access and sends live updates through server-sent events.

## Development

```sh
bun run dev
```

`bun run dev` starts the server on port 4521 and vite on port 5173, with `/api` and `/rpc` proxied to the server. Open `http://localhost:5173`.

| Command | What it runs |
|---|---|
| `bun run check` | Lint, typecheck, every test, the web size budget, and the perf suite at 10k rows. Add `--force` to skip the turbo cache. |
| `bun run e2e` | The Playwright suite against the real server and vite on free ports. Run `bunx playwright install chromium` in `apps/web` once. |
| `bun run perf` | The perf suite at 50k rows. |
| `bun run db:generate` | The Drizzle migrations for a change to `apps/server/src/db/schema.ts`. |
| `bun run --cwd apps/mobile test:native` | The mobile Jest suite. |

A shell block in this README with the info string `sh test` runs in `test/readme.test.ts` against a temp data home, so the commands above stay true.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development loop, the TDD rules, and the review pass.

## License

MIT, see [LICENSE](LICENSE).
