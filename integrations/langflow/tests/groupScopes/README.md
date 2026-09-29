# Group scope fixtures

The expansion fixtures cover connected and parallel source graphs.
They keep source node IDs separate from actual engine vertex IDs.
The engine fragment fixtures cover saved activation, a diamond join, failed and skipped children, source order, nested loop context, restart replay, and inherited deadlines.
The first-launch deadline case remains with TRL-1024 because the reserve transport does not exist in this source.

Run these fixtures only after the complete patch batch reaches the pinned engine:

```sh
pytest integrations/langflow/tests/groupScopes integrations/langflow/patches/groupScopes/tests
```

This ticket does not run that command before the batch merge.
