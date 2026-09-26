import { type BrowserWindow, shell } from "electron";
import { isCopyLinkChord } from "../copyLinkChord/copyLinkChord.ts";
import type { HostConnection } from "../host/host.ts";
import { openSafeWebLink, sameOrigin } from "../navigation/navigation.ts";
import { secureLinkBrowser } from "../secureLinkBrowser/secureLinkBrowser.ts";
import { authorizedHostRequest } from "./authorizedHostRequest/authorizedHostRequest.ts";

export function secureRenderer(window: BrowserWindow, connection: () => HostConnection) {
	window.webContents.on("will-navigate", (event, url) => {
		if (!sameOrigin(url, connection().origin)) event.preventDefault();
	});
	window.webContents.on("will-attach-webview", secureLinkBrowser);
	window.webContents.on("did-attach-webview", (_event, page) => {
		page.on("before-input-event", (event, input) => {
			if (!isCopyLinkChord(input)) return;
			event.preventDefault();
			window.webContents.send("trellis:browser-copy-link");
		});
	});
	window.webContents.setWindowOpenHandler(({ url }) => {
		openSafeWebLink(url, (url) => shell.openExternal(url));
		return { action: "deny" };
	});
	const rendererSession = window.webContents.session;
	rendererSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
	rendererSession.setPermissionCheckHandler(() => false);
	rendererSession.webRequest.onBeforeSendHeaders((details, callback) => {
		const host = connection();
		if (!window.isDestroyed() && authorizedHostRequest(details, window.webContents.id, host.origin))
			details.requestHeaders.Authorization = `Bearer ${host.token}`;
		else delete details.requestHeaders.Authorization;
		callback({ requestHeaders: details.requestHeaders });
	});
}
