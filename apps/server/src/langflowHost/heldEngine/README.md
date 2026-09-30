# Held engine operations

`withHeldEngine(supervisor, operation)` enters the real supervisor once.
The callback receives `{ observation, supervisor: held }`.
The real supervisor retains the current instance until this callback and every entered operation finish.

Create `EngineReconciliation` and `CaptureAuthority` inside the callback with `held` as their supervisor.
Their nested callbacks receive copies of the same retained observation.
Use that observation for the worker prepare and commit requests.
Await the engine lease release before the callback returns.

The held adapter rejects new operations after the callback ends.
An exception still awaits entered operations before the real supervisor scope returns.
Callers must await each operation and handle its result before the next step.
An unknown response or worker refusal retains the durable dispatch block and engine lease.

`LangflowHostControl.openCapture({ home })` reads the existing external identity and dispatch store.
Its `HostCaptureControl` exposes `read`, `closeDispatch`, `waitForDrain`, and `blockDispatch` on `gate`.
The full dispatch gate and capture control share the same close and drain implementation.
`CaptureAuthority` requires only the control identity.
The prepared worker service owns reconciliation and release through its full control and concrete evidence producer.

The held supervisor protects process retirement, while the durable engine lease excludes engine database writers.
Lifecycle pause, exact native locks, and the worker transaction remain separate required boundaries.
The caller supplies those boundaries across the worker prepare and commit operations.
