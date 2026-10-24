import { AccessibilityInfo, Dimensions, PixelRatio } from 'react-native';

import type { Geometry } from './geometry.ts';

export type NativeFacts = Pick<Geometry, 'safeArea' | 'horizontalSizeClass' | 'verticalSizeClass'>;

export type Environment = {
	geometry: Geometry;
	reduceMotion: boolean;
	screenReader: boolean;
};

type Listener = (environment: Environment) => void;

// One live snapshot of the window, refreshed only by system events (no polling).
// `readNative` adds UIKit-only facts; without it, safe areas read as zero and size
// classes stay unknown.
export function createEnvironmentStore(readNative?: () => Promise<Partial<NativeFacts>>) {
	const listeners = new Set<Listener>();
	let native: Partial<NativeFacts> = {};
	let reduceMotion = false;
	let screenReader = false;
	let current = snapshot();
	let generation = 0;

	function snapshot(): Environment {
		const { width, height } = Dimensions.get('window');
		return {
			geometry: {
				window: { width, height },
				safeArea: native.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 },
				fontScale: PixelRatio.getFontScale(),
				horizontalSizeClass: native.horizontalSizeClass,
				verticalSizeClass: native.verticalSizeClass,
			},
			reduceMotion,
			screenReader,
		};
	}

	function publish() {
		current = snapshot();
		for (const listener of listeners) listener(current);
	}

	async function refreshNative() {
		if (!readNative) return;
		const mine = ++generation;
		const facts = await readNative().catch(() => ({}));
		if (mine !== generation) return;
		native = facts;
		publish();
	}

	function onChange() {
		publish();
		void refreshNative();
	}

	const subscriptions = [
		Dimensions.addEventListener('change', onChange),
		AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
			reduceMotion = value;
			publish();
		}),
		AccessibilityInfo.addEventListener('screenReaderChanged', (value) => {
			screenReader = value;
			publish();
		}),
	];

	void Promise.all([AccessibilityInfo.isReduceMotionEnabled(), AccessibilityInfo.isScreenReaderEnabled()]).then(
		([motion, reader]) => {
			reduceMotion = motion;
			screenReader = reader;
			publish();
		},
	);
	void refreshNative();

	return {
		get: () => current,
		subscribe(listener: Listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		// Posture can change without a window resize (flat to book), so native hooks call this too.
		refresh: onChange,
		dispose() {
			generation++;
			listeners.clear();
			for (const subscription of subscriptions) subscription.remove();
		},
	};
}

export type EnvironmentStore = ReturnType<typeof createEnvironmentStore>;
