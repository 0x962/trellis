import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/needs-you")({
	beforeLoad: () => {
		throw redirect({ to: "/search", replace: true });
	},
});
