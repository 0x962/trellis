# Group scope fixtures

The expansion fixtures cover connected and parallel source graphs.
The engine fragment fixtures cover a diamond join, a failed child, a skipped child, source order, nested loop context, restart replay, and inherited deadlines.

Run these fixtures only after the complete patch batch reaches the pinned engine:

```sh
pytest integrations/langflow/tests/groupScopes integrations/langflow/patches/groupScopes/tests
```

This ticket does not run that command before the batch merge.
