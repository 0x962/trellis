type HostErrorBody = { code?: string; message?: string };

// The host answers a declared error with a JSON body that holds `message` and
// `code`. A crash, a proxy, or a missing route answers with plain text. A
// dialog shows `Error.message` alone, so this function makes one sentence from
// either answer.
export const hostError = async (result: Response): Promise<Error> => {
	const text = await result.text();
	const json = result.headers.get("content-type")?.includes("application/json") && text !== "";
	const body: HostErrorBody | null = json ? JSON.parse(text) : null;
	if (body?.message) return new Error(body.code ? `${body.message} (${body.code})` : body.message);
	const trimmed = text.trim();
	return new Error(trimmed === "" ? `The host answered HTTP ${result.status}.` : trimmed);
};
