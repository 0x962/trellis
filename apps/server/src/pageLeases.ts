import { type ActorRef, PAGE_ARCHIVE_TTL_MS, PAGE_RENDER_IDLE_MS, PAGE_RENDER_MAX_MS } from "@trellis/api";

// The addresses of the Page routes, and the render leases and archive links
// that authorize them. The address is the contract between the procedure that
// hands one out and the route that answers it, so both read it here.
//
// Both maps live in the memory of the process that answers HTTP requests, and
// the procedures and the routes of that process are the only readers. The
// services of `registry.ts` can run on another thread, so no service reads
// this file.
//
// A restart of the server empties both maps. A viewer that holds an address
// from before the restart reads RENDER_LEASE_EXPIRED and asks for a new one.

export const PAGE_RENDER_PREFIX = "/api/page-render";
export const PAGE_ARCHIVE_PREFIX = "/api/page-archive";

// The address of the frame a viewer mounts, and the address of the page
// document inside that frame. The document sits under the frame address plus
// a slash, so every relative address in the page resolves under the same
// lease and no asset of another version is reachable.
export const renderFrameHref = (leaseId: string) => `${PAGE_RENDER_PREFIX}/${leaseId}`;
export const renderContentRoot = (leaseId: string) => `${PAGE_RENDER_PREFIX}/${leaseId}/`;

export const archiveHref = (grantId: string) => `${PAGE_ARCHIVE_PREFIX}/${grantId}`;

// The file name a person sees in their download folder.
export const archiveFilename = (slug: string, version: number) => `${slug}-v${version}.zip`;

export type RenderLease = {
	id: string;
	pageId: string;
	version: number;
	// The actor that asked for the lease, as `kind:name`. `pages.renewRenderLease`
	// refuses a call from another actor.
	actorKey: string;
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

const actorKey = (actor: ActorRef) => `${actor.kind}:${actor.name}`;

// 32 hex characters. A person who holds the address of a render frame holds
// its whole authorization, so the id comes from the random source of the
// platform and never from a counter or a timestamp.
const secretId = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");

// Nothing removes an expired entry on a timer. Each creation calls this, so
// the two maps do not grow after viewers close their pages.
const sweep = <T>(map: Map<string, T>, expired: (value: T) => boolean) => {
	for (const [id, value] of map) if (expired(value)) map.delete(id);
};

const leaseExpired = (lease: RenderLease, now: Date) =>
	lease.idleExpiresAt.getTime() <= now.getTime() || lease.absoluteExpiresAt.getTime() <= now.getTime();

const extendIdle = (lease: RenderLease, now: Date) => {
	lease.idleExpiresAt = new Date(Math.min(now.getTime() + PAGE_RENDER_IDLE_MS, lease.absoluteExpiresAt.getTime()));
	return lease;
};

export type CreateRenderLeaseInput = { pageId: string; version: number; actor: ActorRef; now: Date };

export const createRenderLease = ({ pageId, version, actor, now }: CreateRenderLeaseInput): RenderLease => {
	sweep(renderLeases, (lease) => leaseExpired(lease, now));
	const lease: RenderLease = {
		id: secretId(),
		pageId,
		version,
		actorKey: actorKey(actor),
		idleExpiresAt: new Date(now.getTime() + PAGE_RENDER_IDLE_MS),
		absoluteExpiresAt: new Date(now.getTime() + PAGE_RENDER_MAX_MS),
	};
	renderLeases.set(lease.id, lease);
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

// The lease of `id`, with its idle limit moved to `PAGE_RENDER_IDLE_MS` after
// `now`. Every content request calls this, so a viewer that draws the page
// keeps its lease. The absolute limit does not move.
export const extendRenderLease = (id: string, now: Date): RenderLease | undefined => {
	const lease = readRenderLease(id, now);
	return lease === undefined ? undefined : extendIdle(lease, now);
};

// The lease of `id` with a new idle limit, for the actor that created it. The
// viewer calls this on a shorter interval than the idle limit, so a page that
// nobody scrolls stays open. Another actor reads no lease at all.
export const renewRenderLease = (id: string, actor: ActorRef, now: Date): RenderLease | undefined => {
	const lease = readRenderLease(id, now);
	if (lease === undefined || lease.actorKey !== actorKey(actor)) return undefined;
	return extendIdle(lease, now);
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
