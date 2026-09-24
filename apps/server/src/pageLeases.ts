import { type ActorRef, PAGE_ARCHIVE_TTL_MS, PAGE_RENDER_IDLE_MS, PAGE_RENDER_MAX_MS } from "@trellis/api";

// The render leases and the archive links of the Page routes. Both live in
// the memory of the process that answers HTTP requests, and the procedures
// and the routes of that process are the only readers. The services of
// `registry.ts` can run on another thread, so no service reads this file.
//
// A restart of the server empties both maps. A viewer that holds an address
// from before the restart reads RENDER_LEASE_EXPIRED and asks for a new one.

export type RenderLease = {
	id: string;
	pageId: string;
	version: number;
	// The actor that asked for the lease, as `kind:name`. `pages.renewRenderLease`
	// refuses a call from another actor.
	actorKey: string;
	nonce: string;
	idleExpiresAt: Date;
	absoluteExpiresAt: Date;
};

export type ArchiveGrant = {
	id: string;
	pageId: string;
	version: number;
	filename: string;
	expiresAt: Date;
};

const renderLeases = new Map<string, RenderLease>();
const archiveGrants = new Map<string, ArchiveGrant>();

export const actorKey = (actor: ActorRef) => `${actor.kind}:${actor.name}`;

// 32 hex characters. A person who holds the address of a render frame holds
// its whole authorization, so the id comes from the random source of the
// platform and never from a counter or a timestamp.
const secretId = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");

// Drops every entry the predicate calls expired. Each creation runs it, so
// a viewer that closes its page leaves no entry behind for the next day.
const sweep = <T>(map: Map<string, T>, expired: (value: T) => boolean) => {
	for (const [id, value] of map) if (expired(value)) map.delete(id);
};

const leaseExpired = (lease: RenderLease, now: Date) =>
	lease.idleExpiresAt.getTime() <= now.getTime() || lease.absoluteExpiresAt.getTime() <= now.getTime();

export type CreateRenderLeaseInput = { pageId: string; version: number; actor: ActorRef; now: Date };

export const createRenderLease = ({ pageId, version, actor, now }: CreateRenderLeaseInput): RenderLease => {
	sweep(renderLeases, (lease) => leaseExpired(lease, now));
	const lease: RenderLease = {
		id: secretId(),
		pageId,
		version,
		actorKey: actorKey(actor),
		nonce: secretId(),
		idleExpiresAt: new Date(now.getTime() + PAGE_RENDER_IDLE_MS),
		absoluteExpiresAt: new Date(now.getTime() + PAGE_RENDER_MAX_MS),
	};
	renderLeases.set(lease.id, lease);
	return lease;
};

// The lease of `id`, with its idle limit set 30 minutes after `now`. Every
// content request calls this, so a viewer that draws the page keeps its lease.
// The absolute limit stays where the creation put it.
export const touchRenderLease = (id: string, now: Date): RenderLease | undefined => {
	const lease = renderLeases.get(id);
	if (lease === undefined) return undefined;
	if (leaseExpired(lease, now)) {
		renderLeases.delete(id);
		return undefined;
	}
	lease.idleExpiresAt = new Date(Math.min(now.getTime() + PAGE_RENDER_IDLE_MS, lease.absoluteExpiresAt.getTime()));
	return lease;
};

// The lease of `id` with 30 more idle minutes, for the actor that created
// it. A viewer calls this every 20 minutes, so a page a person reads without
// a scroll stays open. Another actor reads no lease at all.
export const renewRenderLease = (id: string, actor: ActorRef, now: Date): RenderLease | undefined => {
	const lease = readRenderLease(id, now);
	if (lease === undefined || lease.actorKey !== actorKey(actor)) return undefined;
	lease.idleExpiresAt = new Date(Math.min(now.getTime() + PAGE_RENDER_IDLE_MS, lease.absoluteExpiresAt.getTime()));
	return lease;
};

export const readRenderLease = (id: string, now: Date): RenderLease | undefined => {
	const lease = renderLeases.get(id);
	if (lease === undefined) return undefined;
	if (leaseExpired(lease, now)) {
		renderLeases.delete(id);
		return undefined;
	}
	return lease;
};

export type CreateArchiveGrantInput = { pageId: string; version: number; filename: string; now: Date };

export const createArchiveGrant = ({ pageId, version, filename, now }: CreateArchiveGrantInput): ArchiveGrant => {
	sweep(archiveGrants, (grant) => grant.expiresAt.getTime() <= now.getTime());
	const grant: ArchiveGrant = {
		id: secretId(),
		pageId,
		version,
		filename,
		expiresAt: new Date(now.getTime() + PAGE_ARCHIVE_TTL_MS),
	};
	archiveGrants.set(grant.id, grant);
	return grant;
};

export const readArchiveGrant = (id: string, now: Date): ArchiveGrant | undefined => {
	const grant = archiveGrants.get(id);
	if (grant === undefined) return undefined;
	if (grant.expiresAt.getTime() <= now.getTime()) {
		archiveGrants.delete(id);
		return undefined;
	}
	return grant;
};

// The tests of the routes and of the procedures share this process, so each
// suite starts from an empty store.
export const clearPageLeases = () => {
	renderLeases.clear();
	archiveGrants.clear();
};
