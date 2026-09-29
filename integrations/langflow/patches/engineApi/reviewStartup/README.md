# Review gate startup

This fragment registers the existing review gate in the explicit private engine startup. `TRELLIS_ENGINE_API_CONFIG_FILE` remains the sole startup switch.

`create_review_gate_router(...)` remains relative at `/review-classifications`. The shared engine router mounts it once under `/trellis-v1`. The existing projection router remains registered once.

`install_review_gate_transport(...)` uses the same current per-instance origin and credential file as `install_request_transport(...)`. The private engine bearer remains in `TRELLIS_AUTHENTICATION_FILE` and does not enter either outgoing transport.

The source fixture checks the shared origin and exact credential path. It also checks that the startup function names one review router and one projection router. Tests, Review, engine execution, and activation remain deferred.
