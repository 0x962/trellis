import { useMemo } from "react";
import type { SessionUpdateEmbed } from "../../types";
import { sessionStatusEmbedContentDocument, sessionStatusEmbedDocument } from "./embedDocument";

export function SessionStatusEmbed({ title, html }: SessionUpdateEmbed) {
	const document = useMemo(() => {
		const content = sessionStatusEmbedContentDocument(title, html);
		return sessionStatusEmbedDocument(title, content);
	}, [title, html]);

	return (
		<figure className="my-5">
			<iframe
				title={title}
				sandbox="allow-scripts"
				referrerPolicy="no-referrer"
				srcDoc={document}
				className="block h-60.5 w-full rounded-md border border-border-strong bg-surface"
			/>
			<figcaption className="mt-1.5 text-xs text-fg-faint">{title}</figcaption>
		</figure>
	);
}
