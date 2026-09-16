import { expect, test } from "bun:test";
import type { ActorRef } from "@trellis/api";
import { recipientsOf } from "./recipients.ts";

const live = [
	{ id: "01J8Z6X4Q3M2K1H0G9F8E7D6G1", personaName: "Builder", terminalId: "t1", sessionId: null },
	{ id: "01J8Z6X4Q3M2K1H0G9F8E7D6G2", personaName: "Careful reviewer", terminalId: "t2", sessionId: null },
	{ id: "01J8Z6X4Q3M2K1H0G9F8E7D6G3", personaName: "Trellis", terminalId: "t3", sessionId: null },
];
const dana: ActorRef = { kind: "human", name: "dana" };
const names = (body: string, actor: ActorRef = dana) => recipientsOf(live, body, actor).map((run) => run.personaName);

test("without a mention every live agent receives the message, except the author", () => {
	expect(names("hello all")).toEqual(["Builder", "Careful reviewer", "Trellis"]);
	expect(names("hello all", { kind: "agent", name: live[0]!.id })).toEqual(["Careful reviewer", "Trellis"]);
});

test("a mention by run id, or by a persona name with a space, selects those agents", () => {
	expect(names(`@${live[0]!.id.toLowerCase()} rebase`)).toEqual(["Builder"]);
	expect(names("@careful reviewer and @Trellis please look")).toEqual(["Careful reviewer", "Trellis"]);
});

test("a mention that names no live agent restricts nothing", () => {
	expect(names("@dana asked for this")).toEqual(["Builder", "Careful reviewer", "Trellis"]);
	expect(names("email me at a@b.c")).toEqual(["Builder", "Careful reviewer", "Trellis"]);
});

test("a mention inside a code span does not select", () => {
	expect(names("run `@Builder` verbatim")).toEqual(["Builder", "Careful reviewer", "Trellis"]);
});
