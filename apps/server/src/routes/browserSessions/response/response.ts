import type { Context } from "hono";

export const errorResponse = (
	c: Context,
	status: 400 | 401 | 403 | 413 | 429,
	code: string,
	message: string,
) => c.json({ defined: false, code, status, message }, status);

export const noStore = (response: Response) => {
	response.headers.set("cache-control", "no-store");
	response.headers.set("pragma", "no-cache");
	return response;
};

export const unauthorizedResponse = (c: Context, challenge: string, message: string) => {
	c.header("www-authenticate", challenge);
	return noStore(errorResponse(c, 401, "UNAUTHORIZED", message));
};
