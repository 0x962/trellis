export function reviewImage(value: string): string | null {
	const url = URL.parse(value);
	if (url?.protocol !== "https:" || url.username || url.password || url.port) return null;
	if (["raw.githubusercontent.com", "private-user-images.githubusercontent.com"].includes(url.hostname))
		return url.href;
	if (url.hostname !== "github.com") return null;
	if (/^\/user-attachments\/assets\/[\w-]+$/.test(url.pathname)) return url.href;
	const blob = /^\/([^/]+\/[^/]+)\/blob\/(.+)$/.exec(url.pathname);
	return blob ? `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}` : null;
}
