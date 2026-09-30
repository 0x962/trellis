import { createFileRoute, redirect } from "@tanstack/react-router";

// `/` is Search. The redirect replaces the entry, so Back never lands
// on `/`.
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/search", replace: true });
	},
});
