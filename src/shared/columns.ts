// Discord's own window classes (modules/screen/native/useWindowSizeClassifier.tsx).
// Discord derives every column decision from them: LARGE puts chat beside the channel
// list as an overlay, XLARGE tiles a fixed sidebar next to the chat.
export const WindowClass = { SMALL: 0, NORMAL: 1, LARGE: 2, XLARGE: 3 } as const;
export type WindowClass = (typeof WindowClass)[keyof typeof WindowClass];

export type Mode = 'auto' | 'phone';

export type ColumnPolicy = {
	// Tiled sidebar width: Discord's DRAWER_LEFT_WIDTH_MIN (guild rail plus channel list).
	sidebar: number;
	// Chat width Discord itself requires before tiling at default text size (840 - 332).
	readableChat: number;
	// Text sizes past this stop widening the requirement, so huge type still gets a layout.
	maxTextScale: number;
};

export const defaultPolicy: ColumnPolicy = { sidebar: 332, readableChat: 508, maxTextScale: 1.6 };

export const windowClassName = ['SMALL', 'NORMAL', 'LARGE', 'XLARGE'] as const;

// Narrows Discord's choice and never widens it, so the plugin cannot produce a split
// that stock Discord would not. At default text size in auto mode it returns Discord's
// own answer; larger Dynamic Type stops tiling once the chat column would be cramped.
export function adjustWindowClass(
	stock: WindowClass,
	baseWidth: number,
	fontScale: number,
	mode: Mode,
	policy: ColumnPolicy = defaultPolicy,
): WindowClass {
	if (mode === 'phone') return Math.min(stock, WindowClass.NORMAL) as WindowClass;
	if (stock !== WindowClass.XLARGE) return stock;

	const textScale = Math.min(Math.max(fontScale, 1), policy.maxTextScale);
	return baseWidth - policy.sidebar >= policy.readableChat * textScale ? WindowClass.XLARGE : WindowClass.LARGE;
}
