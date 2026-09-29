export type BrowserRequest = {
	headers: Record<string, string>;
	body: unknown;
};

const forbiddenHeaderNames = new Set(["authorization", "proxy-authorization", "x-api-key", "x-langflow-api-key"]);
const forbiddenFieldNames = new Set([
	"apiKey",
	"authorization",
	"code",
	"langflowApiKey",
	"python",
	"providerApiKey",
	"providerToken",
	"sourceCode",
	"trellisBearerToken",
]);

export function forbiddenBrowserSecret(request: BrowserRequest): string | null {
	for (const headerName of Object.keys(request.headers)) {
		if (forbiddenHeaderNames.has(headerName.toLowerCase())) return headerName;
	}
	return forbiddenField(request.body);
}

function forbiddenField(value: unknown): string | null {
	if (Array.isArray(value)) {
		for (const item of value) {
			const match = forbiddenField(item);
			if (match) return match;
		}
		return null;
	}
	if (value === null || typeof value !== "object") return null;
	for (const [key, item] of Object.entries(value)) {
		if (forbiddenFieldNames.has(key)) return key;
		const match = forbiddenField(item);
		if (match) return match;
	}
	return null;
}
