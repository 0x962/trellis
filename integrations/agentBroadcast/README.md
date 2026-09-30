Run the broadcast boundary checks from the repository root:

~~~sh
bun test integrations/agentBroadcast/broadcast.test.ts --timeout 60000
bunx tsc --noEmit -p integrations/agentBroadcast/tsconfig.json
~~~

The fixture uses an isolated database, the real send service, HarnessHost, and the runtime socket.
Node runs the runtime because its native modules use the Node ABI.
Four controlled cat processes act as terminal recipients.
The fixture closes these processes and removes its temporary home after each case.

The checks cover group selection, exact message bytes, delivery after each turn, request replay, changed targets, partial failures, and long request IDs.
The combined selection sends once to each working agent and each idle agent on an unfinished ticket.
An idle session without a ticket receives no broadcast.
They verify terminal transport.
They do not prove that an external provider reads the message.

Broadcasts retain the existing send path and request IDs that fit the runtime.
A longer request ID produces a stable internal digest.
Working terminal recipients use the runtime queue.
Native harnesses retain their existing prompt transport.
The dialog preserves its request ID for an exact retry.
Changed text or a changed group creates a new request.
