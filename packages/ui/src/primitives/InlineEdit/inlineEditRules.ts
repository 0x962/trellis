// The rules of an in-place edit, apart from React and the DOM. `InlineEdit`
// holds no rule of its own: it turns a key press and a lost focus into one of
// these events, and it does what the answer says.

// What a person did to the open text field.
export type InlineEditEvent = { kind: "key"; key: string } | { kind: "blur" };

// Where the focus goes when the edit ends.
// "value" puts the focus on the box that holds the value, so the next Tab
// starts from the value. "none" leaves the focus where the person put it.
export type InlineEditFocus = "value" | "none";

// What the field does next.
// "save" sends `value` to the server. "close" shuts the field and sends
// nothing. "type" lets the key press put a character in the field.
export type InlineEditAction =
	| { kind: "save"; value: string; focus: InlineEditFocus }
	| { kind: "close"; focus: InlineEditFocus }
	| { kind: "type" };

// `draft` is the text in the field. `saved` is the value the record holds.
//
// Enter and a lost focus both save. Escape alone cancels. An empty draft and
// a draft equal to the saved value close the field and send nothing; spaces at
// the two ends never make a new value, so both sides lose them first.
export function inlineEditAction(event: InlineEditEvent, draft: string, saved: string): InlineEditAction {
	if (event.kind === "key") {
		if (event.key === "Escape") return { kind: "close", focus: "value" };
		if (event.key !== "Enter") return { kind: "type" };
	}
	const focus: InlineEditFocus = event.kind === "blur" ? "none" : "value";
	const next = draft.trim();
	if (next === "" || next === saved.trim()) return { kind: "close", focus };
	return { kind: "save", value: next, focus };
}

// What one ending of an edit did.
// "typing" means the key press was not an ending. "closed" means the field
// shut and sent nothing. "saved" means the server took the new value.
// "refused" means the server rejected it, so the field stays open with the
// typed value and `message` says why.
export type InlineEditOutcome =
	| { kind: "typing" }
	| { kind: "closed"; focus: InlineEditFocus }
	| { kind: "saved"; value: string; focus: InlineEditFocus }
	| { kind: "refused"; value: string; message: string };

// Runs one ending of an in-place edit. `commit` sends the value to the server
// and rejects when the server refuses it. `onSaving` runs in the moment before
// `commit` starts, so the caller can shut the field to more typing.
export async function runInlineEdit(
	event: InlineEditEvent,
	draft: string,
	saved: string,
	commit: (value: string) => Promise<void>,
	onSaving: () => void = () => {},
): Promise<InlineEditOutcome> {
	const action = inlineEditAction(event, draft, saved);
	if (action.kind === "type") return { kind: "typing" };
	if (action.kind === "close") return { kind: "closed", focus: action.focus };
	onSaving();
	try {
		await commit(action.value);
		return { kind: "saved", value: action.value, focus: action.focus };
	} catch (error) {
		return { kind: "refused", value: action.value, message: (error as Error).message };
	}
}
