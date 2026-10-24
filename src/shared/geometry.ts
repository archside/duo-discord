export type Insets = { top: number; right: number; bottom: number; left: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type SizeClass = 'compact' | 'regular' | 'unspecified';

// What the window looks like right now, in points. Every field comes from a live
// system query, never from a device table, so this works for any window size.
export type Geometry = {
	window: { width: number; height: number };
	safeArea: Insets;
	fontScale: number;
	horizontalSizeClass?: SizeClass;
	verticalSizeClass?: SizeClass;
};
