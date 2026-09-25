import { pageHref } from "../../../../lib/projectUrl";

export type PageDetailSearch = { version?: number };

export const parsePageDetailSearch = (raw: Record<string, unknown>): PageDetailSearch => {
	const version = Number(raw.version);
	return Number.isSafeInteger(version) && version > 0 ? { version } : {};
};

export const pageVersionHref = (project: string, slug: string, version?: number) =>
	`${pageHref(project, slug)}${version === undefined ? "" : `?version=${version}`}`;

export const pageLinkTarget = (href: string, origin: string) => {
	const url = URL.parse(href);
	if (url === null || !["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
	if (url.origin === origin && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rpc"))) return null;
	return { href: url.href, internal: url.origin === origin };
};
