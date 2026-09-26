import { PAGE_DOCUMENT_PATH, type PageContentFile } from "@trellis/api";
import type { Config } from "../../../config.ts";
import { pageObjectPath } from "../../../storage/pageObjects.ts";
import { pageDocumentScript } from "../renderScript";

type Input = {
	path: string;
	file: Extract<PageContentFile, { state: "ok" }>;
	nonce: string;
	download: boolean;
};

// pageDocumentScript adds scroll reports and link requests to the HTML.
// Assets keep their stored bytes.
export const renderPageBody = async (
	{ config }: { config: Pick<Config, "home"> },
	{ path, file, nonce, download }: Input,
) => {
	const object = Bun.file(pageObjectPath(config.home, file.sha256));
	if (download || (path !== "" && path !== PAGE_DOCUMENT_PATH)) return { body: object, size: file.size };
	const body = new HTMLRewriter()
		.onDocument({
			end: (document) => {
				document.append(pageDocumentScript(nonce), { html: true });
			},
		})
		.transform(await object.text());
	return { body, size: undefined };
};
