export function terminalKeyEvent(event: KeyboardEvent, onLeave: () => void): boolean {
	if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return false;
	event.stopPropagation();
	if (event.ctrlKey && event.key === "]") {
		if (event.type === "keydown") onLeave();
		return false;
	}
	return true;
}
