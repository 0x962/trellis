export const pageVersionStatus = (viewed: number, latest: number, historical: boolean): string =>
	`Version ${viewed} of ${latest}, ${historical ? "read-only" : "current"}`;

export const pageHistoryLabel = (viewed: number, latest: number): string =>
	`Version history, viewing version ${viewed} of ${latest}`;

export const pageShareLabel = (historical: boolean): string =>
	historical ? "Share Page, link opens the current version" : "Share Page";
