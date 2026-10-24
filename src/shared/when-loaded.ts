import { metro } from '@unbound-app/api';

type Cleanup = () => void;

// Discord loads most modules on first use, often after plugins start. Waits for every
// path, applies once, and returns one cleanup that cancels the wait or removes the feature.
export function whenAllLoaded(paths: string[], apply: (modules: any[]) => Cleanup): Cleanup {
	const controller = new AbortController();
	let remove: Cleanup | undefined;

	void Promise.all(
		paths.map((path) => metro.findLazy(metro.filters.byFilePath(path), { interop: false, signal: controller.signal })),
	).then((modules) => {
		if (!controller.signal.aborted) remove = apply(modules);
	}, () => {});

	return () => {
		controller.abort();
		remove?.();
		remove = undefined;
	};
}

// Only modules Discord already initialized: a plain find would run a module's top-level
// code early, which a read-only probe must never do.
export function findLoaded(path: string): any {
	return metro.find(metro.filters.byFilePath(path), { interop: false, initialize: false } as Parameters<typeof metro.find>[1]);
}
