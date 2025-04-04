import 'tippy.js/dist/tippy.css';
import { Mention } from '@tiptap/extension-mention';
import { SvelteRenderer } from 'svelte-tiptap';
import tippy, { type Instance } from 'tippy.js';
import MentionList from './mention.svelte';
import type { SvelteComponent } from 'svelte';
import { nip19 } from 'nostr-tools';

export const NostrMention = Mention.configure({
	suggestion: {
		command: ({ editor, range, props }) => {
			const nodeAfter = editor.view.state.selection.$to.nodeAfter;
			const overrideSpace = nodeAfter?.text?.startsWith(' ');

			if (overrideSpace) {
				range.to += 1;
			}

			editor
				.chain()
				.focus()
				.insertContentAt(range, [{ type: 'nprofile', attrs: props }])
				.run();
		},
		char: '@',
		allowSpaces: false,
		// This is a simple placeholder array - the actual items will be managed by the MentionList component
		items: ({ query }) => [],
		render: () => {
			let component: SvelteComponent;
			let popup: Instance<any>[];
			let container: HTMLElement = document.createElement('div');
			return {
				onStart: (props) => {
					component = new MentionList({
						target: container,
						props: {
							...props,
							query: props.query,
							items: []
						}
					});
					popup = tippy('body', {
						getReferenceClientRect: () => props.clientRect?.() || new DOMRect(),
						appendTo: document.body,
						content: container,
						showOnCreate: false,
						interactive: true,
						arrow: false,

						trigger: 'manual',
						placement: 'bottom-start'
					});
				},

				onUpdate: (props) => {
					if (props.query) {
						popup[0].show();
					} else {
						popup[0].hide();
					}
					component.$set({
						...props,
						query: props.query
					});

					if (props.clientRect) {
						popup[0].setProps({
							getReferenceClientRect: props.clientRect as any
						});
					}
				},
				onKeyDown: (props) => {
					if (props.event.key === 'Escape') {
						popup[0].hide();

						return true;
					}

					return Boolean(component.onKeyDown?.(props.event));
				},
				onExit: () => {
					popup[0].destroy();
					component.$destroy();
				}
			};
		}
	}
});
