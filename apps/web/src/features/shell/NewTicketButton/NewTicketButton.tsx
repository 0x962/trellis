import { useRouterState } from "@tanstack/react-router";
import { Button } from "@trellis/ui";
import { projectRefOfPathname } from "../../../lib/projectPath";
import { composerActions } from "../../composer";

// The page's primary action in the topbar. The New ticket dialog opens in
// the project of the page. A filter or a grouping of the page never seeds
// the status, so the ticket starts in the project's default status. Below
// 640 px the key cap leaves the button: the bar needs the 24 px for the
// page title, and a phone has no key to press. The cap stays in the
// accessible name, so a keyboard on a narrow window still reaches it.
export function NewTicketButton() {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const project = projectRefOfPathname(pathname);
	return (
		<Button
			variant="primary"
			kbd="c"
			className="max-sm:[&_kbd]:hidden"
			onClick={() => composerActions.open(project === null ? {} : { project })}
		>
			New ticket
		</Button>
	);
}
