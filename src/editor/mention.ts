import 'tippy.js/dist/tippy.css';
import { Mention } from '@tiptap/extension-mention';
import { SvelteRenderer } from 'svelte-tiptap';
import tippy, { type Instance } from 'tippy.js';
import MentionList from './mention.svelte';
import type { SvelteComponent } from 'svelte';

export const NostrMention = Mention.configure({
	HTMLAttributes: {
		class: 'text-blue-600 bg-blue-50 rounded px-1 font-medium hover:bg-blue-100 transition-colors'
	},
	renderHTML({ node, options }) {
		return [
			'a',
			{
				// ...HTMLAttributes,
				href: `nostr:${node.attrs.id}`,
				'data-npub': node.attrs.id
			},
			`@${node.attrs.label || node.attrs.id.slice(0, 8)}`
		];
	},
	suggestion: {
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
					console.log('onStart', popup, component);
				},

				onUpdate: (props) => {
					console.log('onUpdate', popup);
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
