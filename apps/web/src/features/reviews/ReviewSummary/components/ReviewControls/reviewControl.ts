export type ReviewRequest = { login?: string; name?: string; slug?: string };
export type NamedReviewRequest = { name: string; kind: "user" | "team" };

export const primaryReviewAction = ({ state, isDraft }: { state?: string; isDraft?: boolean }) => {
	if (state?.toUpperCase() !== "OPEN") return null;
	return isDraft ? "ready" : "merge";
};

export const mergeAction = (admin: boolean) => (admin ? "admin-merge" : "merge");

export const namedReviewRequests = (requests: ReviewRequest[]): NamedReviewRequest[] =>
	requests.flatMap((request): NamedReviewRequest[] => {
		if (request.login) return [{ name: request.login, kind: "user" }];
		const name = request.slug ?? request.name;
		return name ? [{ name, kind: "team" }] : [];
	});
