import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { installStoryObserver, type StoryCheck } from "./installStoryObserver";

const fixture = () => {
	const listeners = new Map<string, (value: unknown) => void>();
	const events = new Map<string, (value: unknown) => void>();
	const browser = {
		top: undefined as unknown,
		__trellisStoryCheck: undefined as StoryCheck | undefined,
		__STORYBOOK_ADDONS_CHANNEL__: undefined as unknown,
		addEventListener: (name: string, callback: (value: unknown) => void) => events.set(name, callback),
	};
	browser.top = browser;
	let clears = 0;
	const storage = { clear: () => clears++ };
	runInNewContext(`(${installStoryObserver.toString()})()`, {
		window: browser,
		localStorage: storage,
		sessionStorage: storage,
	});
	browser.__STORYBOOK_ADDONS_CHANNEL__ = {
		on: (name: string, callback: (value: unknown) => void) => listeners.set(name, callback),
	};
	return {
		state: browser.__trellisStoryCheck!,
		emit: (name: string, value: unknown) => listeners.get(name)!(value),
		request: (procedure: string, configured: boolean) =>
			events.get("trellis:story-request")!({ detail: { procedure, configured } }),
		clears,
	};
};

test("a render during play does not finish the story check", () => {
	const run = fixture();
	expect(run.clears).toBe(2);
	run.emit("storyRenderPhaseChanged", { newPhase: "playing" });
	run.emit("storyFinished", { status: "success" });
	expect(run.state.finished).toBe(false);
	run.emit("storyRenderPhaseChanged", { newPhase: "played" });
	run.emit("storyFinished", { status: "success" });
	expect(run.state.finished).toBe(true);
});

test("play exceptions and a failed Storybook result remain failures", () => {
	const run = fixture();
	run.emit("playFunctionThrewException", { message: "The submit control is missing." });
	run.emit("storyFinished", { status: "error" });
	expect(run.state.errors).toEqual([
		"The submit control is missing.",
		"Storybook reports a failed story or play action.",
	]);
});

test("a missing fixture fails while a configured error response stays available", () => {
	const run = fixture();
	run.request("projects.list", true);
	run.request("tickets.get", false);
	expect(run.state.errors).toEqual(["Missing fixture: tickets.get"]);
});

test("a sandboxed document keeps its own storage boundary", () => {
	const browser = { top: {}, __trellisStoryCheck: undefined };
	runInNewContext(`(${installStoryObserver.toString()})()`, { window: browser });
	expect(browser.__trellisStoryCheck).toBeUndefined();
});
