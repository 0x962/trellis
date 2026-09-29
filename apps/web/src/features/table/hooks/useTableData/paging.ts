import type { ListOutput } from "@trellis/api";

export const pageRows = (pages: readonly ListOutput[] | undefined) => pages?.flatMap((page) => page.items);

export const shouldLoadNextPage = (enabled: boolean, hasNextPage: boolean, isFetchingNextPage: boolean) =>
	enabled && hasNextPage && !isFetchingNextPage;
