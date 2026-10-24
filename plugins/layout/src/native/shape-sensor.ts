import { AppState, Dimensions } from 'react-native';
import type { NativeHookToken, NativePluginBridge } from '@unbound-app/api/native';

import { createNativeGeometry, toShape } from '../../../../src/shared/native-geometry.ts';
import { posture, type Posture, type Shape } from '../../../../src/shared/posture.ts';

export type DuoView = { shape: Shape | null; posture: Posture };
type Listener = (view: DuoView) => void;

export const sensorCapabilities = ['native.objc.classes', 'native.objc.invoke', 'native.objc.hooks'] as const;

// Folding without a resize fires no UIKit callback a plugin can hook (measured with Duo
// Fold Lab), and UIHingeInteraction needs a handler block the bridge cannot make. So the
// shape is re-read on resize, on return to the foreground, and on the first touch after a
// quiet second: a self-removing hook on the key window's sendEvent:, re-armed afterwards.
export function createShapeSensor(native: NativePluginBridge) {
	const geometry = createNativeGeometry(native);
	const listeners = new Set<Listener>();
	let view: DuoView = { shape: null, posture: { kind: 'flat' } };
	let disposed = false;
	let pending: ReturnType<typeof setTimeout> | undefined;
	let rearm: ReturnType<typeof setTimeout> | undefined;
	let touch: NativeHookToken | null = null;

	function snapshot() {
		try {
			return geometry.read();
		} catch {
			return null;
		}
	}

	function read() {
		const current = snapshot();
		if (disposed || !current) return;
		const shape = toShape(current);
		const next: DuoView = { shape, posture: posture(shape) };
		if (JSON.stringify(next) === JSON.stringify(view)) return;
		view = next;
		for (const listener of listeners) listener(view);
	}

	function readSoon(delay: number) {
		clearTimeout(pending);
		pending = setTimeout(read, delay);
	}

	function armTouch() {
		let window = null;
		try {
			window = geometry.keyWindow();
		} catch {}
		if (disposed || !window) return;
		touch = native.objc.hook(
			'UIWindow',
			'sendEvent:',
			{
				after: () => {
					touch = null;
					readSoon(50);
					rearm = setTimeout(armTouch, 1000);
				},
			},
			{ instance: window, once: true },
		);
	}

	const subscriptions = [
		// The safe-area store settles a moment after the window resizes.
		Dimensions.addEventListener('change', () => readSoon(250)),
		AppState.addEventListener('change', (state) => state === 'active' && readSoon(250)),
	];
	// Synchronous, so features deciding during Discord's first render already see the shape.
	read();
	armTouch();

	return {
		get: () => view,
		subscribe(listener: Listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		dispose() {
			disposed = true;
			clearTimeout(pending);
			clearTimeout(rearm);
			touch?.remove();
			for (const subscription of subscriptions) subscription.remove();
			listeners.clear();
		},
	};
}

export type ShapeSensor = ReturnType<typeof createShapeSensor>;

// Stand-in when the native bridge is missing: always flat, no shape, so every
// native-dependent feature stays at Discord's stock behavior.
export const flatSensor: ShapeSensor = {
	get: () => ({ shape: null, posture: { kind: 'flat' } }),
	subscribe: () => () => {},
	dispose: () => {},
};
