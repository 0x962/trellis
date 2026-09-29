# Group scope fixtures

The expansion fixtures cover connected, parallel, empty, nested, and branch-routed source graphs.
They keep source node IDs separate from actual engine vertex IDs.
The engine fragment fixtures cover saved activation, a diamond join, failed and skipped children, source order, nested loop context, restart replay, inherited deadlines, and journal readback identity.
The first-launch deadline case remains unexecuted with the complete source batch.

Run these fixtures only after the complete patch batch reaches the pinned engine:

```sh
pytest integrations/langflow/tests/groupScopes integrations/langflow/patches/groupScopes/tests
```

This ticket does not run that command before the batch merge.
