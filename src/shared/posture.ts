import type { Insets, Rect } from './geometry.ts';

// What UIKit reports about the window, in window points. Built from the native snapshot;
// nothing here is a device constant, so other foldables and windows get the same rules.
export type Shape = {
	window: { width: number; height: number };
	safeArea: Insets;
	regularWidth: boolean;
	// Active occlusions only (system controls, cameras in use).
	occlusions: Rect[];
	// Division regions, active or not. A flat fold is present but inactive.
	folds: { frame: Rect; active: boolean }[];
};

export type Posture =
	| { kind: 'flat' }
	// Fold runs top to bottom: two side-by-side halves.
	| { kind: 'book'; fold: Rect }
	// Fold runs side to side: a top half above a bottom half.
	| { kind: 'tabletop'; fold: Rect };

export function posture(shape: Shape): Posture {
	const fold = shape.folds.find((f) => f.active);
	if (!fold || !shape.regularWidth) return { kind: 'flat' };
	return fold.frame.height > fold.frame.width ? { kind: 'book', fold: fold.frame } : { kind: 'tabletop', fold: fold.frame };
}

// Narrowest side band worth a vertical rail: one 44 pt touch target.
const MIN_BAND = 44;
// A rail needs room for its buttons below whatever the system draws at the top of the band.
const MIN_RAIL_HEIGHT = 4 * 48;

export type Band = { edge: 'leading' | 'trailing'; frame: Rect };

// The side safe-area band the system reserves (the status bar column on iPhone Duo).
// Top and bottom bands are not side bands; Apple keeps bars horizontal there.
export function sideBand(shape: Shape): Band | null {
	const { width, height } = shape.window;
	const { left, right } = shape.safeArea;
	if (right >= MIN_BAND && right >= left) return { edge: 'trailing', frame: { x: width - right, y: 0, width: right, height } };
	if (left >= MIN_BAND) return { edge: 'leading', frame: { x: 0, y: 0, width: left, height } };
	return null;
}

function overlaps(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// The part of the side band below the system's occlusions and above the bottom inset,
// where Apple places vertical bars ("below the status bar").
export function railFrame(shape: Shape): (Rect & { edge: Band['edge'] }) | null {
	const band = sideBand(shape);
	if (!band) return null;
	const top = shape.occlusions.filter((o) => overlaps(o, band.frame)).reduce((max, o) => Math.max(max, o.y + o.height), shape.safeArea.top);
	const bottom = shape.window.height - shape.safeArea.bottom;
	if (bottom - top < MIN_RAIL_HEIGHT) return null;
	return { edge: band.edge, x: band.frame.x, y: top, width: band.frame.width, height: bottom - top };
}

export type Toolbar = { frame: Rect };

// The floating navigation pill's slot: down the side band below the status bar, where
// Apple places vertical bars (landscape, the outer display). Portrait keeps Discord's own
// floating bar at the bottom, as Apple keeps bars horizontal on the inner display there.
export function toolbar(shape: Shape): Toolbar | null {
	const rail = railFrame(shape);
	return rail ? { frame: { x: rail.x, y: rail.y, width: rail.width, height: rail.height } } : null;
}

// In a portrait top band, headers share the row with the status bar, as native iPhone
// Duo apps do: they start this far from the top, and stay clear of whatever the system
// draws at the band's trailing end.
export const HEADER_ROW_TOP = 28;
const HEADER_GAP = 8;

export type HeaderRow = { top: number; trailing: number };

// Where a header that runs to the window's trailing edge may sit inside a top band.
// Null when there is no top band, or when the system draws at its leading side.
export function headerRow(shape: Shape): HeaderRow | null {
	const top = shape.safeArea.top;
	if (sideBand(shape) || top <= HEADER_ROW_TOP) return null;
	const band: Rect = { x: 0, y: 0, width: shape.window.width, height: top };
	const blocking = shape.occlusions.filter((o) => overlaps(o, band));
	if (blocking.some((o) => o.x < shape.window.width / 2)) return null;
	const trailing = blocking.reduce((most, o) => Math.max(most, shape.window.width - o.x + HEADER_GAP), 0);
	return { top: HEADER_ROW_TOP, trailing };
}

// How far a leading column may rise to that header row: allowed only when nothing the
// system draws sits above it. A column reaching under the status bar stays put.
export function columnLift(shape: Shape, columnRight: number): number {
	const row = headerRow(shape);
	if (!row) return 0;
	const above: Rect = { x: 0, y: 0, width: columnRight, height: shape.safeArea.top };
	return shape.occlusions.some((o) => overlaps(o, above)) ? 0 : shape.safeArea.top - row.top;
}

// With the status bar moved to a side band, iOS reports no top inset, and content packs
// against the display's rounded top edge. This is the breathing room to keep instead.
export const COMFORTABLE_TOP = 20;

export function comfortableTop(shape: Shape | null, top: number): number {
	return shape && sideBand(shape) && top < COMFORTABLE_TOP ? COMFORTABLE_TOP : top;
}

// In the book posture the channel list should end where the fold ends, so the chat sits
// wholly on the other half. `contentLeft` is where Discord's content box starts.
export function bookSidebarWidth(p: Posture, contentLeft: number, minimum: number): number | null {
	if (p.kind !== 'book') return null;
	const width = p.fold.x + p.fold.width - contentLeft;
	return width >= minimum ? width : null;
}

// In the tabletop posture, media belongs above the fold and controls on the base below it.
export function tabletopMediaHeight(p: Posture, minimum: number): number | null {
	if (p.kind !== 'tabletop') return null;
	return p.fold.y >= minimum ? p.fold.y : null;
}

export function samePosture(a: Posture, b: Posture): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
