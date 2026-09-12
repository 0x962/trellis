import { Link } from "@tanstack/react-router";
import { reviewRef } from "@trellis/api";
import type { ReactNode } from "react";
export type DiffLinkProps = { url: string; children: ReactNode };
export function DiffLink({ url, children }: DiffLinkProps) {
	const ref = reviewRef(url);
	return (
		<Link
			to="/reviews/$owner/$repo/$number"
			params={{ owner: ref.owner, repo: ref.repo, number: String(ref.number) }}
			className="min-w-0 truncate text-base font-medium text-fg before:absolute before:inset-0"
		>
			{children}
		</Link>
	);
}
