# Deterministic native executable

TRL-1046 provides a local executable for the real HarnessHost and execution runtime.
The executable replaces the provider bridge through `TRELLIS_CODEX_BRIDGE`.
It receives actual prompts and submits actual runtime observations over the runtime socket.
Its output is deterministic fixture data, not a provider response.

This is an unexecuted source checkpoint. The complete-batch hold applies to every command below.
No runtime, network-denial, account-selection, or cleanup result exists for this source.
The Langflow candidate, production modules, and `fixtures/nativeHost/` stay unchanged.

## Selection and setup

`prepare.ts` accepts one absolute path to a private JSON file:

```json
{
  "root": "/absolute/TMPDIR/trellis-native-executable-UNIQUE",
  "bun": "/absolute/path/to/existing/bun",
  "plan": {
    "schemaVersion": 1,
    "requestTimeoutMs": 10000,
    "denialPorts": { "ipv4": 41001, "ipv6": 41002 },
    "turns": [
      { "marker": "fixture:complete-one", "mode": "complete", "result": "native-result-one" },
      { "marker": "fixture:hold", "mode": "hold", "result": "" },
      { "marker": "fixture:complete-two", "mode": "complete", "result": "native-result-two" }
    ]
  }
}
```

The example ports and paths are placeholders, not reserved resources.
The setup requires a new `trellis-` directory directly under the caller's `TMPDIR`.
It creates mode-0700 directories and mode-0600 data files.
The account profile is empty except for a synthetic local configuration.
The setup does not read or copy another profile, token, key, or provider credential.

After the hold ends, invoke the setup with the existing Bun executable:

```sh
bun integrations/langflow/fixtures/nativeExecutable/prepare.ts "$NATIVE_SETUP_INPUT"
```

`setup.json` contains `environment`, `accountCreate`, the exact executable paths, and `proof: "unexecuted"`.
The generated `bin/native-fixture` executes the existing Bun through `/usr/bin/sandbox-exec`.
The generated `bin/codex` satisfies the real executable lookup and exits 78 if called directly.
`prepareCodex` selects the bridge and wrapper from the two existing environment overrides.
Neither the production provider CLI nor a replacement HarnessHost runs in this fixture.

The composed host owner must start a separate, private Trellis home with an explicit environment.
Use `setup.environment` as the native environment, not an overlay on the user's shell environment.
Add only the explicit TRL-994 bootstrap and local runtime settings required by that host.
Leave `TRELLIS_EXECUTION_SHELL` unset so a login shell cannot import another profile.
Use absolute paths for the host executable and existing runtime dependencies.
Do not copy `process.env`, the user's home, provider credentials, or real account records.

Create the account through the isolated host's authenticated `POST /api/harness-accounts` route.
Use a human actor and the exact `accountCreate` value from `setup.json`.
Its explicit `profilePath` avoids the managed-profile provisioner, which can link shared directories.
Retain the returned account ID.
Select that account for the native assignment, or make it the default only within this isolated home.
Use the existing `codex` harness preset and a valid catalog model selection.
The fixture does not call the selected model.
Reject an attempt whose saved `CODEX_HOME`, bridge path, or wrapper path differs from `setup.json`.

The setup does not provision TRL-994 engine credentials, initialize its control gate, or qualify an OCI package.
Those inputs require their existing owners and real receipts.

## Prompt and event contract

`bridge/bridge.ts` reads the launch file written by the real `prepareCodex` function.
The initial prompt includes the real `trellis-message:<attemptId>` prefix.
Each prompt must contain exactly one marker from the frozen plan.
An absent or ambiguous marker fails; the fixture does not choose a result from timing or a database row.
Keep scenario instructions synthetic and include their chosen marker in the published document.

| Boundary | Actual behavior |
| --- | --- |
| Session | Send `session` with a new UUID, or the exact retained UUID on resume |
| Accepted prompt | Send `working`, then `prompt` with the complete received prompt and a turn ID |
| Completed turn | Send a complete `message`, then `idle` with `outcome: completed`, result text, and message identity |
| Held turn | Retain the working turn until a real interrupt or process stop |
| Follow-up | Receive authenticated HTTP over the control Unix socket, then emit the same prompt and result sequence |
| Interrupt | Require the current session and turn; emit `idle` with `outcome: interrupted` |
| Process stop | The real runtime stops its owned OS session and records actual exit status |

The bridge imports the repository's real `RuntimeClient` and protocol version.
Every event waits for the runtime response before the next event.
The runtime, not the fixture journal, acknowledges the prompt and stores the completed result.
An unknown RPC response is not retried.

The control server uses `TRELLIS_CODEX_CONTROL_SOCKET` and its exact bearer token from `prepareCodex`.
It accepts only `POST /prompt` and `POST /interrupt`.
An incorrect token returns 401; an incorrect session or turn returns 409.
A second request during a control operation returns 409.
A failed control operation blocks later requests until the owner inspects and stops the failed attempt.
The fixture records hashes and byte counts, not prompt text or control tokens, in its private journal.
The runtime's own private event journal necessarily contains the actual prompt and result.

`sessions/<sessionId>.json` retains the session ID, plan hash, and accepted turn sequence.
Resume requires those bytes and the same profile/root after the prior attempt has a confirmed exit.
A different plan or missing session fails rather than creates a replacement conversation.
Use real `HarnessHost.resume` or the production resume path; do not inject a session event from the test process.
Cross-account session transfer is outside this fixture's contract.

The bridge remains alive after a result so the runtime can deliver a follow-up.
The bridge creates no child processes.
SIGTERM and SIGINT record a signal receipt and exit 143 or 130.
SIGKILL leaves exit evidence with the runtime, not a fabricated shutdown record from the bridge.

## Provider-network denial

`provider-denial.sb` denies network operations and permits only the named runtime and control Unix sockets.
The wrapper supplies those socket paths from the real launch descriptor.
The policy applies to the executable process, independently of environment removal.
The fixture does not use HTTP to submit runtime observations.

`openNetworkControls(timeoutMs)` opens two owned positive-control listeners, on IPv4 and IPv6 loopback.
It proves an unsandboxed connection to each listener before it returns their ports.
Keep these listeners alive while the native processes start.
Use their actual ports in the frozen plan.
The bridge attempts those connections inside the sandbox before it sends its session event.
Only `EPERM` or `EACCES` counts as denial.
A timeout, refused connection, unsupported address, or successful connection fails the bridge startup.
Retain each positive-control count and each child denial receipt.
The counts must not increase when the sandboxed bridge attempts its connections.

The source profile uses the Unix socket filters present in the host's system sandbox profiles.
Its actual acceptance and effect remain unverified until the matched batch runs.
The policy is for the deterministic native fixture on macOS, not the Langflow OCI isolation boundary.
It does not claim filesystem isolation, hostile-code containment, or a supported Linux native-fixture target.
No real provider address, account, key, or API is used by the denial check.

## Deferred real-runtime fixture

`nativeExecutable.test.ts` requires an existing, private execution runtime supplied by the batch owner.
It imports the real HarnessHost and RuntimeClient, with no spies or direct result writes.
It opens the positive controls and creates one new private fixture root.
It checks completion, follow-up prompt acknowledgement, interrupt, stop, and resume with the same session ID.
It also checks rejected control tokens, session IDs, and turn IDs.
The supplied input file has these fields:

```json
{
  "root": "/absolute/TMPDIR/trellis-native-executable-UNIQUE",
  "runtimeHome": "/absolute/private-home/runtime",
  "runtimeSocket": "/absolute/private-home/runtime/runtime.sock",
  "bun": "/absolute/path/to/existing/bun",
  "requestTimeoutMs": 10000,
  "observationTimeoutMs": 30000
}
```

The owner must supply the actual socket path from the private runtime manifest.
The fixture refuses a socket outside the supplied runtime home.
The example deadlines bound the probe, not the application or a flow.
After the complete batch is released:

```sh
TRELLIS_NATIVE_FIXTURE_TEST_INPUT="$NATIVE_TEST_INPUT" \
  bun test integrations/langflow/fixtures/nativeExecutable/nativeExecutable.test.ts
```

This focused result does not prove account selection or dispatch through the composed public HTTP routes.
TRL-697 must retain those observations from its published-document journey.

## Private evidence and cleanup interface

| Output | Required meaning |
| --- | --- |
| `setup.json`, frozen plan, source hashes | Exact fixture selection and deterministic data |
| `evidence/<attemptId>.jsonl` | Actual PID, runtime identity, denial codes, prompt hashes, event acknowledgements, and signal observations |
| `sessions/<sessionId>.json` | Retained session and plan identity across attempts |
| `evidence/native-runtime.json` | Focused real-runtime assertions, only written after those assertions succeed |
| Runtime inspect/exit records | Actual attempt, PID identity, result identity, OS-session stop, and exit code |
| Account/API receipts | Actual isolated account creation, selected assignment, and composed dispatch |
| `evidence/cleanup.json` | Confirmed exit of the named fixture attempts and removal of their control socket directories |

The proof has two phases. The prerequisite does not depend on the current composed run.

Before invocation, `nativeAdapterReceipt` binds prior focused proof to the source, plan, private home, account, and runtime.
Retain the actual account creation and read receipts, plus its effective profile selection for that focused proof.
Retain the prior HarnessHost events, positive controls, OS denial, resume identity, and observed exits.
The current account/profile and executable bytes must match those accepted inputs.
The focused test alone does not create an account or prove its selection through the account API.
The owner must supply those separate observations before it accepts the prerequisite.

After invocation, retain the current scenario's actual account and assignment selection, dispatch, attempts, session IDs, and PID identities.
Bind its prompt/result identities and cleanup records to the published document and current execution.
Account creation alone does not prove that this scenario selected the account.
Prior focused proof does not prove the current HTTP journey.

Include each evidence path, SHA256, and scope in its owner receipt.
Do not treat `setup.json`, a matching hash, or this README as a passing receipt.
Label the focused result `native runtime proof with deterministic data; no actual provider proof`.

`cleanup.ts` accepts a private JSON file with `root`, `runtimeSocket`, `attemptDirectory`, `attemptIds`, and `requestTimeoutMs`.
Use the real host's `harness-attempts` directory for a composed run.
The focused test uses its own `attempts` directory.
Record attempt IDs as soon as the launch request reserves them, including failed or uncertain launches.

```sh
bun integrations/langflow/fixtures/nativeExecutable/cleanup.ts "$NATIVE_CLEANUP_INPUT"
```

The cleanup function verifies the saved fixture root, executable, and launch arguments before it requests a runtime stop.
It requires observed exit and a missing PID before it removes the exact control socket and empty parent directory.
It never signals a PID directly or shuts down a shared runtime.
An unknown owner, incomplete runtime response, surviving PID, or nonempty socket directory stops cleanup.
Unobserved attempt IDs remain explicit in the receipt; they do not prove a prior process exited.
The function retains the private fixture root and evidence for inspection and resume proof.

The batch owner's `cleanupCommandFile` must also close the positive-control listeners in a `finally` block.
It must stop the exact isolated Trellis host, then confirm its runtime, native attempts, and OCI resources through their owners.
This fixture's cleanup receipt covers only its named native attempts.
Archive required evidence before the owner removes the exact scratch root.
Do not remove another account, workspace, runtime, container, or browser process.
