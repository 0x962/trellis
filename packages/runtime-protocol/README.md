# Runtime client

`RuntimeClient` sends each RPC call through a separate Unix socket.
A call waits for its response or a transport failure by default.
The optional constructor argument `timeoutMs` sets a caller-selected socket idle timeout.
A paged `list` retains completed pages with `complete: false` when that explicit timeout expires.

`call(method, params, signal)` accepts an optional `AbortSignal`.
`hello(signal)`, `list(input, signal)`, and `listPage(input, signal)` also accept that signal.
A signal passed to `list` covers the capability request and every page.
Use `AbortSignal.timeout(milliseconds)` when an operation requires a caller-selected deadline.

Cancellation rejects with the signal reason and closes the request socket.
An aborted signal prevents the connection before dispatch.
After dispatch, cancellation stops the local wait; the runtime operation can still complete.
Read the saved runtime state before a repeat mutation.
