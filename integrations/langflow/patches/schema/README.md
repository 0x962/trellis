# Trellis feasibility table migration

The patch targets Langflow v1.12.3 at `fec71dca901949c09ed4d63315804337cd2eb13d`.

Patch SHA-256: `ce6045c74cba13e39ad774ca580dd47c74ccfecbfb6ceedd5964bd00e453d5a6`.

The migration follows Langflow revision `386662af02e9`. It adds these production tables:

- `trellis_job_correlations`
- `trellis_decision_acceptances_v1`
- `trellis_decision_enqueue_obligations_v1`

The columns, indexes, and unique constraints match the SQLModel tables in the correlation and decision patches.

The migration does not add `trl668_fake_native_admissions`. That table belongs only to the correlation fixture.

Read-only `git apply --check --cached` passed against the pinned source index. The source index tree remained `e6ac634257b30645b6c35bcc707ed271789877d6`.

The integrated SQLite and Postgres migration checks remain pending.
