import type { ActorRef, PageDetail, PagePinOutput, PagePublishOutput, PageSummary, PageVersion } from "@trellis/api";
import { cell, type ListSpec, type RecordSpec, timeCell } from "../../output.ts";

// `kind:name` for a person, and the agent's own name before its run id for
// an agent, so a reader knows which agent published without a second call.
const actorCell = (actor: ActorRef | null): string => {
	if (actor === null) return "-";
	return actor.kind === "agent" && actor.displayName !== undefined
		? `${actor.kind}:${actor.displayName} ${actor.name}`
		: `${actor.kind}:${actor.name}`;
};

const watcherCell = (page: PageSummary): string =>
	page.watcher === null ? "-" : `${page.watcher.agent.name} ${page.watcher.agent.id}`;

const pageColumns = [
	{ name: "ref", value: (page: PageSummary) => page.ref },
	{ name: "title", value: (page: PageSummary) => cell(page.title) },
	{ name: "version", value: (page: PageSummary) => String(page.latestVersion) },
	{ name: "revision", value: (page: PageSummary) => String(page.revision) },
	{ name: "published", value: (page: PageSummary) => timeCell(page.publishedAt) },
	{ name: "by", value: (page: PageSummary) => actorCell(page.publishedBy) },
	{ name: "open", value: (page: PageSummary) => String(page.openThreadCount) },
	{ name: "pinned", value: (page: PageSummary) => (page.pinned ? "yes" : "-") },
];

export const pageList: ListSpec<PageSummary> = { columns: pageColumns, identifier: (page) => page.ref };

export const pageRecord: RecordSpec<PageSummary> = {
	fields: [
		{ name: "id", value: (page) => page.id },
		...pageColumns,
		{ name: "summary", value: (page) => cell(page.summary) },
		{ name: "watcher", value: watcherCell },
		{ name: "deleted", value: (page) => timeCell(page.deletedAt) },
		{ name: "purgeAt", value: (page) => timeCell(page.purgeAt) },
	],
	identifier: (page) => page.ref,
};

// `show` reads one version of the page, so its record names that version
// and the files and threads the version holds.
export const pageDetailRecord: RecordSpec<PageDetail> = {
	fields: [
		...pageRecord.fields,
		{ name: "shownVersion", value: (page) => String(page.requestedVersion.number) },
		{ name: "sourcePath", value: (page) => page.requestedVersion.sourcePath },
		{ name: "assets", value: (page) => String(page.assetCount) },
		{ name: "threads", value: (page) => `${page.resolvedThreadCount} resolved of ${page.totalThreadCount}` },
	],
	identifier: (page) => page.ref,
};

const versionColumns = [
	{ name: "version", value: (version: PageVersion) => String(version.number) },
	{ name: "label", value: (version: PageVersion) => cell(version.label) },
	{ name: "published", value: (version: PageVersion) => timeCell(version.createdAt) },
	{ name: "by", value: (version: PageVersion) => actorCell(version.actor) },
	{ name: "source", value: (version: PageVersion) => version.sourcePath },
	{ name: "bytes", value: (version: PageVersion) => String(version.documentSize) },
	{ name: "sha256", value: (version: PageVersion) => version.documentSha256.slice(0, 12) },
];

export const versionList: ListSpec<PageVersion> = {
	columns: versionColumns,
	identifier: (version) => String(version.number),
};

// A publication answers with the page and the version it created. The ref
// and the revision are what the next publication of this page needs.
export const publishedRecord: RecordSpec<PagePublishOutput> = {
	fields: [
		{ name: "link", value: (result) => result.link },
		{ name: "ref", value: (result) => result.page.ref },
		{ name: "id", value: (result) => result.page.id },
		{ name: "title", value: (result) => cell(result.page.title) },
		{ name: "version", value: (result) => String(result.version.number) },
		{ name: "revision", value: (result) => String(result.page.revision) },
		{ name: "sourcePath", value: (result) => result.version.sourcePath },
		{ name: "sha256", value: (result) => result.version.documentSha256 },
	],
	identifier: (result) => result.page.ref,
};

export const pinRecord: RecordSpec<PagePinOutput> = {
	fields: [
		{ name: "id", value: (result) => result.pageId },
		{ name: "pinned", value: (result) => (result.pinned ? "yes" : "no") },
	],
	identifier: (result) => result.pageId,
};
