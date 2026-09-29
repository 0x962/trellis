import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { EditorFocus } from "../protocol";
import { observeFieldFocus } from "./fieldFocus";

test("tracks actual inspector focus and detaches the listener", async () => {
	const window = new Window();
	const document = window.document;
	document.body.innerHTML =
		'<div data-trellis-node="agent-1" data-trellis-field="instructions"><textarea></textarea></div><div data-trellis-node="agent-1" data-trellis-field="model"><input></div><button>Canvas</button>';
	const events: EditorFocus[] = [];
	const stop = observeFieldFocus(document as unknown as Document, (focus) => events.push(focus));
	document.querySelector("textarea")!.focus();
	document.querySelector("input")!.focus();
	document.querySelector("button")!.focus();
	expect(events).toEqual([
		{ nodeId: "agent-1", field: "instructions" },
		{ nodeId: "agent-1", field: "model" },
	]);
	stop();
	document.querySelector("textarea")!.focus();
	expect(events).toHaveLength(2);
	await window.happyDOM.abort();
});
