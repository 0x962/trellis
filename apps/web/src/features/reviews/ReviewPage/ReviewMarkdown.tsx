import { reviewImage } from "@trellis/api";
import { useMemo } from "react";
import { renderMarkdown } from "../../../lib/markdown";
export function ReviewMarkdown({ body }: { body: string }) {
	const html = useMemo(() => {
		const template = document.createElement("template");
		template.innerHTML = renderMarkdown(body);
		for (const img of template.content.querySelectorAll("img")) {
			const source = reviewImage(img.src);
			if (source) img.src = `/api/review-image?url=${encodeURIComponent(source)}`;
		}
		return { __html: template.innerHTML };
	}, [body]);
	// biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown strips scripts, event handlers, and unsafe URLs.
	return <div className="review-markdown" dangerouslySetInnerHTML={html} />;
}
