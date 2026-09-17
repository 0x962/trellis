UPDATE personas SET instruction = instruction || E'\n\n' || $muse$## Muse harness

Muse is a built-in harness next to Claude, Codex, OpenCode, and Pi. Its preset is muse. Its models are the Muse Spark models of the catalog, such as meta/muse-spark-1.3, and its default is meta/muse-spark-1.3.
A Muse account is a Meta login. harnessAccounts.quota reports signed_out for a profile without a login and unsupported for a signed-in profile, because Muse exposes its subscription windows only inside a running session. Treat unsupported Muse quota as unknown quota.
A Muse worker runs with the sandbox disabled and every approval granted. A Muse manager runs without shell and file writes and reaches Trellis through its tools only.
Send follow-ups to a Muse agent with agentRuns.send. A busy Muse session queues the message for its next turn.$muse$, updated_at=now() WHERE kind='manager' AND instruction NOT LIKE '%## Muse harness%';
