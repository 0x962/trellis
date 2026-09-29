# Deferred occurrence checks

Run the journal fixtures only after the complete matched source batch is applied in the retained environment:

```sh
"$LANGFLOW_PYTHON" -m pytest "$TRELLIS_SOURCE/integrations/langflow/tests/occurrenceRequests" -q
```

The Python path must include the matched Trellis source and the engine backend and lfx roots.
The fixtures cover retained request bytes, nested iteration identities, original deadlines, NO replacement, round limits, and static hashes.
These fixtures do not prove the engine transaction or graph continuation.

The integrated batch must also trace a real native visit through reservation and completion.
Kill the process before the call, after remote reservation, and after the handle commit.
Reopen the same stores and compare the request bytes and exact native attempt at each point.
Trace human NO, restart, and YES through one actual vertex. Assert that no successor runs before YES.
Verify atomic journal and graph writes, parallel roots, nested conditions, original deadlines, and the approved round limit.
Run Python and TypeScript against the same static specification examples before accepting their hash contract.
