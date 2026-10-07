import { FailureState, Spinner, cx } from "@trellis/ui";
import { useState } from "react";
import { PageSheet } from "../../../../shell/PageSheet";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar } from "../../../../shell/Topbar";

export type ImageSheetProps = {
	name: string;
	url: string;
	onClose: () => void;
};

type ImageState = "loading" | "loaded" | "error";

export function ImageSheet({ name, url, onClose }: ImageSheetProps) {
	const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const state: ImageState = failedUrl === url ? "error" : loadedUrl === url ? "loaded" : "loading";
	return (
		<PageSheet open onClose={onClose} title={name}>
			<Topbar>
				<PageTitle title={name} />
			</Topbar>
			<div
				data-image-stage=""
				aria-busy={state === "loading" || undefined}
				className="relative flex min-h-0 flex-1 items-center justify-center bg-pane p-5 max-md:p-2"
			>
				{state === "loading" && (
					<div
						role="status"
						aria-label="The image is loading"
						className="absolute inset-0 flex items-center justify-center"
					>
						<Spinner className="size-5" />
					</div>
				)}
				{state === "error" && (
					<FailureState variant="page" className="absolute inset-0 bg-pane" title="The image did not load" />
				)}
				<img
					src={url}
					alt={name}
					onLoad={() => setLoadedUrl(url)}
					onError={() => setFailedUrl(url)}
					className={cx(
						"max-h-full max-w-full rounded-lg border border-border bg-surface object-contain shadow-sm",
						state !== "loaded" && "invisible",
					)}
				/>
			</div>
		</PageSheet>
	);
}
