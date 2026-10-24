import { findLoaded } from '../../../../src/shared/when-loaded.ts';
import { paths } from '../modules.ts';

type Entry = Record<string, unknown>;
type Store = { getState(): { byAppEntry?: Record<string, Entry> }; setState(update: (state: any) => object): void };

function findStore(candidates: string[]): Store | undefined {
	for (const path of candidates) {
		const store = findLoaded(path)?.default;
		if (typeof store?.getState === 'function' && typeof store?.setState === 'function' && store.getState()?.byAppEntry) return store;
	}
}

// Replaces one field of every app entry with an equal copy, so every component that
// selects it re-renders and recomputes from the same numbers.
function touch(store: Store, field: string) {
	store.setState((state) => ({
		byAppEntry: Object.fromEntries(
			Object.entries(state.byAppEntry as Record<string, Entry>).map(([key, entry]) => [
				key,
				entry[field] && typeof entry[field] === 'object' ? { ...entry, [field]: { ...(entry[field] as object) } } : entry,
			]),
		),
	}));
}

let batching = false;
let requested = false;

// Starting or stopping applies several features; one re-render covers all of them.
export function batchRefresh(run: () => void) {
	batching = true;
	requested = false;
	try {
		run();
	} finally {
		batching = false;
		if (requested) refreshLayout();
	}
}

// Re-renders everything that reads Discord's window dimensions or safe-area insets, so a
// new decision applies now instead of at the next fold or rotation.
export function refreshLayout(): boolean {
	const dimensions = findStore(paths.dimensionsStores);
	const safeArea = findStore([paths.safeAreaStore]);
	if (!dimensions && !safeArea) return false;
	if (batching) {
		requested = true;
		return true;
	}
	if (dimensions) touch(dimensions, 'windowDimensions');
	if (safeArea) touch(safeArea, 'safeAreaInsets');
	return true;
}
