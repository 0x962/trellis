import { parseInternalLink } from "@trellis/api";
import type { ClickedLink } from "../interceptedLinkUrl";

export const internalLinkUrl = (link: ClickedLink | null): string | null => {
	if (link === null) return null;
	return parseInternalLink(link.href) === null ? null : link.href;
};
