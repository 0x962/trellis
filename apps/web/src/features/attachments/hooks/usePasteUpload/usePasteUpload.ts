import { isDefinedError, safe } from "@orpc/client";
import type { ClipboardEvent } from "react";
import { useState } from "react";
import { useApp } from "../../../../lib/appContext";
import type { UploadError } from "../useUploads";

export type PasteUpload = {
	// The paste handler of a description editor or a comment composer.
	onPaste: (event: ClipboardEvent<HTMLElement>) => void;
	// True while a pasted image uploads.
	pending: boolean;
	error: UploadError | null;
};

// Uploads an image pasted into `ticket` and hands `onInsert` the markdown
// for the caret position. A paste that carries no image reaches the editor
// unchanged.
export const usePasteUpload = (ticket: string, onInsert: (markdown: string) => void): PasteUpload => {
	const { client, orpc, queryClient } = useApp();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<UploadError | null>(null);

	const onPaste = (event: ClipboardEvent<HTMLElement>) => {
		const image = [...event.clipboardData.files].find((file) => file.type.startsWith("image/"));
		if (image === undefined) return;
		event.preventDefault();
		setPending(true);
		setError(null);
		void (async () => {
			const result = await safe(client.attachments.upload({ ticket, file: image }));
			setPending(false);
			if (result.error !== null) {
				if (!isDefinedError(result.error) || result.error.code !== "PAYLOAD_TOO_LARGE") throw result.error;
				setError({ code: "PAYLOAD_TOO_LARGE", maxBytes: result.error.data.maxBytes });
				return;
			}
			onInsert(result.data.markdown);
			await queryClient.invalidateQueries({
				queryKey: orpc.attachments.list.queryKey({ input: { ticket } }),
				refetchType: "all",
			});
		})();
	};

	return { onPaste, pending, error };
};
