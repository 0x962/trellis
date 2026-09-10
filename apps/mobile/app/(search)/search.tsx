import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { EmptyState } from "../../src/components/EmptyState";
import { Field } from "../../src/components/Field";
import { pushRecent, readRecents, recentSearchesKey, replaceRecent } from "../../src/features/search/recentSearches";
import { SearchResults } from "../../src/features/search/SearchResults";
import { identifierOf, isSearchable, searchLimit } from "../../src/features/search/searchQuery";
import { getQueries } from "../../src/lib/orpc";
import { store } from "../../src/lib/store";
import { useDebouncedValue } from "../../src/lib/useDebouncedValue";
import { tokens } from "../../src/theme/tokens";
import { usePalette } from "../../src/theme/usePalette";

const styles = StyleSheet.create({
	page: { flex: 1 },
	field: { padding: tokens.space[4], paddingBottom: tokens.space[2] },
	recents: { paddingHorizontal: tokens.space[4], gap: tokens.space[2] },
	heading: { fontSize: tokens.text.sm, lineHeight: tokens.leading.sm, fontWeight: "500" },
	recent: { minHeight: tokens.space[8] + tokens.space[1], justifyContent: "center" },
	recentText: { fontSize: tokens.text.md, lineHeight: tokens.leading.md },
});

export default function SearchScreen() {
	const palette = usePalette();
	const [text, setText] = useState("");
	const query = useDebouncedValue(text).trim();
	const enabled = isSearchable(query);
	const search = useQuery({
		...getQueries().search.query.queryOptions({ input: { q: query, limit: searchLimit } }),
		enabled,
	});
	const [storedRecents] = useMMKVString(recentSearchesKey, store);
	const recents = storedRecents === undefined ? [] : readRecents(store);
	// The recent search the current typing session stored. The field searches
	// as the person types, so every query of one session shares one slot, and
	// the slot holds the last query that returned results. An empty field, a
	// submit, or a tap on a result ends the session.
	const sessionRecent = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (search.data === undefined || !enabled) return;
		replaceRecent(store, sessionRecent.current, query);
		sessionRecent.current = query;
	}, [enabled, query, search.data]);

	const changeText = (next: string) => {
		if (next.trim() === "") sessionRecent.current = undefined;
		setText(next);
	};
	const openTicket = (identifier: string) => {
		sessionRecent.current = undefined;
		router.push(`/ticket/${identifier}`);
	};
	const submit = () => {
		const identifier = identifierOf(text);
		if (identifier === null) return;
		pushRecent(store, identifier);
		setText("");
		openTicket(identifier);
	};

	return (
		<View style={styles.page}>
			<View style={styles.field}>
				<Field
					testID="search-field"
					label="Search"
					placeholder="Identifier, title, or text"
					value={text}
					onChangeText={changeText}
					autoCapitalize="none"
					autoCorrect={false}
					returnKeyType="search"
					onSubmitEditing={submit}
				/>
			</View>
			{!enabled ? (
				recents.length === 0 ? (
					<EmptyState title="No recent searches" hint="Search by identifier, title, or text." />
				) : (
					<View style={styles.recents}>
						<Text style={[styles.heading, { color: palette.fgMuted }]}>Recent searches</Text>
						{recents.map((recent) => (
							<Pressable key={recent} onPress={() => changeText(recent)} style={styles.recent}>
								<Text style={[styles.recentText, { color: palette.fg }]}>{recent}</Text>
							</Pressable>
						))}
					</View>
				)
			) : search.isPending ? null : search.isError ? (
				<EmptyState title="Search failed" hint="Check the server and try again." />
			) : search.data.tickets.length === 0 ? (
				<EmptyState title={`No results for “${query}”`} />
			) : (
				<SearchResults tickets={search.data.tickets} onSelect={openTicket} />
			)}
		</View>
	);
}
