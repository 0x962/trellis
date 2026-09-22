import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import type { TrellisClient } from "@trellis/api";
import { resolvePullRequest } from "./pullRequestRef.ts";

const client = (
	pullRequests: Partial<TrellisClient["pullRequests"]>,
	reviews: Partial<TrellisClient["reviews"]> = {},
) =>
	({
		pullRequests,
		reviews,
	}) as TrellisClient;

test("resolves a linked pull request through the server lookup", async () => {
	const resolved = await resolvePullRequest(
		client({
			resolve: async () => ({ id: "01M336WJTFP4KJ2RZNRRFHJ3B0", url: "https://github.com/acme/app/pull/57245" }),
		}),
		"https://github.com/acme/app/pull/57245",
		false,
	);

	expect(resolved).toEqual({
		id: "01M336WJTFP4KJ2RZNRRFHJ3B0",
		url: "https://github.com/acme/app/pull/57245",
	});
});

test("normalizes a GitHub URL when the pull request is unknown", async () => {
	await expect(
		resolvePullRequest(
			client({
				resolve: async () => {
					throw new ORPCError("NOT_FOUND", { data: { kind: "pull request", ref: "acme/app#57245" } });
				},
			}),
			"https://github.com/acme/app/pull/57245",
			false,
		),
	).rejects.toMatchObject({
		code: "NOT_FOUND",
		message: "No pull request matches acme/app#57245.",
	});
});

test("retains a pull request from GitHub when the server does not know it yet", async () => {
	const resolved = await resolvePullRequest(
		client(
			{
				resolve: async () => {
					throw new ORPCError("NOT_FOUND", { data: { kind: "pull request", ref: "12" } });
				},
			},
			{
				mine: async () => [
					{
						number: 12,
						title: "Add evidence",
						repository: { nameWithOwner: "acme/app" },
						isDraft: false,
						url: "https://github.com/acme/app/pull/12",
					},
				],
				open: async () => ({ id: "01M336WJTFP4KJ2RZNRRFHJ3B0", url: "https://github.com/acme/app/pull/12" }),
			},
		),
		"12",
		true,
	);

	expect(resolved).toEqual({
		id: "01M336WJTFP4KJ2RZNRRFHJ3B0",
		url: "https://github.com/acme/app/pull/12",
	});
});
