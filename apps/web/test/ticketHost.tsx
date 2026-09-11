import { useQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { Toaster } from "@trellis/ui";
import type { ReactElement } from "react";
import { useApp } from "../src/lib/appContext";
import { type ProviderOptions, renderWithProviders } from "./renderWithProviders";
import { createTestServer } from "./server/index.ts";

export type TicketHostOptions = Partial<ProviderOptions>;

// Renders one ticket section the way its parent does: the section receives
// the cached `tickets.get` row and re-renders when the cache changes. The
// Toaster mounts beside it, so a test reads the toasts the section raises.
export const renderTicket = (
	identifier: string,
	render: (ticket: Ticket) => ReactElement,
	options: TicketHostOptions = {},
) => {
	const server = options.server ?? createTestServer();
	function Host() {
		const { orpc } = useApp();
		const { data } = useQuery(orpc.tickets.get.queryOptions({ input: { ticket: identifier } }));
		return data === undefined ? null : render(data);
	}
	return renderWithProviders(
		<>
			<Host />
			<Toaster />
		</>,
		{ path: "/p/CDE", actor: "dana", ...options, server },
	);
};

// `ms` before now, as the wire carries it.
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export const minute = 60_000;
export const hour = 60 * minute;
export const day = 24 * hour;

// The text a title field holds, whether it is an input or a contenteditable.
export const fieldValue = (field: HTMLElement) =>
	field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : (field.textContent ?? "");

// Two animation frames. Base UI moves focus on the frame after a microtask.
export const frames = async () => {
	const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	await frame();
	await frame();
};

// A short real-time pause, for a check that something did not happen.
export const settle = (ms = 30) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The status a `tickets.update` or `tickets.move` input names, by id, slug, or name.
export const statusOf = (statuses: Iterable<{ id: string; slug: string; name: string }>, input: unknown) => {
	const { status } = input as { status: string };
	return [...statuses].find((entry) => entry.id === status || entry.slug === status || entry.name === status);
};
