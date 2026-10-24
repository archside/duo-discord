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
		if (controller.signal.aborted) return;
		try {
			remove = apply(modules);
		} catch (error) {
			console.error(`[Duo] a feature failed to start once Discord loaded it, and stays off: ${String(error)}`);
		}
	}, () => {});

	return () => {
		controller.abort();
		remove?.();
		remove = undefined;
	};
}

const components = new Map<string, any>();

// A Discord component this plugin renders itself. Discord requires many components inline,
// on first render; while its own copy is hidden nothing has loaded the module yet, so this
// one initializes it, the way Discord's render would. Found modules are kept.
export function findComponent(path: string): any {
	if (!components.has(path)) {
		const found = metro.find(metro.filters.byFilePath(path), { interop: false, initialize: true } as Parameters<typeof metro.find>[1]);
		if (!found) return undefined;
		components.set(path, found);
	}
	return components.get(path);
}

// Only modules Discord already initialized: a plain find would run a module's top-level
// code early, which a read-only probe must never do.
export function findLoaded(path: string): any {
	return metro.find(metro.filters.byFilePath(path), { interop: false, initialize: false } as Parameters<typeof metro.find>[1]);
}
