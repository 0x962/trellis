# Operator CLI

This guide covers the `trellis` CLI that the desktop app installs. Each command below matches its `--help` output.

Every command reads the server from `TRELLIS_URL` and the actor from `TRELLIS_ACTOR`. An agent also keeps `TRELLIS_RUN_ID`, `TRELLIS_ATTEMPT_TOKEN`, and `TRELLIS_AUTH_TOKEN` in its child commands.

## Inspect host health

```sh
trellis status
trellis doctor
```

`trellis status` prints the server health: version, database, and the `gh` login.
`trellis doctor` prints the execution service and each unresolved attempt with its error.

## Read a ticket brief

```sh
trellis brief TRL-71
```

The brief holds the description, the status, the branch, and the protocol for the agent.

## Assign a ticket agent with a stable request ID

```sh
trellis agents start --ticket TRL-71 --harness claude --model claude-sonnet-4-5 --effort high --request-id 5f0c2d1e-7a44-4a8e-9b1f-3c6d2e8a9b10
```

The ticket assignment selects a harness, a model, and an effort.

Use one request ID for one assignment. Keep the request ID after an uncertain response, and start again with the same ID. The server returns the first agent and does not start a second one. Use a new request ID only for an intentional new assignment.

## Inspect the full terminal output

```sh
trellis agents list --ticket TRL-71
trellis agents output <id>
```

`trellis agents output` prints the complete terminal output from the first byte. After a stop, it prints the saved copy of the output.

The agent state comes from the execution service's record of the actual process:

| State | Source |
|---|---|
| running | the process runs |
| exited | the process exited without an error code |
| failed | the process exited with a code other than 0, or the harness reported an agent error |
| interrupted | the execution service has no live record of the process |

A running process does not prove that the task is complete. Read the output to learn what the agent did. `trellis agents refresh <id>` reads the process status again and records an exit.

## Send a follow-up

```sh
trellis agents send <id> --text "Add a section on stop behavior."
printf 'Add a section on stop behavior.\n' | trellis agents send <id> --text -
```

`--text -` reads the follow-up from stdin. `--interrupt` stops the current turn first, so the agent reads the message before it continues.

A send during a turn goes to the harness at once. The harness queues the text and starts the next turn with it when the current turn ends. `trellis agents session <id>` lists the message in `acknowledgedMessageIds` once that turn starts.

A send can end with an uncertain response: a timeout, a lost connection, or, for a `custom` terminal preset, the error "Terminal input delivery is uncertain." Treat the delivery as unknown. The runtime can write the text before the connection fails, and each send uses a new message ID. Another send can therefore duplicate the work. Run `trellis agents output <id>` to inspect the terminal, but do not treat missing text as proof of non-delivery. If the delivery stays unknown, keep the attempt and ask a person to inspect it.

## Interrupt the current turn

```sh
trellis agents interrupt <id>
```

The interrupt stops the current turn and keeps the agent session. The agent retains the conversation, and the next `trellis agents send` continues it.

## Inspect local PR comments

```sh
trellis review list https://github.com/0x962/trellis/pull/25
trellis review list https://github.com/0x962/trellis/pull/25 --all
```

The comments stay on this machine, not on GitHub. `--all` includes resolved threads. A read changes no comment.

## Stop an agent and keep its workspace

```sh
trellis agents stop <id>
```

The stop ends the terminal process and keeps the workspace and the output. The server saves the output only after the execution service confirms that the process exited. If the service cannot confirm the exit, the stop fails. Inspect the process before you start a replacement.

After a stop, `trellis agents output <id>` still prints the saved output. The workspace directory stays on disk with its branch and files.
