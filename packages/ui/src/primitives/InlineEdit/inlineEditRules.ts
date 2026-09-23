// The rules of an in-place edit, apart from React and the DOM. `InlineEdit`
// turns a key press and a lost focus into one of these events, and it does
// what the answer says.

// The whole rule of an in-place edit, in words. `InlineEdit` reads it into its
// gallery section, and `docs/UI_PATTERNS.md` prints the same nine sentences.
// `inlineEditRules.test.ts` fails when the document and this list differ.
export const inlineEditRules = [
	"Enter saves the typed value. Losing the focus also saves it.",
	"Escape cancels, and only Escape. The saved value comes back.",
	'An empty value that a person sends with Enter is refused. The field stays open and says "Enter a name.".',
	"An empty value that loses the focus cancels, so nobody is held in a field that a phone keyboard cannot leave.",
	"A value equal to the saved one closes the field. The field sends nothing.",
	"The new value waits for the server. The field takes no more typing until the server answers.",
	"A refusal keeps the field open with the typed value, draws the red border, takes the focus back, and names the reason.",
	"Enter and Escape give the focus to the value. A click outside leaves the focus where the person clicked.",
	"At rest the value is plain text at the size of the text beside it: no box, no pencil, no underline.",
] as const;

// What a person did to the open text field.
export type InlineEditEvent = { kind: "key"; key: string } | { kind: "blur" };

// Where the focus goes when the edit ends.
// "value" puts the focus on the box that holds the value, so the next Tab
// starts from the value. "none" leaves the focus where the person put it.
export type InlineEditFocus = "value" | "none";

// What the field does next.
// "save" sends `value` to the server. "close" shuts the field and sends
// nothing. "refuse" holds the field open, because a value of spaces alone is
// not a name. "ignore" lets the key press put a character in the field.
export type InlineEditAction =
	| { kind: "save"; value: string; focus: InlineEditFocus }
	| { kind: "close"; focus: InlineEditFocus }
	| { kind: "refuse" }
	| { kind: "ignore" };

// `draft` is the text in the field. `saved` is the value the record holds.
export function inlineEditAction(event: InlineEditEvent, draft: string, saved: string): InlineEditAction {
	if (event.kind === "key") {
		if (event.key === "Escape") return { kind: "close", focus: "value" };
		if (event.key !== "Enter") return { kind: "ignore" };
	}
	const trimmed = draft.trim();
	const focus: InlineEditFocus = event.kind === "blur" ? "none" : "value";
	// A person who sends an empty value asks for a name that cannot exist, and
	// the field says so. A person who leaves the field is on the way somewhere
	// else, and a phone keyboard has no Escape key to free them with.
	if (trimmed === "") return event.kind === "blur" ? { kind: "close", focus } : { kind: "refuse" };
	if (trimmed === saved.trim()) return { kind: "close", focus };
	return { kind: "save", value: trimmed, focus };
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

export type InlineEditOptions = {
	// Runs in the moment before `save` starts, so the caller can shut the field
	// to more typing.
	onSaving?: () => void;
};

// The words an empty value shows. The server refuses an empty name with the
// same sentence, so a person reads them whichever side answers.
const emptyMessage = "Enter a name.";

// Runs one ending of an in-place edit. `save` sends the value to the server
// and rejects when the server refuses it.
export async function runInlineEdit(
	event: InlineEditEvent,
	draft: string,
	saved: string,
	save: (value: string) => Promise<void>,
	{ onSaving = () => {} }: InlineEditOptions = {},
): Promise<InlineEditOutcome> {
	const action = inlineEditAction(event, draft, saved);
	if (action.kind === "ignore") return { kind: "typing" };
	if (action.kind === "refuse") return { kind: "refused", value: draft, message: emptyMessage };
	if (action.kind === "close") return { kind: "closed", focus: action.focus };
	onSaving();
	try {
		await save(action.value);
		return { kind: "saved", value: action.value, focus: action.focus };
	} catch (error) {
		return { kind: "refused", value: action.value, message: (error as Error).message };
	}
}
