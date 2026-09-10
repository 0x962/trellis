import type { ActorRef } from "@trellis/api";
import type { Emit } from "./db/tx.ts";

// The request context every service receives. `actor` is the person or the
// agent behind the request. `session` is the x-trellis-session header value,
// stored in activity.meta.session. `emit` queues an event on the transaction
// the service runs in; the event leaves after the commit and never before.
export type Ctx = {
	actor: ActorRef;
	session: string | null;
	reqId: string;
	emit: Emit;
};
