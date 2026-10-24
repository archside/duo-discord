import React from 'react';
import { View } from 'react-native';

import type { HeaderPlacement } from '../../../../src/shared/posture.ts';
import { rewrite, type Element } from './tree.ts';

type Style = Record<string, unknown>;
export type Component = (props: Record<string, unknown>) => unknown;

// Discord's channel header gives its root the safe-area top, as padding or (beside the
// channel list) as a margin, together with a minimum height. That pairing is the signature.
function headerEntry(style: unknown): Style | undefined {
	if (!Array.isArray(style)) return undefined;
	return style.find((s): s is Style => {
		if (!s || typeof s !== 'object') return false;
		const { minHeight, paddingTop, marginTop } = s as Style;
		return typeof minHeight === 'number' && (typeof paddingTop === 'number' || typeof marginTop === 'number');
	});
}

// The header's style with its trailing buttons clear of the system's band. Lifted to a
// header row, its surface also runs to the top edge, so the band reads as part of the header.
function placed(style: unknown[], entry: Style, placement: HeaderPlacement): unknown[] {
	if (placement.top == null) return [...style, { paddingRight: placement.trailing }];
	const padded = typeof entry.paddingTop === 'number';
	const top = Math.min(placement.top, Number(padded ? entry.paddingTop : entry.marginTop));
	const minHeight = Number(entry.minHeight) + (padded ? top - Number(entry.paddingTop) : top);
	return [...style, { marginTop: 0, paddingTop: top, minHeight, borderTopWidth: 0, paddingRight: placement.trailing }];
}

const frameSlot = { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 } as const;

// Edits a rendered channel header's root: placed per `placement` when given, with `extra`
// appended after Discord's children so theirs keep their positions. Discord's `frame` fades
// in a bar as tall as the safe-area top when the chat expands; a lifted header's own surface
// covers that band, so the bar is cut away. It is always slotted, so lifting never remounts
// it. The same tree when the signature is absent.
export function editChannelHeader(tree: unknown, placement: HeaderPlacement | null, extra: React.ReactNode, frame: unknown): unknown {
	const lifted = placement?.top != null;
	return rewrite(tree, 3, (el) => {
		if (frame && el === frame) {
			return (
				<View key='duo-header-frame-slot' pointerEvents='none' style={[frameSlot, lifted && { height: 0, overflow: 'hidden' }]}>
					{frame as React.ReactNode}
				</View>
			);
		}
		const style = el.props?.style;
		const entry = headerEntry(style);
		if (!entry) return undefined;
		const children = el.props!.children;
		return React.cloneElement(
			el as React.ReactElement<{ style: unknown; children: unknown }>,
			{ style: placement ? placed(style as unknown[], entry, placement) : style },
			...(Array.isArray(children) ? children : [children]),
			extra,
		);
	});
}

// The channel screen renders its header through a component private to its module, so the
// header's props are the signature.
function isChannelHeader(el: Element): el is Element & { type: Component } {
	const type = el.type as ((...args: unknown[]) => unknown) | undefined;
	return typeof type === 'function' && !type.prototype?.isReactComponent && 'showCreateThread' in el.props! && 'measureNavigationTTI' in el.props!;
}

const screens = new WeakMap<object, unknown>();

// Swaps the screen's header for `wrap(header)`. One result per rendered tree, so a screen
// that re-renders with the same elements still bails out below.
export function wrapChannelHeader(tree: unknown, wrap: (header: Component) => Component): unknown {
	if (!tree || typeof tree !== 'object') return tree;
	if (!screens.has(tree)) {
		screens.set(
			tree,
			rewrite(tree, 6, (el) => (isChannelHeader(el) ? React.createElement(wrap(el.type) as React.FC, { ...el.props, key: el.key ?? undefined }) : undefined)),
		);
	}
	return screens.get(tree);
}

// A compact outline of the top of a render tree: element types and any vertical spacing
// styles. Logged when a signature is missing, so a Discord change is diagnosable.
export function outline(node: unknown, depth = 0): unknown {
	if (!node || typeof node !== 'object' || depth > 6) return undefined;
	if (Array.isArray(node)) return node.map((child) => outline(child, depth)).filter(Boolean);
	const { type, props } = node as Element;
	if (!props) return undefined;
	const name = typeof type === 'string' ? type : ((type as { displayName?: string; name?: string })?.displayName ?? (type as { name?: string })?.name ?? typeof type);
	const spacing = ([] as unknown[])
		.concat(props.style ?? [])
		.flat(3)
		.filter((s): s is Style => Boolean(s) && typeof s === 'object')
		.map((s) => Object.fromEntries(Object.entries(s).filter(([k, v]) => /^(padding|margin)Top$|^minHeight$/.test(k) && typeof v === 'number')))
		.filter((s) => Object.keys(s).length);
	const children = outline(props.children, depth + 1);
	return { [name]: [spacing.length ? spacing : undefined, children].filter(Boolean) };
}
