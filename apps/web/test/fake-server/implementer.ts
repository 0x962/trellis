import { implement } from "@orpc/server";
import { type ActorHeader, ActorHeaderSchema, actorHeaderGrammar, contract } from "@trellis/api";
import type { EventBus } from "./events";
import { fail } from "./fail";
import type { Hooks } from "./hooks";
import type { State } from "./state";

// One recorded procedure call: the dotted path, the raw input, and the
// actor header as sent. The input is the client's own, before validation.
export type Call = { path: string[]; input: unknown; actor: string | null };

export type BaseContext = {
	state: State;
	bus: EventBus;
	calls: Call[];
	// The one-shot failures and holds a test arms with `failNext` and `holdNext`.
	hooks: Hooks;
	actorHeader: string | null;
	// The `If-Match` version on a PATCH, mapped to expectedVersion.
	ifMatch: number | null;
	resHeaders: Headers;
	versions: { server: string; api: string };
};

// Every procedure runs through this middleware. A mutation needs a valid
// actor header; a read ignores it. Every call is recorded for the tests. An
// armed hold delays the handler until the test releases it; an armed
// failure throws the declared error in place of the handler.
export const os = implement(contract)
	.$context<BaseContext>()
	.use(async ({ context, next, procedure, path }, input) => {
		const method = procedure["~orpc"].route.method ?? "POST";
		const parsed = context.actorHeader === null ? null : ActorHeaderSchema.safeParse(context.actorHeader);
		let actor: ActorHeader | null = parsed?.success ? parsed.data : null;
		if (method !== "GET") {
			if (parsed === null) throw fail("ACTOR_REQUIRED", undefined);
			if (!parsed.success) throw fail("ACTOR_INVALID", { grammar: actorHeaderGrammar });
			actor = parsed.data;
		}
		context.calls.push({ path: [...path], input, actor: context.actorHeader });
		const name = path.join(".");
		const hold = context.hooks.takeHold(name);
		if (hold !== undefined) await hold;
		const failure = context.hooks.takeFailure(name);
		if (failure !== undefined) throw fail(failure.code, failure.data as never);
		return next({ context: { actor } });
	});

export type Context = BaseContext & { actor: ActorHeader | null };
