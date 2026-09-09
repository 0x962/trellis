# trellis

trellis is a local ticket tracker for agent-driven work. It runs on one machine with no auth and no assignees. Every action carries an actor name and an actor kind, human or agent. A ticket holds its pull request and the CI status of that pull request, because for agent work the PR is the deliverable and CI is the first reviewer.

Status: under construction, see [docs/design/plan.md](docs/design/plan.md).

## Develop

```sh
bun install
bun run check
```

`bun run check` runs lint, typecheck, and every test. See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev loop and [AGENTS.md](AGENTS.md) for the repo rules.

## License

MIT, see [LICENSE](LICENSE).
