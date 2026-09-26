export type ViewerImage = { src: string; alt: string };

type ClickTarget = {
	tagName: string;
	getAttribute(name: string): string | null;
};

export const imageForViewer = (target: ClickTarget): ViewerImage | null => {
	if (target.tagName !== "IMG") return null;
	return {
		src: target.getAttribute("src") ?? "",
		alt: target.getAttribute("alt") ?? "",
	};
};
