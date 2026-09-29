# Group deadline reservation

`reserveGroupDeadline(ctx, tx, {request, capabilityId})` is a system service. The request contains proof from the engine journal reader. The service locks the execution and verifies its current authority, open admission, publication, job, epoch, and cancellation barrier.

The frozen publication supplies the group definition and budget. The service compares that definition with the engine proof. It derives a stable deadline ID from the execution, publication, scope vertex, exact occurrence, and inherited deadline references. A changed budget or occurrence identity conflicts with the retained record.

A new record has null launch, deadline, and launch receipt fields. `recordLaunchClocks` starts it from the first observed native launch receipt. Repeated reservation retains the original clock. The response appends the current deadline reference after the inherited references and retains the earliest deadline.

`deadlineHandler` serves POST `/api/langflow-private/v1/group-deadlines`. Its body contains executionId, publicationId, engineJobId, engineEpoch, scopeVertexId, and occurrenceKey. The capability header selects the saved grant. `withAuthenticatedNativeReservation` holds authentication for the current engine instance through the callback.

`groupScopeReader` calls POST `/trellis-v1/group-scopes/read` through the private engine client. The reader requires exact retained occurrence, scope, and group definition proof. The handler does not accept those fields from its caller.

TRL-696 owns the route mount, supervisor callback, and ServiceTransport connection. TRL-983 owns the engine journal reader and caller. The focused fixtures cover reservation, replay, frozen definitions, inherited deadlines, delayed launch receipts, rollback, cancellation, and readback errors. Execution remains deferred until the complete source batch.
