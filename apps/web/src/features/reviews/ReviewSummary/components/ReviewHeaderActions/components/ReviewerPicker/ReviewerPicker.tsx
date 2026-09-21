import { useMutation, useQuery } from "@tanstack/react-query";
import { Avatar, Button, Command, Popover, Skeleton, toast } from "@trellis/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { namedReviewRequests, type ReviewRequest } from "../../../../../reviewActions/reviewActions";

export function ReviewerPicker({
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
	const input = useRef<HTMLInputElement>(null);
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

	const candidates = useQuery({
		...orpc.reviews.reviewers.queryOptions({ input: { pr } }),
		enabled: open,
	});
	const reviewer = useMutation({
		mutationFn: ({ login, remove }: { login: string; remove: boolean }) =>
			client.reviews.reviewer({ pr, reviewer: login, remove }),
		onSuccess: ({ reviewer: login, removed }) => {
			setRequestedUsers((current) =>
				removed ? current.filter((candidate) => candidate !== login) : [...new Set([...current, login])],
			);
			setOpen(false);
			onDone();
		},
		onError: (error) => toast.error("Could not change the reviewer", { description: error.message }),
	});
	const items = (candidates.data ?? [])
		.filter((candidate) => candidate.login !== author)
		.map((candidate) => ({
			id: candidate.login,
			label: candidate.login,
			checked: requestedUsers.includes(candidate.login),
			icon: <img src={candidate.avatarUrl} alt="" className="review-reviewer-avatar" />,
		}));
	const names = [...requestedUsers, ...teamsFromGitHub];

	return (
		<Popover
			trigger={
				<Button aria-label={`Reviewers, ${names.length} assigned`} className="review-reviewer-trigger">
					{names.length > 0 ? (
						<span className="review-reviewer-avatars" aria-hidden="true">
							{names.slice(0, 3).map((name) => (
								<Avatar key={name} kind="human" name={name} />
							))}
						</span>
					) : null}
					<span>Reviewers{names.length > 0 ? ` ${names.length}` : ""}</span>
				</Button>
			}
			label="Assign reviewers"
			open={open}
			onOpenChange={setOpen}
			initialFocus={input}
			align="end"
			className="w-72 p-0"
		>
			{teamsFromGitHub.length > 0 && (
				<div className="review-reviewer-teams">
					<span className="review-reviewer-teams-label">Teams</span>
					<strong className="review-reviewer-teams-value">
						{teamsFromGitHub.map((team) => `@${team}`).join(", ")}
					</strong>
				</div>
			)}
			{candidates.isPending ? (
				<div className="review-reviewer-loading" role="status" aria-label="Loading reviewers">
					<Skeleton width="w-full" height="h-8" />
					<Skeleton width="w-3/4" height="h-8" />
				</div>
			) : candidates.isError ? (
				<p role="alert" className="review-error">
					{candidates.error.message}
				</p>
			) : (
				<Command
					inputRef={input}
					autoFocus
					label="Search reviewers"
					placeholder="Search reviewers"
					empty="No reviewers available."
					items={items}
					onSelect={(login) => reviewer.mutate({ login, remove: requestedUsers.includes(login) })}
				/>
			)}
		</Popover>
	);
}
