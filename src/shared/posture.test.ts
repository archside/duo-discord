import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bookSidebarWidth, columnLift, comfortableTop, headerRow, posture, railFrame, sideBand, tabletopMediaHeight, toolbar, type Shape } from './posture.ts';

// Shapes measured on the iPhone Duo (see measurements/), used as fixtures only.
const landscape = (foldActive: boolean): Shape => ({
	window: { width: 951, height: 669 },
	safeArea: { top: 0, left: 0, bottom: 34, right: 84 },
	regularWidth: true,
	occlusions: [{ x: 867, y: 0, width: 84, height: 124 }],
	folds: [{ frame: { x: 455.5, y: 0, width: 40, height: 669 }, active: foldActive }],
});
const portrait = (foldActive: boolean): Shape => ({
	window: { width: 669, height: 951 },
	safeArea: { top: 82, left: 0, bottom: 34, right: 0 },
	regularWidth: true,
	occlusions: [{ x: 525, y: 0, width: 144, height: 82 }],
	folds: [{ frame: { x: 0, y: 455.5, width: 669, height: 40 }, active: foldActive }],
});
const outer: Shape = {
	window: { width: 466, height: 678 },
	safeArea: { top: 0, left: 0, bottom: 34, right: 84 },
	regularWidth: false,
	occlusions: [],
	folds: [],
};

test('flat until a fold region is active', () => {
	assert.deepEqual(posture(landscape(false)), { kind: 'flat' });
	assert.deepEqual(posture(portrait(false)), { kind: 'flat' });
});

test('a vertical active fold is the book posture, a horizontal one is tabletop', () => {
	assert.equal(posture(landscape(true)).kind, 'book');
	assert.equal(posture(portrait(true)).kind, 'tabletop');
});

test('a compact window is never treated as folded', () => {
	assert.deepEqual(posture({ ...landscape(true), regularWidth: false }), { kind: 'flat' });
});

test('the side band is the wide side inset; a top band is not a side band', () => {
	assert.deepEqual(sideBand(landscape(false)), { edge: 'trailing', frame: { x: 867, y: 0, width: 84, height: 669 } });
	assert.equal(sideBand(portrait(false)), null);
	assert.equal(sideBand(outer)?.edge, 'trailing');
});

test('the rail starts below the system controls and stops above the bottom inset', () => {
	assert.deepEqual(railFrame(landscape(false)), { edge: 'trailing', x: 867, y: 124, width: 84, height: 511 });
	assert.deepEqual(railFrame(outer), { edge: 'trailing', x: 382, y: 0, width: 84, height: 644 });
	assert.equal(railFrame(portrait(false)), null);
});

test('no rail when the band is too short for its buttons', () => {
	const short = { ...landscape(false), occlusions: [{ x: 867, y: 0, width: 84, height: 480 }] };
	assert.equal(railFrame(short), null);
});

test('the floating toolbar lives in the side band, never in a top band', () => {
	assert.deepEqual(toolbar(landscape(false)), { frame: { x: 867, y: 124, width: 84, height: 511 } });
	assert.ok(toolbar(outer));
	assert.equal(toolbar(portrait(false)), null);
});

test('in portrait a column left of the status bar rises into the top band', () => {
	assert.equal(columnLift(portrait(false), 372), 54);
	assert.equal(columnLift(portrait(false), 600), 0, 'a column reaching under the status bar stays put');
	assert.equal(columnLift(landscape(false), 332), 0, 'no top band in landscape');
});

test('portrait headers share the status bar row and stay clear of it at the trailing end', () => {
	assert.deepEqual(headerRow(portrait(false)), { top: 28, trailing: 152 });
	assert.equal(headerRow(landscape(false)), null, 'landscape has no top band');
	assert.equal(headerRow({ ...portrait(false), occlusions: [{ x: 0, y: 0, width: 144, height: 82 }] }), null, 'system UI at the leading side');
});

test('a comfortable top edge only applies when the status bar moved to a side band', () => {
	assert.equal(comfortableTop(landscape(false), 0), 20);
	assert.equal(comfortableTop(portrait(false), 82), 82);
	assert.equal(comfortableTop(null, 0), 0);
});

test('in the book posture the sidebar ends at the far edge of the fold', () => {
	assert.equal(bookSidebarWidth(posture(landscape(true)), 0, 300), 495.5);
	assert.equal(bookSidebarWidth(posture(landscape(false)), 0, 300), null);
	assert.equal(bookSidebarWidth(posture(landscape(true)), 0, 600), null);
});

test('in tabletop the media area ends at the top of the fold', () => {
	assert.equal(tabletopMediaHeight(posture(portrait(true)), 200), 455.5);
	assert.equal(tabletopMediaHeight(posture(landscape(true)), 200), null);
});
