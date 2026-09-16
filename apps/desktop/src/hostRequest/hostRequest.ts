export const hostRequest = (url: string, origin: string) => {
	if (!URL.canParse(url)) return false;
	const request = new URL(url);
	if (request.username || request.password) return false;
	if (request.protocol === "ws:") request.protocol = "http:";
	if (request.protocol === "wss:") request.protocol = "https:";
	return request.origin === origin;
};
