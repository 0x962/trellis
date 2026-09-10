import { createFileRoute, redirect } from "@tanstack/react-router";

// `/` is Needs you. The redirect replaces the entry, so Back never lands
// on `/`.
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/needs-you", replace: true });
	},
});
