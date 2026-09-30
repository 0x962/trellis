import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { sameOrigin } from "../navigation/navigation";

export function trustRenderer(event: IpcMainInvokeEvent, window: BrowserWindow | undefined, origin: string) {
	if (
		!window ||
		event.sender !== window.webContents ||
		!event.senderFrame ||
		!sameOrigin(event.senderFrame.url, origin)
	)
		throw new Error("Untrusted desktop request.");
}
