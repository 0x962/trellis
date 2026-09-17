import { isDefinedError, safe } from "@orpc/client";
import { useCallback, useState } from "react";
import { useApp } from "../../../../lib/appContext";
import type { Upload } from "../../../attachments/hooks/useUploads";

// Every upload of one room. A file that lands hands its markdown line to
// `onUploaded`, which the composer puts into the message text.
export const useChatUploads = (project: string, onUploaded: (markdown: string) => void) => {
	const { client, scheduler } = useApp();
	const [uploads, setUploads] = useState<Upload[]>([]);
	const start = useCallback(
		(files: File[]) => {
			const entries: Upload[] = files.map((file) => ({
				id: crypto.randomUUID(),
				file,
				percent: 0,
				status: "uploading",
				error: null,
			}));
			setUploads((current) => [...current, ...entries]);
			for (const [index, file] of files.entries()) {
				const entry = entries[index]!;
				void (async () => {
					const { error, data } = await safe(client.chat.upload({ project, file }));
					if (error !== null) {
						if (!isDefinedError(error) || error.code !== "PAYLOAD_TOO_LARGE") throw error;
						setUploads((current) =>
							current.map((upload) =>
								upload.id === entry.id
									? {
											...upload,
											status: "pending" as const,
											error: { code: "PAYLOAD_TOO_LARGE", maxBytes: error.data.maxBytes },
										}
									: upload,
							),
						);
						return;
					}
					onUploaded(data.markdown);
					scheduler.setTimeout(() => setUploads((current) => current.filter((upload) => upload.id !== entry.id)), 0);
				})();
			}
		},
		[client, onUploaded, project, scheduler],
	);
	return { uploads, start, dismiss: (id: string) => setUploads((current) => current.filter((u) => u.id !== id)) };
};
