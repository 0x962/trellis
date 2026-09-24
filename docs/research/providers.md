# Providers

Proposed on 2026-09-23 for TRL-428. A provider is an external model gateway that Trellis holds a key for: a name, a kind, a base URL, an API key, an enabled flag, and the models that Trellis offers from it. The first kind is Vercel AI Gateway. The second kind is any OpenAI-compatible endpoint.

The epic Jev wants Trellis to call `typesafe-ai/jev`, an evaluation model that TypeSafe AI serves through Vercel AI Gateway. That call needs a key that the Trellis server holds. No record in Trellis holds a key today: `harness_accounts` stores a profile path, and the harness CLI owns every credential. The provider record is that key holder. This document plans the record and its CRUD. The evaluation call and the harness launch through a provider come later, and the last section names their seams.

Out of scope for the CRUD: the evaluation call, a launch through a provider, a cost report from the gateway, encryption at rest, a provider per project, and more than one key per provider.

## What the gateway gives

The facts below come from the Vercel documentation on 2026-09-23.

- Base URL `https://ai-gateway.vercel.sh`. The REST API and the OpenAI-compatible API sit under `/v1`. A coding agent uses `/coding-agent/v1`. Claude Code uses `/claude-code`, Codex uses `/codex/v1`.
- Authentication: `Authorization: Bearer <key>`. A key belongs to a Vercel team. The dashboard creates a key and shows its value once.
- `GET /v1/models` needs no authentication. It returns `{ object: "list", data: [...] }`. Each entry carries `id` (`creator/model`, such as `anthropic/claude-opus-5`), `name`, `type` (`language`, `embedding`, `reranking`, `image`, `video`), `tags`, `context_window`, `max_tokens`, and `pricing`.
- `GET /v1/credits` needs the key. It returns `{ balance: "95.50", total_used: "4.50" }` in USD. A bad key answers 401. This call proves a key.
- `POST /v1/evaluate` needs the key. The body is `{ model: "typesafe-ai/jev", state, questions }`. A question is `boolean`, `choice`, or `score`. The answer carries a probability per question, token usage, and the cost.
- The model catalog of Trellis, `packages/api/src/models/catalog.json`, already holds gateway ids. `scripts/update-model-catalog.ts` reads `GET /v1/models` and keeps the tool-capable language models of four creators. `typesafe-ai/jev` is not in the catalog, so a provider cannot validate its models against the catalog.
- Pi and OpenCode already launch through the gateway: `toHarnessModel` in `packages/api/src/models/models.ts` writes `vercel-ai-gateway/<id>` and `vercel/<id>`. Their key lives in the harness profile, outside Trellis.

## Data model

Table `providers`, in `apps/server/src/db/tables/providers.ts`, exported from `apps/server/src/db/schema.ts`:

| column | type and constraint |
|---|---|
| id | text PK, ULID |
| name | text NOT NULL, CHECK trimmed and 1 to 120, UNIQUE on `lower(name)` |
| kind | text NOT NULL, `checkIn(kind, PROVIDER_KINDS)`: `vercel-ai-gateway`, `openai-compatible` |
| base_url | text NOT NULL, CHECK length 1 to 2000 |
| api_key | text NOT NULL |
| enabled | boolean NOT NULL DEFAULT true |
| created_at, updated_at | `at()` NOT NULL |

Table `provider_models`, in the same file:

| column | type and constraint |
|---|---|
| provider_id | text NOT NULL, FK providers(id) ON DELETE CASCADE |
| model_id | text NOT NULL, CHECK matches `^[a-z0-9-]+/[a-z0-9._-]+$` |
| | PK (provider_id, model_id) |

A row in `provider_models` is a model that the provider offers in Trellis. The web and the CLI read the list as `models: string[]`. An update replaces the whole set. The set is not checked against the catalog: `typesafe-ai/jev` and an OpenAI-compatible endpoint both serve ids that the catalog does not hold.

`base_url` has a default per kind in the API, not in the database: `https://ai-gateway.vercel.sh` for `vercel-ai-gateway`. An `openai-compatible` provider needs an explicit URL. The URL is stored without a trailing slash and without `/v1`. A caller appends the path it needs, because the gateway has more than one surface.

A provider is deleted, not archived. Nothing references a provider today. The ticket that adds `agent_runs.provider_id` adds it with ON DELETE SET NULL, so a deleted provider leaves the run.

One migration, generated with `bun run db:generate` and numbered after the newest journal tag, which is `0114_status_without_reviewer` on 2026-09-23. Keep the snapshot. The SQL holds the two tables, their checks, and the index. Never edit an earlier migration.

## Where the key lives

The key is a column in the database. The reasons:

- Trellis runs for one person on one machine. The data home is mode 0700, and the desktop host token already sits there as a plain file, `desktop-token`, mode 0600. An agent runs as the same user and can read the database, a file, and the macOS Keychain through `security find-generic-password` alike. No store on this machine hides the key from an agent, so the choice is about simplicity and about leaks in output.
- A column is written in the same transaction as the row. A file beside the row needs a prepare step and leaves an orphan when the transaction fails.
- The Keychain is what the Vercel CLI uses. Trellis rejects it because it hides nothing from an agent that runs as the same user, and because a `security` call adds a subprocess to every read.

Two rules keep the key out of every output:

- The API never returns `api_key`. `ProviderSchema` carries `keyLast4`, the last four characters. The row select in `rows.ts` never lists the column, so a new procedure cannot leak it by accident.
- `exportNdjson` in `apps/server/src/services/system.ts` gains `REDACTED_COLUMNS = { providers: ["api_key"] }`. The page query replaces a redacted column with `'<redacted>'`. There is no import, so the redaction breaks no round trip.

## Refs and API

A provider has no ref grammar. The API takes the ULID, as `harnessAccounts` does. Schemas in `packages/api/src/schemas/provider.ts`, re-exported from `schemas/index.ts`:

```
ProviderKindSchema = z.enum(["vercel-ai-gateway", "openai-compatible"])
ProviderSchema = { id, name, kind, baseUrl, keyLast4, enabled, models: string[], createdAt, updatedAt }
ProviderCreateInputSchema = { name, kind, baseUrl?, apiKey, enabled?, models? }
ProviderUpdateInputSchema = { id, name?, baseUrl?, apiKey?, enabled?, models? }   // absent keeps the value
ProviderIdInputSchema = { id }
ProviderCatalogEntrySchema = { id, name, type }
ProviderCheckSchema = { ok: boolean, balance: string | null, detail: string | null }
```

`apiKey` is `z.string().trim().min(1, "Paste the API key of the provider.")`. `baseUrl` is `z.string().url()` with the trailing slash removed. `models` is `z.array(ProviderModelIdSchema)` with the id pattern of the table. Every input is a `z.strictObject`.

Contract `packages/api/src/contract/providers.ts`, registered in the contract index as `providers: oc.tag("providers").router(providers)`, with a tag entry in `apps/server/src/openapiText.ts`:

| procedure | route |
|---|---|
| providers.list | GET /api/providers → Provider[], by name |
| providers.get | GET /api/providers/{id} → Provider |
| providers.create | POST /api/providers, 201 and `Location: /api/providers/{id}` |
| providers.update | PATCH /api/providers/{id} |
| providers.delete | DELETE /api/providers/{id} → { id } |
| providers.catalog | GET /api/providers/{id}/catalog → ProviderCatalogEntry[] |
| providers.check | GET /api/providers/{id}/check → ProviderCheck |

Errors: a taken name is `DUPLICATE` with field `name`; a missing id is `NOT_FOUND` with kind `provider`. A mutation from an agent actor fails with `invalidInput("actor", "Only a person can manage providers.")`, the rule of `harnessAccounts`. A person pastes the key, and an agent must not create a record that spends money.

`providers.catalog` fetches `GET <baseUrl>/v1/models` and returns the `language` entries as `{ id, name, type }`. The gateway needs no key for that call. An OpenAI-compatible endpoint gets the key in the header, because the OpenAI format requires one. `providers.check` fetches `GET <baseUrl>/v1/credits` with the key. A 200 answers `ok: true` with the balance. A 401 answers `ok: false` with `detail: "The key was refused."`. An OpenAI-compatible endpoint has no credits route, so `check` calls `GET /v1/models` with the key instead and answers with `balance: null`. Both run in the `prepare` step of the registry, outside the transaction, because a network call inside a PGlite transaction holds the one lane. The network is a system boundary, so these two services catch the fetch error and return it in `detail`.

Event: `providers.changed` with payload `{ id }`, in the pattern of `flows.changed`. `packages/api/src/query-keys.ts` invalidates the `providers` family. The bus gives an event with no project an empty scope, so every subscriber receives it.

The server code lives in `apps/server/src/services/providers/`: `providers.ts` (list, get, create, update, remove), `rows.ts` (the select without `api_key`, the models lateral, `toProvider`), `catalog.ts` and `check.ts` (the two fetches). The procedures are in `apps/server/src/procedures/providers.ts`. The registry entries use the `io` family, so `create` and `update` reach `ctx.afterCommit` and `ctx.emit`. Tests sit beside the service, and they use `openTestDb` from `apps/server/src/db/testDb.ts`.

## CLI

`packages/cli/src/commands/providers.ts`, registered in `verbs.ts` beside `accounts`:

```
trellis providers list
trellis providers show <id>
trellis providers add --name "Vercel" --kind vercel-ai-gateway --api-key - [--base-url url] [--model id ...]
trellis providers edit <id> [--name] [--base-url] [--api-key -] [--enabled true|false] [--model id ...]
trellis providers rm <id>
trellis providers catalog <id>
trellis providers check <id>
```

`--api-key` accepts only `-`, so the key arrives on stdin through `readText` and never in `ps` output or shell history. `--model` repeats and replaces the set. The table columns are id, name, kind, enabled, models count, and key hint. An agent actor gets the mutation refusal of the API.

## Web

Providers live on the Usage page, Agent tab, in a section "Providers" under the Accounts section. The reason: a provider is a paid login of the machine, as an account is, and the account card already draws the shapes a provider needs: a name, a login state, a balance, and a circular action row. No new element.

- `apps/web/src/features/usage/UsagePage/components/UsageProviders/UsageProviders.tsx`: `SectionHeader` "Providers" with a `Tooltip` and an `IconButton` (Plus). `Skeleton` while the list loads, an error line with `role="alert"`, and the empty state "No providers. A provider is a model gateway that Trellis holds a key for."
- `components/UsageProviderCard/UsageProviderCard.tsx`: an `article` in the account card grid. The top row prints the name and the kind. The middle prints the balance from `providers.check` or the refusal, and the count of enabled models. The action row holds `IconButton` with `Tooltip`: PencilSimple (edit), ArrowClockwise (check the key), Trash (remove). A disabled provider prints "Off" in the state slot, no color.
- `packages/ui/src/domain/ProviderForm/ProviderForm.tsx`: a `Dialog` with a form in the shape of `HarnessAccountForm`: `Input` name, `Select` kind, `Input` base URL (filled with the default of the kind, shown for `openai-compatible`), `Input` API key of type password, a `Switch` enabled, and the model list. Edit opens the same dialog. The key field is empty on edit, and a blank key keeps the stored one.
- The model list is a `Command` inside a `Popover` from a `PickerButton`, the shape of `ModelPicker`. Its items come from `providers.catalog`. A checked item is an enabled model. A free-text item accepts an id that the catalog does not list, such as `typesafe-ai/jev`.
- Remove uses `ConfirmDialog` in danger mode: "Remove <name>? Trellis forgets its key."
- Mutations wrap `client.providers.create`, `update`, and `delete` in `useMutation` and invalidate `orpc.providers.list.key()` on success. The SSE event covers a change from the CLI.

Web tests render the card and the form to static markup and check the strings, in the pattern of the label group row tests.

## Tickets

Three tickets under TRL-428, in order:

1. Provider record, API, and CLI: the two tables, the migration, the schemas, the contract, the services, the procedures, the event, the export redaction, the CLI command, and the rows in `docs/ARCHITECTURE.md` (a `### Providers` section after `### Harness accounts`, a row in the schema table, and a row in the API table). Server tests for create, update, delete, the duplicate name, the agent refusal, and the absence of `api_key` in every output.
2. Catalog and check: `providers.catalog`, `providers.check`, their CLI verbs, and tests with a stubbed fetch. Waits on 1.
3. Providers on the Usage page: the section, the card, the form, the model picker, and the remove dialog. Waits on 1 and 2. Evidence: screenshots of the empty state, the form, a card with a balance, and a card with a refused key.

## Later, not in these tickets

- The Jev call. `apps/server/src/services/providers/evaluate.ts` posts to `<baseUrl>/v1/evaluate` with the key of the first enabled `vercel-ai-gateway` provider that offers `typesafe-ai/jev`. The caller passes the state and the questions. This is the first consumer of the record.
- A launch through a provider. `profileEnvironment` in `apps/server/src/services/harnessAccounts/profiles.ts` is the seam. A run with a provider adds the harness variables: `ANTHROPIC_BASE_URL=<baseUrl>/claude-code` and `ANTHROPIC_AUTH_TOKEN=<key>` for Claude; a `model_providers.vercel` block in `config.toml` with `base_url=<baseUrl>/codex/v1` and `wire_api="responses"` for Codex; the first-party gateway provider of Pi and OpenCode with the key. The models of the provider join `modelsForHarness`. That ticket adds `agent_runs.provider_id`.
- Cost. `GET /v1/report` groups spend by model and day for a paid team. The Usage page can join it to the provider card.

## Decision for Navid

The one open choice is the home of the web section. The plan puts it on the Usage page beside the accounts. The alternative is a `providers` section in the Settings sheet, which today holds account, notifications, and desktop and has no create action. The rest of the plan does not change with that choice.
