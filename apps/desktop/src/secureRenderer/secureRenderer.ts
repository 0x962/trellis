import { type BrowserWindow, shell } from "electron";
import type { HostConnection } from "../host/host.ts";
import { hostRequest } from "../hostRequest/hostRequest.ts";
import { externalUrl, sameOrigin } from "../navigation/navigation.ts";
import { secureLinkBrowser } from "./webviewSecurity.ts";

export function secureRenderer(window: BrowserWindow, connection: () => HostConnection) {
	window.webContents.on("will-navigate", (event, url) => {
		if (!sameOrigin(url, connection().origin)) event.preventDefault();
	});
	// The `persist:trellis-link-browser` partition keeps remote data out of the main session.
	// HTTPS prevents an unencrypted load. No preload and no Node access keep remote code from the host.
	// The sandbox limits what the remote page can do.
	// No popup permission prevents a remote page from opening another window.
	window.webContents.on("will-attach-webview", secureLinkBrowser);
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (externalUrl(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	const rendererSession = window.webContents.session;
	rendererSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
	rendererSession.setPermissionCheckHandler(() => false);
	rendererSession.webRequest.onBeforeSendHeaders((details, callback) => {
		const host = connection();
		if (
			!window.isDestroyed() &&
			details.webContentsId === window.webContents.id &&
			hostRequest(details.url, host.origin)
		)
			details.requestHeaders.Authorization = `Bearer ${host.token}`;
		else delete details.requestHeaders.Authorization;
		callback({ requestHeaders: details.requestHeaders });
	});
}
