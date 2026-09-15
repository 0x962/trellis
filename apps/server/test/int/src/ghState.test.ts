import { describe, expect, test } from "bun:test";
import { createBus } from "../../../src/events/bus.ts";
import type { GhResult, GhRunner } from "../../../src/gh/run.ts";
import { createGhState } from "../../../src/ghState.ts";

const AT = new Date("2026-09-10T12:00:00.000Z");
const SIGNED_IN: GhResult = {
	ok: true,
	code: 0,
	stdout: "github.com\n  Logged in to github.com account dana (keyring)\n",
	stderr: "",
};

// A gh runner that answers every call with `result` and counts the calls.
const fakeGh = (result: GhResult) => {
	const calls: string[][] = [];
	const runner = Object.assign(
		async (_slot: string, args: string[]) => {
			calls.push(args);
			return result;
		},
		{ bin: "gh", timeoutMs: 1000 },
	) as GhRunner;
	return { runner, calls };
};

const setup = (result: GhResult = SIGNED_IN) => {
	const bus = createBus({ bootId: "boot" });
	const gh = fakeGh(result);
	const state = createGhState({ bus, gh: gh.runner, now: () => AT });
	return { bus, gh, state };
};

describe("createGhState", () => {
	test("reports not checked until the first check", () => {
		const { state } = setup();
		expect(state.current()).toEqual({
			ok: false,
			user: null,
			reason: "error",
			message: "The server checks gh at startup. The check did not finish.",
			checkedAt: null,
		});
	});

	test("check() runs gh auth status and keeps the answer", async () => {
		const { state, gh } = setup();
		await state.check();
		expect(gh.calls).toEqual([["auth", "status"]]);
		expect(state.current()).toEqual({
			ok: true,
			user: "dana",
			reason: null,
			message: null,
			checkedAt: AT.toISOString(),
		});
	});

	test("a gh.status sign-out on the bus sets the state with no gh call", async () => {
		const { bus, state, gh } = setup();
		await state.check();
		bus.emit({ type: "gh.status", ok: false, reason: "unauthenticated" });
		expect(gh.calls).toHaveLength(1);
		expect(state.current()).toEqual({
			ok: false,
			user: null,
			reason: "unauthenticated",
			message: null,
			checkedAt: AT.toISOString(),
		});
	});

	// The event carries no user, so a sign-in asks gh who signed in.
	test("a gh.status sign-in after a sign-out checks gh again for the user", async () => {
		const { bus, state, gh } = setup();
		bus.emit({ type: "gh.status", ok: false, reason: "unauthenticated" });
		bus.emit({ type: "gh.status", ok: true });
		await Bun.sleep(0);
		expect(gh.calls).toEqual([["auth", "status"]]);
		expect(state.current()).toMatchObject({ ok: true, user: "dana" });
	});

	test("read() during a check waits for the check and answers with its result", async () => {
		const { state } = setup();
		const checking = state.check();

		const read = await state.read();

		expect(read).toMatchObject({ ok: true, user: "dana" });
		expect(await checking).toEqual(read);
	});

	test("read() with no check running answers with the kept state and runs no gh", async () => {
		const { state, gh } = setup();
		await state.check();

		expect(await state.read()).toMatchObject({ ok: true, user: "dana" });
		expect(gh.calls).toHaveLength(1);
	});

	test("two checks at the same time run one gh auth status", async () => {
		const { state, gh } = setup();

		const [first, second] = await Promise.all([state.check(), state.check()]);

		expect(gh.calls).toEqual([["auth", "status"]]);
		expect(second).toEqual(first);
	});

	// The poller also sends { ok: true } when the rate limit budget changes.
	test("a gh.status ok event while gh is ready changes nothing", async () => {
		const { bus, state, gh } = setup();
		await state.check();
		bus.emit({ type: "gh.status", ok: true });
		await Bun.sleep(0);
		expect(gh.calls).toHaveLength(1);
		expect(state.current()).toMatchObject({ ok: true, user: "dana" });
	});
});
