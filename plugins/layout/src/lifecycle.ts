import { settings } from './modules.ts';

export type Cleanup = () => void;

// Applies independent features in order and returns one cleanup that removes them in
// reverse. A feature that throws is skipped with one log line; the others keep working.
export function applyAll(name: string, features: (() => Cleanup)[]): Cleanup {
	const cleanups: Cleanup[] = [];
	for (const feature of features) {
		try {
			cleanups.push(feature());
		} catch (error) {
			console.error(`[${name}] a feature failed to start and stays off: ${String(error)}`);
		}
	}
	return () => {
		for (const cleanup of cleanups.splice(0).reverse()) {
			try {
				cleanup();
			} catch (error) {
				console.error(`[${name}] a feature failed to stop cleanly: ${String(error)}`);
			}
		}
	};
}

// Applies a feature while its switch is on and removes it the moment it turns off.
export function whileSetting(key: string, fallback: boolean, apply: () => Cleanup): Cleanup {
	let remove: Cleanup | null = null;
	const sync = () => {
		const on = settings.get(key, fallback) === true;
		if (on && !remove) remove = apply();
		else if (!on && remove) {
			remove();
			remove = null;
		}
	};
	sync();
	const unlisten = settings.addListener((payload) => payload.store === 'duo.layout' && payload.key === key, sync);
	return () => {
		unlisten();
		remove?.();
		remove = null;
	};
}

export const enabled = (key: string, fallback: boolean) => settings.get(key, fallback) === true;
