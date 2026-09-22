import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowSquareOut, Link } from "@phosphor-icons/react";
import { LINK_BROWSER_PARTITION, LINK_BROWSER_WEB_PREFERENCES } from "@trellis/api";
import { Button, EmptyState, IconButton, Spinner, Tooltip, useHotkey } from "@trellis/ui";
import { useCallback, useEffect, useState } from "react";
import { PageTitle } from "../../../../../PageTitle";
import { Topbar } from "../../../../../Topbar";
import { browserTitle } from "../../browserTitle";
import { copyBrowserLink } from "../../copyBrowserLink";
import { type LinkLoadFailure, linkLoadError, linkUrlError } from "./linkError";

export type BrowserPageProps = {
	// The address the sheet opens. `BrowserSheet` gives this component a new
	// key for a new address, so every fact below belongs to one page.
	url: string;
};

// Chromium sends the title of a page in this event after the page loads.
type PageTitleUpdate = Event & { title: string };

const BACK = -1;
const FORWARD = 1;

// The web page inside the browser sheet: the `<webview>` that Chromium draws,
// the header controls that move through its history, and the state of the
// load. `apps/desktop/src/secureLinkBrowser` strips the preload, forces the
// partition, and refuses an address that is not HTTPS.
export function BrowserPage({ url }: BrowserPageProps) {
	const [webview, setWebview] = useState<HTMLWebViewElement | null>(null);
	const urlError = linkUrlError(url);
	const [title, setTitle] = useState("");
	const [address, setAddress] = useState(url);
	const [loading, setLoading] = useState(urlError === null);
	const [error, setError] = useState<string | null>(null);
	// Whether a page stands before or after the page on screen. The
	// `<webview>` of Electron 44 answers `canGoBack` with false and does
	// nothing on `goBack`, so the Back and Forward buttons count in steps
	// from the page on screen, which the same webview answers correctly.
	const [steps, setSteps] = useState({ back: false, forward: false });
	const copyLink = useCallback(() => {
		void copyBrowserLink(address);
	}, [address]);
	useHotkey("mod+shift+c", (event) => {
		event.preventDefault();
		copyLink();
	});
	useEffect(() => {
		if (webview === null) return;
		const view = webview;
		const navigated = () => {
			setAddress(view.getURL());
			setSteps({ back: view.canGoToOffset(BACK), forward: view.canGoToOffset(FORWARD) });
		};
		const started = () => {
			setError(null);
			setLoading(true);
		};
		const stopped = () => setLoading(false);
		const failed = (event: Event) => {
			const message = linkLoadError(event as LinkLoadFailure);
			if (message !== null) {
				setError(message);
				setLoading(false);
			}
		};
		const titled = (event: Event) => setTitle((event as PageTitleUpdate).title);
		view.addEventListener("did-start-loading", started);
		view.addEventListener("did-stop-loading", stopped);
		view.addEventListener("did-fail-load", failed);
		view.addEventListener("page-title-updated", titled);
		view.addEventListener("did-navigate", navigated);
		view.addEventListener("did-navigate-in-page", navigated);
		return () => {
			view.removeEventListener("did-start-loading", started);
			view.removeEventListener("did-stop-loading", stopped);
			view.removeEventListener("did-fail-load", failed);
			view.removeEventListener("page-title-updated", titled);
			view.removeEventListener("did-navigate", navigated);
			view.removeEventListener("did-navigate-in-page", navigated);
		};
	}, [webview]);
	return (
		<>
			<Topbar
				actions={
					<>
						<Tooltip content="Back">
							<IconButton
								label="Back"
								icon={<ArrowLeft />}
								disabled={!steps.back}
								onClick={() => webview!.goToOffset(BACK)}
							/>
						</Tooltip>
						<Tooltip content="Forward">
							<IconButton
								label="Forward"
								icon={<ArrowRight />}
								disabled={!steps.forward}
								onClick={() => webview!.goToOffset(FORWARD)}
							/>
						</Tooltip>
						<Tooltip content="Reload">
							<IconButton
								label="Reload"
								icon={<ArrowClockwise />}
								disabled={webview === null}
								onClick={() => webview!.reload()}
							/>
						</Tooltip>
						<Tooltip content="Copy link">
							<IconButton label="Copy link" icon={<Link />} onClick={copyLink} />
						</Tooltip>
						<Tooltip content="Open in browser">
							<IconButton
								label="Open in browser"
								icon={<ArrowSquareOut />}
								// `window.open` reaches the desktop window handler, which hands
								// the address to the browser of the operating system. The person
								// asked for that browser, so this call skips `openLink`.
								onClick={() => window.open(address, "_blank", "noopener,noreferrer")}
							/>
						</Tooltip>
					</>
				}
			>
				<PageTitle title={browserTitle(title, address)} />
				<span className="min-w-0 truncate text-sm text-fg-faint max-md:hidden">{address}</span>
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
				{loading && urlError === null && error === null && (
					<div
						role="status"
						aria-busy="true"
						aria-label="The link is loading"
						className="absolute inset-0 flex items-center justify-center bg-pane"
					>
						<Spinner className="size-5" />
					</div>
				)}
				{(urlError ?? error) !== null && (
					<EmptyState
						variant="page"
						className="absolute inset-0 bg-pane"
						title="The link did not load."
						description={<span role="alert">{urlError ?? error}</span>}
						action={
							urlError === null ? (
								<Button
									size="md"
									onClick={() => {
										setLoading(true);
										webview!.reload();
									}}
								>
									Reload
								</Button>
							) : undefined
						}
					/>
				)}
			</div>
		</>
	);
}
