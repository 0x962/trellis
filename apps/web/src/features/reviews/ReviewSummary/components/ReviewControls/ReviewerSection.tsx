import { X } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, FilterPopover, IconButton, Skeleton, Tooltip } from "@trellis/ui";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { namedReviewRequests, type ReviewRequest } from "./reviewControl";

export function ReviewerSection({
	pr,
	author,
	requests,
	onDone,
}: {
	pr: string;
	author?: string;
	requests: ReviewRequest[];
	onDone: () => void;
}) {
	const { client, orpc } = useApp();
	const [open, setOpen] = useState(false);
	const requestsFromGitHub = useMemo(() => namedReviewRequests(requests), [requests]);
	const usersFromGitHub = requestsFromGitHub
		.filter((request) => request.kind === "user")
		.map((request) => request.name);
	const teamsFromGitHub = requestsFromGitHub
		.filter((request) => request.kind === "team")
		.map((request) => request.name);
	const [requestedUsers, setRequestedUsers] = useState(usersFromGitHub);
	const requestedKey = usersFromGitHub.join("\0");
	useEffect(() => setRequestedUsers(requestedKey === "" ? [] : requestedKey.split("\0")), [requestedKey]);

	const candidates = useQuery(orpc.reviews.reviewers.queryOptions({ input: { pr } }));
	const reviewer = useMutation({
		mutationFn: ({ login, remove }: { login: string; remove: boolean }) =>
			client.reviews.reviewer({ pr, reviewer: login, remove }),
		onSuccess: ({ reviewer: login, removed }) => {
			setRequestedUsers((current) =>
				removed ? current.filter((candidate) => candidate !== login) : [...new Set([...current, login])],
			);
			onDone();
		},
	});
	const items = (candidates.data ?? [])
		.filter((candidate) => candidate.login !== author)
		.map((candidate) => ({
			id: candidate.login,
			label: candidate.login,
			checked: requestedUsers.includes(candidate.login),
			icon: <img src={candidate.avatarUrl} alt="" className="review-reviewer-avatar" />,
		}));

	return (
		<section className="review-control-section" aria-labelledby="reviewers-heading">
			<div className="review-control-heading">
				<div>
					<h3 id="reviewers-heading">Reviewers</h3>
					<p>Request a review from a repository collaborator.</p>
				</div>
				{candidates.isSuccess && (
					<FilterPopover
						trigger={<Button>Assign reviewer</Button>}
						open={open}
						onOpenChange={setOpen}
						label="Search reviewers"
						placeholder="Search reviewers"
						empty="No reviewers available."
						items={items}
						onSelect={(login) => {
							setOpen(false);
							reviewer.mutate({ login, remove: requestedUsers.includes(login) });
						}}
					/>
				)}
			</div>
			{candidates.isPending && (
				<div role="status" aria-label="Loading reviewers">
					<Skeleton width="w-40" height="h-7" />
				</div>
			)}
			{candidates.isError && (
				<p role="alert" className="review-error">
					{candidates.error.message}
				</p>
			)}
			{requestedUsers.length || teamsFromGitHub.length ? (
				<ul className="review-reviewers" aria-label="Requested reviewers">
					{requestedUsers.map((login) => (
						<li key={login} className="review-reviewer">
							<span>@{login}</span>
							<Tooltip content={`Remove ${login}`}>
								<IconButton
									label={`Remove ${login}`}
									icon={<X />}
									size="xs"
									disabled={reviewer.isPending}
									onClick={() => reviewer.mutate({ login, remove: true })}
								/>
							</Tooltip>
						</li>
					))}
					{teamsFromGitHub.map((team) => (
						<li key={`team:${team}`} className="review-reviewer">
							<span>@{team}</span>
						</li>
					))}
				</ul>
			) : (
				<p className="review-meta">No reviewers assigned.</p>
			)}
			{reviewer.isError && (
				<p role="alert" className="review-error">
					{reviewer.error.message}
				</p>
			)}
		</section>
	);
}
