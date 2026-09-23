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
// nothing. "empty" holds the field open, because a value of spaces alone is
// not a name. "type" lets the key press put a character in the field.
export type InlineEditAction =
	| { kind: "save"; value: string; focus: InlineEditFocus }
	| { kind: "close"; focus: InlineEditFocus }
	| { kind: "empty" }
	| { kind: "type" };

// `draft` is the text in the field. `saved` is the value the record holds.
//
// Enter and a lost focus both save. Escape alone cancels, and it cancels an
// empty field too, so a person is never held in the field. An empty draft is
// refused. A draft equal to the saved value closes the field and sends
// nothing; spaces at the two ends never make a new value, so both sides lose
// them first.
export function inlineEditAction(event: InlineEditEvent, draft: string, saved: string): InlineEditAction {
	if (event.kind === "key") {
		if (event.key === "Escape") return { kind: "close", focus: "value" };
		if (event.key !== "Enter") return { kind: "type" };
	}
	const next = draft.trim();
	if (next === "") return { kind: "empty" };
	const focus: InlineEditFocus = event.kind === "blur" ? "none" : "value";
	if (next === saved.trim()) return { kind: "close", focus };
	return { kind: "save", value: next, focus };
}

// What one ending of an edit did.
// "typing" means the key press was not an ending. "closed" means the field
// shut and sent nothing. "saved" means the server took the new value.
// "refused" means the value was rejected, so the field stays open with the
// typed value and `message` says why. An empty value and a server that says
// no both end this way, so a person reads one kind of message.
export type InlineEditOutcome =
	| { kind: "typing" }
	| { kind: "closed"; focus: InlineEditFocus }
	| { kind: "saved"; value: string; focus: InlineEditFocus }
	| { kind: "refused"; value: string; message: string };

export type InlineEditRun = {
	// Runs in the moment before `commit` starts, so the caller can shut the
	// field to more typing.
	onSaving?: () => void;
	// What an empty value says. The server refuses an empty name with the same
	// words, so a person reads them whichever way the field ends.
	emptyMessage?: string;
};

// Runs one ending of an in-place edit. `commit` sends the value to the server
// and rejects when the server refuses it.
export async function runInlineEdit(
	event: InlineEditEvent,
	draft: string,
	saved: string,
	commit: (value: string) => Promise<void>,
	{ onSaving = () => {}, emptyMessage = "Enter a name." }: InlineEditRun = {},
): Promise<InlineEditOutcome> {
	const action = inlineEditAction(event, draft, saved);
	if (action.kind === "type") return { kind: "typing" };
	if (action.kind === "empty") return { kind: "refused", value: draft, message: emptyMessage };
	if (action.kind === "close") return { kind: "closed", focus: action.focus };
	onSaving();
	try {
		await commit(action.value);
		return { kind: "saved", value: action.value, focus: action.focus };
	} catch (error) {
		return { kind: "refused", value: action.value, message: (error as Error).message };
	}
}
