import { apiUrl } from "./env";

// The specs read the real server over its OpenAPI routes, so a spec checks
// a result without clicking through the UI.

const headers = { "content-type": "application/json", "x-trellis-actor": "human:dana" };

export const get = async <T>(path: string): Promise<T> => {
	const response = await fetch(`${apiUrl}/api${path}`);
	return (await response.json()) as T;
};

export const put = async <T>(path: string, body: unknown): Promise<T> => {
	const response = await fetch(`${apiUrl}/api${path}`, { method: "PUT", headers, body: JSON.stringify(body) });
	return (await response.json()) as T;
};

export const post = async <T>(path: string, body: unknown): Promise<T> => {
	const response = await fetch(`${apiUrl}/api${path}`, { method: "POST", headers, body: JSON.stringify(body) });
	return (await response.json()) as T;
};

export const del = async <T>(path: string): Promise<T> => {
	const response = await fetch(`${apiUrl}/api${path}`, { method: "DELETE", headers });
	return (await response.json()) as T;
};

export type Section = { items: { identifier: string }[]; total: number };
export type Inbox = { review: Section; failingCi: Section; stalled: Section; doneByAgentsToday: Section };

export const inbox = () => get<Inbox>("/inbox");

export const statusOf = async (identifier: string) => {
	const ticket = await get<{ status: { name: string } }>(`/tickets/${identifier}`);
	return ticket.status.name;
};
