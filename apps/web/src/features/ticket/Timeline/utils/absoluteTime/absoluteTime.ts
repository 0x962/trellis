// The full date and time in the browser locale, for the `title` of a
// relative time: "Sep 9, 2026, 2:05 PM".
export const absoluteTime = (iso: string) =>
	new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
