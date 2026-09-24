import {
	ActorHeaderStringSchema,
	PageCommentFilterSchema,
	type PageListInput,
	PageListInputSchema,
	type PageListOutput,
	UlidSchema,
} from "@trellis/api";
import { stringifySearchObject } from "../../../lib/searchParams";

export type PageSearch = {
	q?: string;
	author?: string;
	watcher?: string;
	comment?: "open" | "none";
	pin?: boolean;
};

const value = (raw: unknown) => (typeof raw === "string" && raw !== "" ? raw : undefined);

const parsed = <T>(raw: unknown, schema: { safeParse: (input: unknown) => { success: boolean; data?: T } }) => {
	const result = schema.safeParse(raw);
	return result.success ? result.data : undefined;
};

const booleanValue = (raw: unknown) => {
	if (raw === true || raw === "true") return true;
	if (raw === false || raw === "false") return false;
	return undefined;
};

export const parsePageSearch = (raw: Record<string, unknown>): PageSearch => {
	const qValue = value(raw.q)?.trim();
	const q = qValue === undefined || qValue === "" ? undefined : parsed(qValue, PageListInputSchema.shape.q);
	const author = parsed(raw.author, ActorHeaderStringSchema);
	const watcher = parsed(raw.watcher, UlidSchema);
	const comment = parsed(raw.comment, PageCommentFilterSchema);
	const pin = booleanValue(raw.pin);
	return {
		...(q === undefined ? {} : { q }),
		...(author === undefined ? {} : { author }),
		...(watcher === undefined ? {} : { watcher }),
		...(comment === undefined ? {} : { comment }),
		...(pin === undefined ? {} : { pin }),
	};
};

export const pageListInput = (project: string, search: PageSearch, cursor?: string): PageListInput => ({
	project,
	q: search.q,
	author: search.author,
	watcher: search.watcher,
	comment: search.comment,
	pinned: search.pin,
	cursor,
});

export const pageSearchQuery = (search: PageSearch) => stringifySearchObject(search).replace(/^\?/, "");

export const isCanonicalPageSearch = (searchStr: string, search: PageSearch) =>
	decodeURIComponent(searchStr.replace(/^\?/, "")) === decodeURIComponent(pageSearchQuery(search));

export const pageSearchIsFiltered = (search: PageSearch) => Object.values(search).some((entry) => entry !== undefined);

export const pageRows = (data: { pages: PageListOutput[] } | undefined) =>
	data?.pages.flatMap((page) => page.items) ?? [];
