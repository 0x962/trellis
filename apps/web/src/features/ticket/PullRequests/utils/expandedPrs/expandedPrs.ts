// The pull requests a person expanded, for this tab session. An entry is
// keyed by the PR URL, because a row id changes when a PR is unlinked and
// linked again; the value is the row id the PR had when it was expanded.
export const expandedPrsKey = "trellis.expanded-prs";

type Expanded = Record<string, string>;

const read = (): Expanded => JSON.parse(sessionStorage.getItem(expandedPrsKey) ?? "{}") as Expanded;

export const isExpanded = (pr: { url: string }) => pr.url in read();

export const setExpanded = (pr: { url: string; id: string }, expanded: boolean) => {
	const { [pr.url]: _, ...rest } = read();
	sessionStorage.setItem(expandedPrsKey, JSON.stringify(expanded ? { ...rest, [pr.url]: pr.id } : rest));
};
