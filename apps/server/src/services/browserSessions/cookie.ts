import { BROWSER_SESSION_COOKIE } from "./browserSessions.ts";

export const readBrowserSessionCookie = (header: string | undefined): string | null => {
	if (header === undefined) return null;
	for (const part of header.split(";")) {
		const [name, value] = part.trim().split("=", 2);
		if (name === BROWSER_SESSION_COOKIE && value !== undefined && value !== "") return value;
	}
	return null;
};

export const browserSessionCookie = (token: string, expiresAt: number) =>
	`${BROWSER_SESSION_COOKIE}=${token}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; Secure; SameSite=Strict`;

export const expiredBrowserSessionCookie = () =>
	`${BROWSER_SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
