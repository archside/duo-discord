import type { Rect } from '../../../../src/shared/geometry.ts';

// Where each mounted channel header sits in the window, measured on layout. The side band
// lives outside Discord's clipped chat column, so it reads these to continue the chat.
const frames = new Map<object, Rect>();
const listeners = new Set<() => void>();
let version = 0;

const same = (a: Rect | undefined, b: Rect | null) => (a && b ? a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height : !a && !b);

export const chatHeaderFrames = {
	set(owner: object, frame: Rect | null) {
		if (same(frames.get(owner), frame)) return;
		if (frame) frames.set(owner, frame);
		else frames.delete(owner);
		version++;
		for (const listener of listeners) listener();
	},
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => void listeners.delete(listener);
	},
	version: () => version,
	all: () => [...frames.values()],
};
