import { Dimensions } from 'react-native';

import { findLoaded } from '../../../../src/shared/when-loaded.ts';
import type { Cleanup } from '../lifecycle.ts';
import { paths } from '../modules.ts';
import { hiddenConversation, openConversation } from '../navigation.ts';

// When columns collapse to the phone layout, Discord leaves the open conversation behind
// the server list (measured on device), so folding mid-conversation lands on the list.
// After the layout settles, the conversation is pushed the way a tap on it would push it.
export function keepConversationOnFold(): Cleanup {
	const beside = () => {
		try {
			return Boolean(findLoaded(paths.chatLayout)?.getChatLayout?.().isChatBesideChannelList);
		} catch {
			return false;
		}
	};
	let wasBeside = beside();
	let timer: ReturnType<typeof setTimeout> | undefined;

	const subscription = Dimensions.addEventListener('change', () => {
		clearTimeout(timer);
		// Past the one render where Discord's safe-area store lags the new window size.
		timer = setTimeout(() => {
			const now = beside();
			const conversation = wasBeside && !now ? hiddenConversation() : null;
			wasBeside = now;
			if (conversation && openConversation(conversation)) console.log('[DuoLayout] kept the open conversation on screen after the fold');
		}, 300);
	});

	return () => {
		clearTimeout(timer);
		subscription.remove();
	};
}
