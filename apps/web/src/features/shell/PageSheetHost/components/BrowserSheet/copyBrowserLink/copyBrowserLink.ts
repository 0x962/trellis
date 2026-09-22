import { toast } from "@trellis/ui";

export type CopyBrowserLinkDependencies = {
	writeText: (text: string) => Promise<void>;
	notify: (message: string) => void;
};

const browserCopyDependencies: CopyBrowserLinkDependencies = {
	writeText: (text) => navigator.clipboard.writeText(text),
	notify: toast,
};

export const copyBrowserLink = async (
	url: string,
	dependencies: CopyBrowserLinkDependencies = browserCopyDependencies,
) => {
	await dependencies.writeText(url);
	dependencies.notify("Link copied");
};
