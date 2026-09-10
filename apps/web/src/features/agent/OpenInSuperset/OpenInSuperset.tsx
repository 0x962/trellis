import { ExternalLink } from "lucide-react";

export type OpenInSupersetProps = {
	// The `superset://` deep link of the session's workspace.
	url: string;
};

// The link that opens an agent's workspace in the Superset app. The browser
// hands a `superset://` link to the app, so the link opens no tab.
export function OpenInSuperset({ url }: OpenInSupersetProps) {
	return (
		<a
			href={url}
			className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-sm font-medium text-fg-muted transition duration-hover ease-out hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 pointer-coarse:h-11"
		>
			<ExternalLink aria-hidden="true" className="size-3.5" />
			Open in Superset
		</a>
	);
}
