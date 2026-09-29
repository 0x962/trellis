import { sessionStatusEmbedContentDocument, sessionStatusEmbedDocument } from "./embedDocument";
import type { SessionUpdateEmbed } from "./types";

export function SessionStatusEmbed({ title, html }: SessionUpdateEmbed) {
	const content = sessionStatusEmbedContentDocument(title, html);
	const document = sessionStatusEmbedDocument(title, content);

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
