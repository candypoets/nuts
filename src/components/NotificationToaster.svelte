<script lang="ts">
	import { nip19 } from 'nostr-tools';
	import { fade } from 'svelte/transition';

	import {
		dismissNotificationToast,
		notificationToasts,
		type NotificationToast
	} from 'src/controller/notificationToast';
	import { go } from 'src/routes/modals/modal';

	function openToast(toast: NotificationToast) {
		dismissNotificationToast(toast.id);
		go(
			`nevent:${nip19.neventEncode({
				id: toast.targetEventId,
				relays: toast.relays
			})}`
		);
	}
</script>

{#if $notificationToasts.length}
	<section
		class="notification-toast-stack"
		aria-label="New notifications"
		aria-live="polite"
		aria-relevant="additions"
	>
		{#each $notificationToasts as toast, index (toast.id)}
			<div
				class="notification-toast-layer"
				style:--stack-index={index}
				transition:fade={{ duration: 160 }}
			>
				<div class="notification-toast">
					<button
						type="button"
						class="notification-toast-main"
						aria-label={`${toast.title}. ${toast.message}. Open post`}
						on:click={() => openToast(toast)}
					>
						<span class="notification-toast-mark" aria-hidden="true"></span>
						<span class="min-w-0">
							<span class="notification-toast-title">{toast.title}</span>
							<span class="notification-toast-message">{toast.message}</span>
						</span>
					</button>

					<button
						type="button"
						class="notification-toast-close"
						aria-label={`Dismiss ${toast.title.toLowerCase()}`}
						on:click={() => dismissNotificationToast(toast.id)}
					>
						<span aria-hidden="true">×</span>
					</button>
				</div>
			</div>
		{/each}
	</section>
{/if}

<style>
	.notification-toast-stack {
		position: fixed;
		right: 1.5rem;
		bottom: 1.5rem;
		z-index: 60;
		display: none;
		width: min(22rem, calc(100vw - 3rem));
		isolation: isolate;
		pointer-events: none;
	}

	.notification-toast-layer {
		grid-area: 1 / 1;
		align-self: end;
		transform: translateY(calc(var(--stack-index) * -0.75rem))
			scale(calc(1 - var(--stack-index) * 0.018));
		transform-origin: bottom right;
		z-index: calc(20 - var(--stack-index));
		transition:
			transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
			filter 220ms ease;
		pointer-events: none;
	}

	.notification-toast {
		position: relative;
		display: flex;
		min-height: 4.75rem;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--text-strong) 11%, transparent);
		border-radius: 22px;
		background: color-mix(in srgb, var(--base-200) 88%, transparent);
		color: color-mix(in srgb, var(--text-strong) 88%, var(--base-100));
		box-shadow:
			3px 4px 0 color-mix(in srgb, var(--accent) 24%, transparent),
			0 18px 42px var(--shadow-outer-color),
			inset 0 1px 0 color-mix(in srgb, var(--text-strong) 6%, transparent);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		pointer-events: auto;
		animation: notification-toast-arrive 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.notification-toast-main {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 0.875rem;
		min-width: 0;
		padding: 0.875rem 2.75rem 0.875rem 1rem;
		text-align: left;
		transition:
			color 160ms ease,
			background-color 160ms ease;
	}

	.notification-toast-main:hover,
	.notification-toast-main:focus-visible {
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		color: var(--text-strong);
		outline: none;
	}

	.notification-toast-main:focus-visible {
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--primary) 55%, transparent);
	}

	.notification-toast-mark {
		width: 18px;
		height: 8px;
		flex: 0 0 18px;
		border-radius: 999px;
		border: 1px solid var(--accent);
		background: var(--accent);
		box-shadow: 3px 3px 0 color-mix(in srgb, var(--primary) 45%, transparent);
	}

	.notification-toast-title,
	.notification-toast-message {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.notification-toast-title {
		font-size: 0.9375rem;
		font-weight: 700;
		line-height: 1.3;
	}

	.notification-toast-message {
		margin-top: 0.2rem;
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.35;
	}

	.notification-toast-close {
		position: absolute;
		top: 0.45rem;
		right: 0.45rem;
		display: grid;
		width: 1.75rem;
		height: 1.75rem;
		place-items: center;
		border-radius: 0.5rem;
		color: var(--text-muted);
		font-size: 1.25rem;
		font-weight: 500;
		line-height: 1;
		transition:
			color 160ms ease,
			background-color 160ms ease;
	}

	.notification-toast-close:hover,
	.notification-toast-close:focus-visible {
		background: color-mix(in srgb, var(--text-strong) 10%, transparent);
		color: var(--text-strong);
		outline: none;
	}

	@keyframes notification-toast-arrive {
		from {
			clip-path: inset(0 0 0 22% round 22px);
			opacity: 0;
			transform: translateX(1.25rem);
			filter: blur(4px);
		}
		to {
			clip-path: inset(0 round 22px);
			opacity: 1;
			transform: translateX(0);
			filter: blur(0);
		}
	}

	@media (min-width: 1024px) {
		.notification-toast-stack {
			display: grid;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.notification-toast-layer {
			transition: none;
		}

		.notification-toast {
			animation: none;
		}
	}
</style>
