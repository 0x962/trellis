// Two Escape presses inside this time leave the terminal. 500 ms is the macOS
// double-click interval. A slower second press is a second interrupt for the
// process.
export const escapePairMs = 500;

const isBareEscape = (event: KeyboardEvent) =>
	event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

// Decides for each key press inside the terminal. The return value goes to
// xterm: true sends the key to the process, false keeps it out. Every press
// gets `stopPropagation`, which keeps it from the listeners on the document
// and the window, so a `PageSheet` that closes on Escape stays open and the
// Escape that navigates back does not run.
//
// A harness such as Claude Code uses Escape to stop its own work, so one
// Escape goes to the process. A second Escape inside `escapePairMs`, or
// Control+], leaves the terminal. `onLeave` owns every exit: the session
// sheet closes itself there, and a terminal with no sheet around it moves the
// focus to the session heading.
export function terminalKeys(onLeave: () => void): (event: KeyboardEvent) => boolean {
	// The time of the first Escape of an open pair.
	let firstEscapeMs: number | null = null;
	// The keydown of an Escape writes this. The keyup of the same press reads
	// it, so both events get the same result.
	let escapeLeaves = false;
	return (event) => {
		if (isBareEscape(event)) {
			// A held key repeats. The repeats belong to the press that started
			// them, so they never make a pair.
			if (event.type === "keydown" && !event.repeat) {
				escapeLeaves = firstEscapeMs !== null && event.timeStamp - firstEscapeMs <= escapePairMs;
				firstEscapeMs = escapeLeaves ? null : event.timeStamp;
				if (escapeLeaves) onLeave();
			}
			event.stopPropagation();
			return !escapeLeaves;
		}
		firstEscapeMs = null;
		event.stopPropagation();
		if (event.ctrlKey && event.key === "]") {
			if (event.type === "keydown") onLeave();
			return false;
		}
		return true;
	};
}
