import { ArrowClockwise } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import { useEffect, useState } from "react";
import { PageSheet } from "../../../../shell/PageSheet";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar } from "../../../../shell/Topbar";

export const LINK_BROWSER_PARTITION = "persist:trellis-link-browser";
export const LINK_BROWSER_WEB_PREFERENCES = "nodeIntegration=no,sandbox=yes";

type LinkLoadFailure = Event & {
	errorCode: number;
	errorDescription: string;
	isMainFrame: boolean;
};

declare global {
	interface HTMLWebViewElement {
		reload: () => void;
	}
}

export const linkLoadError = (event: Pick<LinkLoadFailure, "errorCode" | "errorDescription" | "isMainFrame">) => {
	if (!event.isMainFrame || event.errorCode === -3) return null;
	return event.errorDescription;
};

export const linkUrlError = (url: string) =>
	URL.canParse(url) && new URL(url).protocol === "https:" ? null : "Trellis opens only HTTPS links.";

export type LinkBrowserSheetProps = {
	name: string;
	url: string;
	onClose: () => void;
};

export function LinkBrowserSheet({ name, url, onClose }: LinkBrowserSheetProps) {
	const [webview, setWebview] = useState<HTMLWebViewElement | null>(null);
	const [error, setError] = useState<string | null>(null);
	const urlError = linkUrlError(url);
	useEffect(() => {
		if (webview === null) return;
		const started = () => setError(null);
		const failed = (event: Event) => {
			const message = linkLoadError(event as LinkLoadFailure);
			if (message !== null) setError(message);
		};
		webview.addEventListener("did-start-loading", started);
		webview.addEventListener("did-fail-load", failed);
		return () => {
			webview.removeEventListener("did-start-loading", started);
			webview.removeEventListener("did-fail-load", failed);
		};
	}, [webview]);
	return (
		<PageSheet open onClose={onClose} title={name}>
			<Topbar>
				<PageTitle title={name} />
			</Topbar>
			<div className="relative min-h-0 flex-1">
				{urlError === null && (
					<webview
						ref={setWebview}
						src={url}
						partition={LINK_BROWSER_PARTITION}
						webpreferences={LINK_BROWSER_WEB_PREFERENCES}
						className="h-full w-full bg-pane"
					/>
				)}
				{(urlError ?? error) !== null && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-pane px-6 text-center">
						<p role="alert" className="text-sm text-danger">
							The link did not load. {urlError ?? error}
						</p>
						{urlError === null && (
							<Tooltip content="Reload link">
								<IconButton label="Reload link" icon={<ArrowClockwise />} onClick={() => webview!.reload()} />
							</Tooltip>
						)}
					</div>
				)}
			</div>
		</PageSheet>
	);
}
