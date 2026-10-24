import type { NativeHandle, NativeObjCBridge, NativePluginBridge } from '@unbound-app/api/native';

import type { Insets, Rect, SizeClass } from './geometry.ts';
import type { Shape } from './posture.ts';

// UIKit facts read through Unbound's Objective-C bridge. Every API is probed with
// respondsTo before use, so older iOS versions simply report fewer fields.
export type RegionReport = { kind: 'division' | 'occlusion'; frame: Rect; active: boolean };

export type NativeSnapshot = {
	window: Rect;
	screen?: Rect;
	safeArea?: Insets;
	horizontalSizeClass?: SizeClass;
	verticalSizeClass?: SizeClass;
	regions?: RegionReport[];
	reservedRegionApi: boolean;
	interfaceOrientation?: number;
	idiom?: number;
};

export const nativeCapabilities = ['native.objc.classes', 'native.objc.invoke'] as const;

type Ui = (target: NativeHandle, selector: string, ...args: unknown[]) => unknown;

// UIKit must be touched on the main thread. The blocking main-thread invoke is the
// one call every native plugin ABI 1.0 loader offers (the installed client exposes no
// invokeAsync), and being synchronous lets a reader answer before the first render.
function mainThread(objc: NativeObjCBridge): Ui {
	return (target, selector, ...args) => objc.invoke(target, selector, args, { thread: 'main' });
}

// Measured on device: the bridge converts NSArray results to plain arrays (and NSDictionary
// to plain objects) but leaves handles it cannot convert, so accept both.
function list(objc: NativeObjCBridge, value: unknown): NativeHandle[] {
	return (Array.isArray(value) ? value : objc.array(value as NativeHandle)) as NativeHandle[];
}

type Boxed = { value?: Boxed; origin?: { x?: number; y?: number }; size?: { width?: number; height?: number } } & Record<string, unknown>;

function unbox(raw: unknown): Boxed {
	const boxed = raw as Boxed | null | undefined;
	return (boxed?.value ?? boxed ?? {}) as Boxed;
}

export function readRect(raw: unknown): Rect {
	const r = unbox(raw);
	return {
		x: Number(r.origin?.x ?? r.x ?? 0),
		y: Number(r.origin?.y ?? r.y ?? 0),
		width: Number(r.size?.width ?? r.width ?? 0),
		height: Number(r.size?.height ?? r.height ?? 0),
	};
}

export function readInsets(raw: unknown): Insets {
	const r = unbox(raw);
	return { top: Number(r.top ?? 0), left: Number(r.left ?? 0), bottom: Number(r.bottom ?? 0), right: Number(r.right ?? 0) };
}

// UIUserInterfaceSizeClass: 0 unspecified, 1 compact, 2 regular.
export function readSizeClass(raw: unknown): SizeClass {
	const value = Number(raw);
	return value === 1 ? 'compact' : value === 2 ? 'regular' : 'unspecified';
}

const includeInactive = 1;

export function createNativeGeometry(native: NativePluginBridge) {
	const { objc } = native;
	const ui = mainThread(objc);
	const has = (handle: NativeHandle | null, selector: string) => Boolean(handle && objc.respondsTo(handle, selector));
	const regionKinds = objc.getClass('UIViewReservedRegionKind');

	function keyWindow(): { scene: NativeHandle; window: NativeHandle } | null {
		const app = (ui(objc.getClass('UIApplication')!, 'sharedApplication')) as NativeHandle;
		const scenes = list(objc, ui((ui(app, 'connectedScenes')) as NativeHandle, 'allObjects'));
		for (const scene of scenes) {
			if (!has(scene, 'keyWindow')) continue;
			const window = (ui(scene, 'keyWindow')) as NativeHandle | null;
			if (window) return { scene, window };
		}
		return null;
	}

	function regions(window: NativeHandle): RegionReport[] {
		const found: RegionReport[] = [];
		for (const kind of ['division', 'occlusion'] as const) {
			const kindHandle = (ui(regionKinds!, `${kind}RegionKind`)) as NativeHandle;
			for (const region of list(objc, ui(window, 'reservedRegionsOfKind:options:', kindHandle, includeInactive))) {
				// UIViewReservedRegion's BOOL property uses the getter isActive.
				const active = ui(region, objc.respondsTo(region, 'isActive') ? 'isActive' : 'active');
				found.push({ kind, frame: readRect(ui(region, 'frame')), active: Boolean(active) });
			}
		}
		return found;
	}

	function read(): NativeSnapshot | null {
		const target = keyWindow();
		if (!target) return null;
		const { scene, window } = target;
		const traits = (ui(window, 'traitCollection')) as NativeHandle;
		const reservedRegionApi = Boolean(regionKinds) && has(window, 'reservedRegionsOfKind:options:');
		const screen = has(scene, 'screen') ? ((ui(scene, 'screen')) as NativeHandle) : null;
		const geometry = has(scene, 'effectiveGeometry') ? ((ui(scene, 'effectiveGeometry')) as NativeHandle) : null;
		const device = (ui(objc.getClass('UIDevice')!, 'currentDevice')) as NativeHandle;

		return {
			window: readRect(ui(window, 'bounds')),
			screen: screen ? readRect(ui(screen, 'bounds')) : undefined,
			safeArea: readInsets(ui(window, 'safeAreaInsets')),
			horizontalSizeClass: readSizeClass(ui(traits, 'horizontalSizeClass')),
			verticalSizeClass: readSizeClass(ui(traits, 'verticalSizeClass')),
			regions: reservedRegionApi ? regions(window) : undefined,
			reservedRegionApi,
			interfaceOrientation: geometry ? Number(ui(geometry, 'interfaceOrientation')) : undefined,
			idiom: Number(ui(device, 'userInterfaceIdiom')),
		};
	}

	return { read, keyWindow: () => keyWindow()?.window ?? null };
}

// The window shape posture.ts reasons about, from a native snapshot.
export function toShape(snapshot: NativeSnapshot): Shape {
	const regions = snapshot.regions ?? [];
	return {
		window: { width: snapshot.window.width, height: snapshot.window.height },
		safeArea: snapshot.safeArea ?? { top: 0, left: 0, bottom: 0, right: 0 },
		regularWidth: snapshot.horizontalSizeClass === 'regular',
		occlusions: regions.filter((r) => r.kind === 'occlusion' && r.active).map((r) => r.frame),
		folds: regions.filter((r) => r.kind === 'division').map((r) => ({ frame: r.frame, active: r.active })),
	};
}
