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
4. It adds the `trellis` route to the gateway routes file.
5. It loads the agent with `launchctl`, waits until `http://127.0.0.1:4521/api/health` answers, and prints the server URL.

`--no-launchd` writes the files and loads nothing. `trellis uninstall` removes the agent and the command.

Agents need the Superset CLI. launchd gives the server a short `PATH`, so `trellis install` writes the full path of the `superset` on your `PATH` into the agent as `TRELLIS_SUPERSET_BIN`. `--superset-bin <path>` names another binary, and `trellis serve` takes the same flag.

A gateway on port 80, such as [margin](https://github.com/0x962/margin), serves `http://trellis.localhost` when it reads the routes file `~/.config/localhost-gateway/routes.json`. The file maps each `*.localhost` name to a port, as in `{ "trellis": 4521 }`. `trellis install` sets the `trellis` entry and keeps the others, and `trellis uninstall` removes it. When no gateway answers for `trellis.localhost`, install prints `http://127.0.0.1:4521` and the path of the routes file.

To run the server in the foreground and not as a launchd agent, run this command in a separate terminal:

```sh test background
trellis serve
```

## Daily use

Open `http://127.0.0.1:4521`. With the optional gateway, open `http://trellis.localhost`. On the first visit, the setup page asks for your name and your first project.

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

### The pages

`/` sends you to Needs you. The sidebar holds Needs you, Search, All tickets,
the project tree, and the AI section with the Personas page.

| Path | Page |
|---|---|
| `/needs-you` | Needs you: review, failing CI, stalled, and done today |
| `/all` | Every ticket as a board |
| `/all/table` | Every ticket as a table |
| `/p/TRL` | The board of a project, which is the view a project opens in |
| `/p/TRL/table` | The table of the same project |
| `/p/TRL/web/auth` | The board of the sub-project `auth` under `web` |
| `/p/TRL/settings` | The settings of a project |
| `/p/TRL/settings/manager` | The manager agent of a project |
| `/t/TRL-42` | One ticket |
| `/search` | Search |
| `/ai/personas` | The personas |
| `/settings` | The settings |
| `/setup` | The first visit, and the new project step |

The URL keeps slashes between project segments, and the API ref joins the same
segments with dots: the page `/p/TRL/web/auth` reads the project `TRL.web.auth`.
A link that ends in `/board` still opens the board, with the segment dropped.
`board` and `settings` are reserved, so no sub-project takes one of those slugs.

Press `g b` for the board and `g t` for the table. The view switch in the topbar
does the same.

![A ticket page with a linked pull request and its check ribbon](docs/images/ticket-pr.png)

The ticket page shows:

- the description and the sub-tickets
- each linked pull request with its check ribbon
- the attachments
- one timeline of comments and activity
- a properties rail with the status, the priority, the parent, and the agents of the ticket

If the title, the branch, or the body of a pull request contains the ticket identifier, trellis links the pull request to the ticket.

### The diff viewer

Each pull request carries a Show diff control. The setting `diffUrlTemplate` names the address it opens, and `{url}` in the template stands for the URL of the pull request. The default is `{url}/files`, the Files changed tab on GitHub. To open the diff in another viewer, set the template to its address. For [margin](https://github.com/0x962/margin), a local review tool that routes on the whole pull request URL:

```
http://margin.localhost/{url}
```

### Keyboard map

Press `?` in the web app for the full list. `Cmd` is `Ctrl` outside macOS.
`packages/api` holds no key map. The one map is `apps/web/src/lib/shortcuts.ts`,
and the help sheet reads it.

| Keys | Scope | Action |
|---|---|---|
| `Cmd+K` | Global | Open the command palette |
| `/` | Global | Search tickets |
| `c` | Global | New ticket |
| `?` | Global | Show the keyboard shortcuts |
| `g h`, `g a`, `g p` | Global | Go to Needs you, All tickets, or a project |
| `g b`, `g t` | Global | Switch to the board or the table |
| `g s` | Global | Focus the filter bar |
| `[` | Global | Collapse or expand the sidebar |
| `Cmd+\` | Global | Switch between dark and light |
| `Escape` | Global | Close the popover, then the peek, then clear the selection |
| `j`, `k` | List | Move to the row below or the row above |
| `Enter`, `Space` | List | Open the peek |
| `o` | List | Open the full page |
| `x` | List | Select or clear the row |
| `Shift+J`, `Shift+K` | List | Extend the selection |
| `s`, `p`, `m` | List | Change the status, the priority, or the project |
| `Shift+P` | List | Set the parent |
| `Backspace` | List | Delete the ticket |
| `1` to `9` | List | Collapse or expand a group |
| `[`, `]` | Board | Move the ticket one column left or right |
| `e` | Ticket | Edit the description |
| `Shift+C` | Ticket | Focus the comment box |
| `Cmd+C`, `Cmd+Shift+C` | Ticket | Copy the ID or the branch name |
| `Cmd+.`, `Cmd+Shift+B` | Ticket | Copy the link or the agent brief |
| `Cmd+Enter` | New ticket | Submit the form |
| `Cmd+Shift+Enter` | New ticket | Create and keep the form open |

## Agents

Run `trellis instructions --project TRL` to print the workflow block below. Paste the block into the `AGENTS.md` file of the repository that the agent works in. The [agent setup guide](docs/agents.md) has the actor rules and the Done rule.

Every write sends the header `x-trellis-actor: <human|agent>:<name>`. The CLI sets the header. Inside Claude Code, every command runs as `agent:claude-code`. Elsewhere, `TRELLIS_ACTOR` or `--as` sets the actor. `trellis whoami` prints how the CLI chose the actor.

### Personas and agent runs

A persona is a local record that trellis shares across every project. It holds a
name, an instruction, and one kind: builder, reviewer, or manager. The Personas
page at `/ai/personas` groups the cards by kind and opens a slideout to create,
edit, and delete a record.

An agent run is one agent that trellis started from a persona. The run copies
the name, the kind, and the instruction of the persona at launch, so a later
edit of the persona changes only the runs after it. A delete of the persona
keeps the copies.

A builder run and a reviewer run name one ticket. A manager run names one
project. A project runs one manager at a time.

Every agent setting of a project lives on its Manager page, at
`/p/<project path>/settings/manager`: the agents switch, the manager persona, the
Superset host, the concurrency limit, and the project directory. The concurrency
limit caps the active ticket agents of the project. It runs from 1 to 64,
defaults to 3, and excludes the manager. The Status section of the same page
opens the manager, reads its output, sends it a follow-up, and stops it.

The Agent section of the ticket rail lists the runs of the ticket and opens a
searchable persona picker. The picker puts the five personas the project used
most at the top and hides the manager kind.

A run carries one state: `starting`, `running`, `interrupted`, `failed`,
`stopped`, or `exited`. A failed launch stays visible with its error. A stop
closes the terminal, and keeps the workspace, the history, and the final output.

### The agent CLI

```sh test
trellis personas list
```

| Command | Purpose |
|---|---|
| `trellis personas list` | List the personas. `--kind` keeps one kind. |
| `trellis personas show <persona>` | Show one persona and its instruction. |
| `trellis agents list` | List the runs. `--ticket` and `--project` narrow the list. |
| `trellis agents start <persona>` | Start a run. `--ticket` for a builder or a reviewer, `--project` for a manager. |
| `trellis agents refresh <id>` | Read the terminal and update the state. |
| `trellis agents stop <id>` | Stop the terminal and keep the workspace and the output. |
| `trellis agents send <id> --text "..."` | Send a follow-up. `--text -` reads stdin. |
| `trellis agents output <id>` | Print the terminal output of a run. |

A persona argument takes the persona id or its name. `trellis agents start`
exits 6 when the run answers in a state other than `running`, and writes the
reason to stderr.

### How trellis starts an agent

The Agents section of `/settings` holds one launch command template for every
agent of the machine. The default is:

```
{{superset}} ws create {{target}} --project {{projectId}} --name {{name}} --branch {{branch}} --command {{agentCommand}} --json
```

The template takes these variables: `{{superset}}`, `{{target}}`, `{{workDir}}`,
`{{projectDir}}`, `{{concurrency}}`, `{{projectId}}`, `{{project}}`,
`{{ticket}}`, `{{name}}`, `{{branch}}`, `{{instruction}}`, `{{prompt}}`,
`{{actor}}`, `{{trellisUrl}}`, and `{{agentCommand}}`. An unknown variable
fails the save. Each value goes in as one quoted shell argument. `{{target}}` is
the Superset host flag of the project: `--local` for This machine, and
`--host '<id>'` for another machine.

A template that holds `{{superset}}` runs the agent in a Superset workspace. A
template without it runs the agent in a private tmux session on a socket of its
own, so the session survives a restart of the trellis server.

`{{prompt}}` is the instruction of the persona plus an assignment block.
`{{agentCommand}}` wraps that prompt: it exports `TRELLIS_URL` and
`TRELLIS_ACTOR`, then runs `claude`. The actor of a run is `agent:<run id>`.

## Ticket workflow (trellis)

Tickets live in trellis, a local tracker at http://127.0.0.1:4521. Use the `trellis` CLI. When you pipe its output, it prints JSON.
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

Read a comment thread: trellis thread show <comment-id>
Reply in that thread: trellis comment TRL-42 --reply-to <comment-id> --body "..."
Resolve a thread: trellis thread resolve <comment-id>
Reopen a thread: trellis thread reopen <comment-id>

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
| `trellis personas list` | List personas. |
| `trellis personas show` | Show one persona and its instruction. |
| `trellis agents list` | List agent runs. |
| `trellis agents start` | Start an agent from a persona. |
| `trellis agents refresh` | Read the terminal and update the state. |
| `trellis agents stop` | Stop an agent. |
| `trellis agents send` | Send an agent a follow-up. |
| `trellis agents output` | Print the terminal output of an agent. |
| `trellis create` | Create a ticket. |
| `trellis show` | Show a ticket. |
| `trellis list` | List tickets. |
| `trellis edit` | Edit a ticket. |
| `trellis move` | Move a ticket to a status. |
| `trellis comment` | Add a comment. `--reply-to` puts it in a thread. |
| `trellis comments` | List comments. |
| `trellis thread show` | Show a comment thread. |
| `trellis thread resolve` | Resolve a comment thread. |
| `trellis thread reopen` | Reopen a comment thread. |
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
| `trellis whoami` | Show how the CLI chose the actor. |
| `trellis instructions` | Print the `AGENTS.md` block, or the prompt of an agent role with `--role`. |
| `trellis status` | Show server status. |
| `trellis logs` | Show server logs. |
| `trellis serve` | Start the server. |
| `trellis install` | Install the local service. |
| `trellis uninstall` | Remove the local service. |
| `trellis backup` | Create a backup. |
| `trellis restore` | Restore a backup. |
| `trellis export` | Stream all data as JSON. |

## Settings

Every setting at `/settings` holds for the whole machine. The nav writes the
section into the URL hash, and Account carries no hash.

| Hash | Section | Contents |
|---|---|---|
| none | Account | Your name and the theme |
| `#agents` | Agents | The agent launch command and the stalled threshold |
| `#integrations` | Integrations | The gh state, the diff URL template, and Pair a phone |

A setting that belongs to one project lives on that project's pages.

| Page | Sections |
|---|---|
| `/p/<path>/settings` | General (no hash), `#template`, `#statuses`, `#repositories`, `#subprojects`, `#archive` |
| `/p/<path>/settings/manager` | Status (no hash), `#general`, `#repositories` |

## Mobile

The phone app is in `apps/mobile` and uses Expo. Every dependency of the app is
in `bundledNativeModules.json` of the installed Expo SDK, so the app runs in
Expo Go and no build step stands between a change and the phone. Metro has to
print a URL the phone can reach, so the packager hostname names this machine:

```sh
cd apps/mobile
REACT_NATIVE_PACKAGER_HOSTNAME=my-mac.tail1a2b3c.ts.net bunx expo start
```

Open Expo Go on the phone and scan the QR code Metro prints.
[apps/mobile/README.md](apps/mobile/README.md) has the full procedure.

The app keeps the server URL, your name, the theme, and the query cache in
`expo-sqlite/kv-store`.

By default, the server listens on `127.0.0.1`, so a phone cannot reach it.

CAUTION: The server has no auth. When you open the server to your network, anyone on the network can reach it.

To open the server to your network, run `trellis install --host 0.0.0.0`. `trellis serve --host` and `TRELLIS_HOST` do the same.

The server answers a request only when its Host header names an IP address, `localhost`, a `*.localhost` name, or the `TRELLIS_HOST` name. A proxy keeps its own hostname in the Host header. To allow a proxy hostname, add it to `TRELLIS_ALLOWED_HOSTS`, a comma-separated list. `trellis install --allow-host <name>` and `trellis serve --allow-host <name>` set the list. Repeat the flag for each name. For Tailscale Serve, which forwards `https://<machine>.<tailnet>.ts.net` to `127.0.0.1:4521`:

```sh
trellis install --allow-host my-laptop.tail1a2b3c.ts.net
```

To pair the phone:

1. In the app, open Settings, then tap the Server row.
2. Tap Scan QR code.
3. Scan the code under Pair a phone in the Integrations section of the web app settings. The app fills in the server URL and tests the connection.
4. Type your name and tap Save.

To pair without the QR code, type the server URL and tap Test connection. The app shows the server version, the ticket count, and the name the server gives you.

## Security model

trellis is a single-user tool for one machine.

- The server binds `127.0.0.1` by default, so only this machine reaches it.
- The server has no authentication.
- The header `x-trellis-actor` records who made a write. It is a label, not authentication.
- CORS allows the development origins only, so a page on another origin cannot read the API.
- `--host 0.0.0.0` puts the tickets, the attachments, the backups, and the export on your network.
- trellis reads GitHub through the `gh` binary and its local login. trellis stores no token.
- The agent launch command is a shell command that the server runs as your account. Anyone who reaches the API writes that template and starts agents with it.

Read [SECURITY.md](SECURITY.md) for the full model and for how to report a vulnerability.

## Data and backups

trellis keeps all data in `~/.trellis`. To use a different directory, set `TRELLIS_HOME`. To use a port other than 4521, set `TRELLIS_PORT`.

`trellis open` and every link in an agent brief start with `http://127.0.0.1:<port>`. When a gateway or a proxy serves trellis under another name, set `TRELLIS_PUBLIC_URL` to that origin, for example `TRELLIS_PUBLIC_URL=http://trellis.localhost`. The CLI reads the same variable.

| Path | Content |
|---|---|
| `db/` | The PGlite database |
| `attachments/` | Uploaded files, stored by content hash |
| `backups/` | Archives from `trellis backup` |
| `agents/` | One directory per agent run: its launch script, its workspace, and its final output |
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

`bun run dev` starts the server on port 4521 and vite on port 5173. Vite sends `/api` and `/rpc` requests to the server. Open `http://127.0.0.1:5173`.

| Command | What it runs |
|---|---|
| `bun run test` | The `bun test` suite of every workspace. |
| `bun run test:repo` | The repository rules and the documentation links in `test/`. |
| `bun run check` | lint, typecheck, test, size-budget, typecheck:repo, and test:repo. Add `--force` to skip the turbo cache. |
| `bun run e2e` | The Playwright suite against the real server and vite on free ports. Run `bunx playwright install chromium` in `apps/web` one time. |
| `bun run perf:10k` | Optional performance tests at 10k rows, one workspace at a time. |
| `bun run perf` | Optional performance tests at 50k rows. |
| `bun run db:generate` | The Drizzle migrations for a change to `apps/server/src/db/schema.ts`. |
| `bun run --cwd apps/mobile test:native` | The mobile Jest suite. |

A web component test drives the real server. `apps/web/test/server` builds the
Hono app of `apps/server` over an in-memory PGlite. The web workspace ships no
fake server.

`test/readme.test.ts` runs each shell block in this README that has the info string `sh test`. The blocks run against a temporary data home, so a command that stops working fails the test.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development loop, the TDD rules, and the review pass.

## License

Apache License 2.0. See [LICENSE](LICENSE).

If you redistribute trellis, or a work derived from it, you must keep the [NOTICE](NOTICE) file and state the files that you changed.
