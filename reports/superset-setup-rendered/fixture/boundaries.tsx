type FixtureGlobals = {
	__fixtureNavigation: string;
	__fixtureEvent: string;
	__completeHostCheck: (value: unknown) => void;
};
const fixtureGlobals = globalThis as unknown as FixtureGlobals;
export const COMPANY = { DOMAIN: "superset.sh", DOCS_URL: "https://docs.superset.sh" };
export const ImpactFeedbackStyle = { Light: "light" };
export async function impactAsync() {}
export const useRouter = () => ({
	push: (path: string) => {
		fixtureGlobals.__fixtureNavigation = path;
	},
});
export function OrganizationHeaderButton() {
	return null;
}
export const posthog = {
	capture: (name: string) => {
		fixtureGlobals.__fixtureEvent = name;
	},
};
export const useOrganizations = () => ({
	isLoadingOrganizations: false,
	activeOrganization: {
		name:
			new URLSearchParams(location.search).get("long") === "true"
				? "Acme engineering and infrastructure organization"
				: "Acme",
		logo: null,
	},
});
export const useOrgHosts = () => ({
	query: {
		refetch: () =>
			new Promise((resolve) => {
				fixtureGlobals.__completeHostCheck = resolve;
			}),
	},
});
export const openUrl = (url: string) => {
	fixtureGlobals.__fixtureNavigation = url;
};
