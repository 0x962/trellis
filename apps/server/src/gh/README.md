# GitHub commands

`createGhRunner()` waits for each command to finish. The runner has no default deadline.
A caller can supply `timeoutMs` to limit each spawned command.
The timeout starts after the command acquires a slot and starts its process.

A caller can supply an `AbortSignal` through `signal` to cancel that runner's calls.
Cancellation removes queued calls and kills active command processes.
The runner waits for process exit and output before it releases an active slot.
Canceled calls return `reason: "error"`, a cancellation message, and any captured stdout.
A nonzero process exit retains its exit code and diagnostic message.

GitHub applies its own deadlines to individual API requests.
Its [GraphQL documentation](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api#timeouts)
and [REST documentation](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#timeouts)
state a ten-second server processing deadline.
A single gh command can make several API requests.
The runner preserves errors from gh instead of imposing an aggregate deadline from those per-request limits.
