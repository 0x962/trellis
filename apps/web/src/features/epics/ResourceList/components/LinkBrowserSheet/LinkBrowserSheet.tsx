import { LINK_BROWSER_PARTITION, LINK_BROWSER_WEB_PREFERENCES } from "@trellis/api";
import { Button, EmptyState, Spinner } from "@trellis/ui";
import { useEffect, useState } from "react";
import { PageSheet } from "../../../../shell/PageSheet";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar } from "../../../../shell/Topbar";
import { type LinkLoadFailure, linkLoadError, linkUrlError } from "./linkError";

export type LinkBrowserSheetProps = {
	name: string;
	url: string;
	onClose: () => void;
};

export function LinkBrowserSheet({ name, url, onClose }: LinkBrowserSheetProps) {
	const [webview, setWebview] = useState<HTMLWebViewElement | null>(null);
	const [error, setError] = useState<string | null>(null);
	const urlError = linkUrlError(url);
	const [loading, setLoading] = useState(urlError === null);
	useEffect(() => {
		if (webview === null) return;
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
		webview.addEventListener("did-start-loading", started);
		webview.addEventListener("did-stop-loading", stopped);
		webview.addEventListener("did-fail-load", failed);
		return () => {
			webview.removeEventListener("did-start-loading", started);
			webview.removeEventListener("did-stop-loading", stopped);
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
		</PageSheet>
	);
}
