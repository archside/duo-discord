import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adjustWindowClass, WindowClass } from './columns.ts';

const { SMALL, NORMAL, LARGE, XLARGE } = WindowClass;

test('default text size keeps Discord tiled on a 951 pt open window', () => {
	assert.equal(adjustWindowClass(XLARGE, 951, 1, 'auto'), XLARGE);
});

test('at default text size the tiling boundary matches stock Discord', () => {
	assert.equal(adjustWindowClass(XLARGE, 841, 1, 'auto'), XLARGE);
	assert.equal(adjustWindowClass(LARGE, 840, 1, 'auto'), LARGE);
});

test('larger Dynamic Type falls back from tiled to chat-beside-list', () => {
	assert.equal(adjustWindowClass(XLARGE, 951, 1.3, 'auto'), LARGE);
	assert.equal(adjustWindowClass(XLARGE, 1100, 1.3, 'auto'), XLARGE);
});

test('text scale is capped so very large type still tiles on very wide windows', () => {
	assert.equal(adjustWindowClass(XLARGE, 332 + 508 * 1.6, 3.1, 'auto'), XLARGE);
});

test('never widens a decision Discord made', () => {
	assert.equal(adjustWindowClass(NORMAL, 2000, 1, 'auto'), NORMAL);
	assert.equal(adjustWindowClass(LARGE, 2000, 1, 'auto'), LARGE);
});

test('phone mode keeps compact navigation in every window', () => {
	assert.equal(adjustWindowClass(XLARGE, 951, 1, 'phone'), NORMAL);
	assert.equal(adjustWindowClass(LARGE, 669, 1, 'phone'), NORMAL);
	assert.equal(adjustWindowClass(SMALL, 320, 1, 'phone'), SMALL);
});

test('a sidebar width read from Discord moves the boundary', () => {
	const policy = { sidebar: 360, readableChat: 508, maxTextScale: 1.6 };
	assert.equal(adjustWindowClass(XLARGE, 860, 1, 'auto', policy), LARGE);
});
