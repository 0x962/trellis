// The parts of a mouse click that decide where the ticket opens.
export type ClickKeys = {
	// 0 is the primary button. 1 is the middle button.
	button: number;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
};

// True when the click opens the ticket in the sheet. A middle click and a
// click with a modifier key keep the browser behavior of the link, so a
// person still opens the ticket page in a tab or a window.
export const opensSheet = (click: ClickKeys) =>
	click.button === 0 && !click.metaKey && !click.ctrlKey && !click.shiftKey && !click.altKey;
