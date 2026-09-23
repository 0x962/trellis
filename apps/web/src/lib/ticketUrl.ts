// The ticket ref of a `/t/...` pathname, such as `TRL-386`. Another pathname
// has none. A pathname carries the ref with percent escapes, so the reader
// decodes it.
export const ticketRefOfPathname = (pathname: string): string | null => {
	if (!pathname.startsWith("/t/")) return null;
	const ref = decodeURIComponent(pathname.slice("/t/".length)).split("/")[0];
	return ref === undefined || ref === "" ? null : ref;
};
