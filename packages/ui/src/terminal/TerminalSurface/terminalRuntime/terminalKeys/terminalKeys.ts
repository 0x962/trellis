// Two Escape presses that are this close together, or closer, leave the
// terminal. 500 ms is the macOS double-click interval, so the pace is one a
// person already has in their fingers. A slower second press is a second
// interrupt for the process.
export const escapePairMs = 500;

const isBareEscape = (event: KeyboardEvent) =>
	event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

// Decides, for each key press inside the terminal, whether the process
// receives it and whether the page around the terminal sees it.
//
// The return value is the answer xterm wants: true sends the key to the
// process, false keeps it out of the process. `stopPropagation` is the answer
// the page wants: a key press that the terminal stops never reaches the
// listeners on the document and the window, so a `PageSheet` that closes on
// Escape stays open and the Escape that navigates back does not run.
//
// A harness such as Claude Code reads Escape itself, to stop what it is
// doing, so a single Escape belongs to the process. The person leaves with a
// second Escape inside `escapePairMs`, or with Control+].
//
// The leaving press reaches the page, which closes the sheet around the
// terminal. `onLeave` covers the terminal that sits on a page and not in a
// sheet: it returns the focus to the heading of the session.
//
// The first press of a pair still goes to the process, so an agent receives
// every Escape a person types.
export function terminalKeys(onLeave: () => void): (event: KeyboardEvent) => boolean {
	// The time of the last Escape that went to the process, and null when the
	// next Escape starts a new pair. A key press of any other kind clears it,
	// so a pair means two Escapes in a row.
	let openPair: number | null = null;
	// The answer the keydown of the current Escape gave. The keyup of that
	// same press repeats it.
	let leaving = false;
	return (event) => {
		if (isBareEscape(event)) {
			// A held key repeats. The repeats belong to the press that started
			// them, so they never make a pair.
			if (event.type === "keydown" && !event.repeat) {
				leaving = openPair !== null && event.timeStamp - openPair <= escapePairMs;
				openPair = leaving ? null : event.timeStamp;
				if (leaving) onLeave();
			}
			if (leaving) return false;
			event.stopPropagation();
			return true;
		}
		openPair = null;
		event.stopPropagation();
		if (event.ctrlKey && event.key === "]") {
			if (event.type === "keydown") onLeave();
			return false;
		}
		return true;
	};
}
