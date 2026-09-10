// The e2e specs read and write the fake server directly, so a spec sets up
// its rows without clicking through the UI.

export const apiUrl = "http://127.0.0.1:4522/api";

const headers = { "content-type": "application/json", "x-trellis-actor": "human:navid" };

export const get = async <T>(path: string): Promise<T> => {
	const response = await fetch(`${apiUrl}${path}`);
	return (await response.json()) as T;
};

export const post = async <T>(path: string, body: unknown): Promise<T> => {
	const response = await fetch(`${apiUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
	return (await response.json()) as T;
};

export const put = async <T>(path: string, body: unknown): Promise<T> => {
	const response = await fetch(`${apiUrl}${path}`, { method: "PUT", headers, body: JSON.stringify(body) });
	return (await response.json()) as T;
};

export type Section = { items: { identifier: string }[]; total: number };
export type Inbox = { review: Section; failingCi: Section; stalled: Section; doneByAgentsToday: Section };

export const inbox = () => get<Inbox>("/inbox");

export const move = (ticket: string, status: string) => post(`/tickets/${ticket}/move`, { status });

// Empties every section but Review, so the empty state is one approval run
// away.
export const clearNonReviewSections = async () => {
	const current = await inbox();
	for (const section of [current.failingCi, current.stalled, current.doneByAgentsToday]) {
		for (const item of section.items) await move(item.identifier, "todo");
	}
};

export const createReviewTickets = async (count: number) => {
	const identifiers: string[] = [];
	for (let index = 0; index < count; index += 1) {
		const ticket = await post<{ identifier: string }>("/tickets", {
			project: "CDE",
			title: `Approve run ${Date.now()}-${index}`,
		});
		await move(ticket.identifier, "human-review");
		identifiers.push(ticket.identifier);
	}
	return identifiers;
};

export const statusOf = async (identifier: string) => {
	const ticket = await get<{ status: { name: string } }>(`/tickets/${identifier}`);
	return ticket.status.name;
};
