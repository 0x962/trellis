import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { UnreachableServer } from "../../src/components/UnreachableServer";
import { Recents } from "../../src/features/search/Recents";
import {
	clearRecents,
	pushRecent,
	readRecents,
	recentSearchesKey,
	replaceRecent,
} from "../../src/features/search/recentSearches";
import { SearchBar } from "../../src/features/search/SearchBar";
import { identifierOf, isSearchable, searchLimit } from "../../src/features/search/searchQuery";
import { SearchResults } from "../../src/features/search/SearchResults";
import { type SearchRequest, searchStatus, searchView } from "../../src/features/search/searchView";
import { SearchWaiting } from "../../src/features/search/SearchWaiting";
import { describeError, hostOf } from "../../src/lib/describeError";
import { getQueries } from "../../src/lib/orpc";
import { keys, store } from "../../src/lib/store";
import { useDebouncedValue } from "../../src/lib/useDebouncedValue";
import { useStoredString } from "../../src/lib/useStoredString";
import { tokens } from "../../src/theme/tokens";

const styles = StyleSheet.create({
	page: { flex: 1 },
	failure: { flex: 1 },
	retry: { paddingHorizontal: tokens.space[6], paddingBottom: tokens.space[6] },
});

export default function SearchScreen() {
	const [text, setText] = useState("");
	const query = useDebouncedValue(text).trim();
	const enabled = isSearchable(query);
	const search = useQuery({
		...getQueries().search.query.queryOptions({ input: { q: query, limit: searchLimit } }),
		enabled,
	});
	// The server runs one search of this phone at a time. A letter typed while
	// a search still waits replaces that search, and the replaced call ends
	// with SEARCH_REPLACED. The search for the newer text is already running,
	// so the screen waits for it instead of reporting a failed search.
	const replaced = search.error instanceof ORPCError && search.error.code === "SEARCH_REPLACED";
	const [storedRecents] = useStoredString(recentSearchesKey);
	const recents = storedRecents === undefined ? [] : readRecents(store);
	// The recent search the current typing session stored. The field searches
	// as the person types, so every query of one session shares one slot, and
	// the slot holds the last query the server answered. An empty field, a
	// submit, or a tap on a result ends the session.
	const sessionRecent = useRef<string | undefined>(undefined);
	const serverUrl = store.getString(keys.serverUrl)!;

	useEffect(() => {
		if (search.data === undefined || !enabled) return;
		replaceRecent(store, sessionRecent.current, query);
		sessionRecent.current = query;
	}, [enabled, query, search.data]);

	const requestOf = (): SearchRequest => {
		if (!enabled) return { state: "idle" };
		if (search.isPending || replaced) return { state: "waiting" };
		if (search.isError) return { state: "failed", failure: describeError(search.error, serverUrl) };
		return { state: "answered", data: search.data };
	};
	const view = searchView({ query, request: requestOf(), recents });
	const status = searchStatus(view);

	// A screen reader hears how one search ended. The sentence changes only
	// when the view settles, so a reader speaks once for each search.
	useEffect(() => {
		if (status !== undefined) AccessibilityInfo.announceForAccessibility(status);
	}, [status]);

	const changeText = (next: string) => {
		if (next.trim() === "") sessionRecent.current = undefined;
		setText(next);
	};
	const openTicket = (identifier: string) => {
		sessionRecent.current = undefined;
		router.push(`/ticket/${identifier}`);
	};
	const openProject = (key: string) => {
		sessionRecent.current = undefined;
		router.push(`/project/${key}`);
	};
	const submit = () => {
		const identifier = identifierOf(text);
		if (identifier === null) return;
		pushRecent(store, identifier);
		setText("");
		openTicket(identifier);
	};
	const retry = () => void search.refetch();

	const body = () => {
		if (view.kind === "prompt") {
			return <EmptyState title="Search this server" hint="Type an identifier such as CDE-42, a title, or any text." />;
		}
		if (view.kind === "recents") {
			return <Recents recents={view.recents} onSelect={changeText} onClear={() => clearRecents(store)} />;
		}
		if (view.kind === "waiting") return <SearchWaiting query={view.query} />;
		if (view.kind === "failed") {
			return view.failure.unreachable ? (
				<UnreachableServer host={hostOf(serverUrl)} onRetry={retry} onChangeServer={() => router.push("/setup")} />
			) : (
				<View style={styles.failure}>
					<EmptyState title={view.failure.title} hint={view.failure.detail} />
					<View style={styles.retry}>
						<Button label="Retry" onPress={retry} variant="primary" />
					</View>
				</View>
			);
		}
		if (view.kind === "empty") {
			return (
				<EmptyState
					title={`No results for “${view.query}”`}
					hint="Check the spelling, or search for one word of the title."
				/>
			);
		}
		return <SearchResults data={view.data} onSelectTicket={openTicket} onSelectProject={openProject} />;
	};

	return (
		<View style={styles.page}>
			<SearchBar
				value={text}
				onChangeText={changeText}
				onSubmit={submit}
				onClear={() => changeText("")}
				identifier={identifierOf(text)}
			/>
			{body()}
		</View>
	);
}
