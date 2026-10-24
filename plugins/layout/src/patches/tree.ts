import React from 'react';

export type Element = { type?: unknown; key?: React.Key | null; props?: Record<string, unknown> };

// Rewrites the first matching elements near the top of a render tree. Branches with no
// match keep their identity, so React's bailouts still hold there.
export function rewrite(node: unknown, maxDepth: number, visit: (el: Element) => unknown, depth = 0): unknown {
	if (!node || typeof node !== 'object' || depth > maxDepth) return node;
	if (Array.isArray(node)) {
		let changed = false;
		const next = node.map((child) => {
			const out = rewrite(child, maxDepth, visit, depth);
			changed ||= out !== child;
			return out;
		});
		return changed ? next : node;
	}
	const el = node as Element;
	if (!el.props) return node;
	const replaced = visit(el);
	if (replaced !== undefined) return replaced;
	const children = rewrite(el.props.children, maxDepth, visit, depth + 1);
	return children === el.props.children ? node : React.cloneElement(node as React.ReactElement<{ children: unknown }>, { children });
}
