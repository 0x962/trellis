// The pair link is `trellis://pair?url=<server URL>`, with the server URL as
// one encoded query value. The web settings page draws it as a QR code, and
// the phone app opens it. Hermes ships no URL class, so the parts are
// patterns.

const PAIR_PREFIX = /^trellis:\/\/pair\?/i;
const SERVER_URL = /^https?:\/\/[^\s/?#]+/i;
const LOOPBACK_URL = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/i;

export const pairLink = (serverUrl: string) => `trellis://pair?url=${encodeURIComponent(serverUrl)}`;

// The server URL a pair link carries, or null for any other text. The text
// comes from a camera or from another app, so every part is checked.
export const parsePairLink = (text: string): string | null => {
	if (!PAIR_PREFIX.test(text)) return null;
	const param = text
		.replace(PAIR_PREFIX, "")
		.split("&")
		.find((part) => part.startsWith("url="));
	if (param === undefined) return null;
	let url: string;
	try {
		url = decodeURIComponent(param.slice("url=".length));
	} catch {
		return null;
	}
	return SERVER_URL.test(url) ? url : null;
};

// The first address in `addresses` that a phone on the network can reach, or
// undefined when every address is loopback.
export const lanAddress = (addresses: string[]) => addresses.find((address) => !LOOPBACK_URL.test(address));
