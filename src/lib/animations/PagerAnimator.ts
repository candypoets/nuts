import { animate } from 'motion';

interface AnimationOptions {
	duration: number;
	in?: {
		[kind: string]: {
			opacity?: number | number[];
			x?: number | number[];
			y?: number | number[];
			scale?: number | number[];
			rotateY?: number | number[];
		};
	};
	out?: {
		[kind: string]: {
			opacity?: number | number[];
			x?: number | number[];
			y?: number | number[];
			scale?: number | number[];
			rotateY?: number | number[];
		};
	};
}

export class PagerAnimator {
	private main: HTMLElement | null = null;
	private stack: HTMLElement[] = [];
	// private modalElementStack: HTMLElement[] = [];

	// Current state values
	private viewport: { vw: number; vh: number } = { vw: 0, vh: 0 };
	private goBackRouter: () => void;
	private goToRootRouter?: () => void;
	private options: AnimationOptions = { duration: 0.3 };

	// Mobile mode and visibility tracking
	private isMobileMode = false;
	private visibleStackIndices: Set<number> = new Set(); // indices into this.stack
	private showMain = true; // whether main is visible

	private rafId: number | null = null;

	constructor(
		viewport: { vw: number; vh: number },
		goBackRouter: () => void,
		goToRootRouter?: () => void,
		options?: AnimationOptions
	) {
		this.viewport = viewport;
		this.goBackRouter = goBackRouter;
		this.goToRootRouter = goToRootRouter;
		if (options) {
			this.options = options;
		}
		// Auto-detect mobile by default; you can override with setMobileMode()
		this.isMobileMode = this.detectMobile();
	}

	// Allow explicit override. If not provided, re-detect.
	public setMobileMode(isMobile?: boolean) {
		this.isMobileMode = isMobile ?? this.detectMobile();
		this.applyCombinedVisibility();
	}

	private detectMobile(): boolean {
		if (typeof window === 'undefined') return false;
		try {
			if (window.matchMedia('(pointer: coarse)').matches) return true;
			if (window.matchMedia('(max-width: 768px)').matches) return true;
		} catch {
			// ignore
		}
		const ua = navigator.userAgent || '';
		return /Mobi|Android|iPhone|iPad|iPod|Phone/i.test(ua);
	}

	/**
	 * Compute which elements should be visible considering the combined order [main, ...stack]
	 */
	private computeCombinedVisibility(): { showMain: boolean; visibleStack: Set<number> } {
		const total = 1 + this.stack.length; // 1 = main
		if (!this.isMobileMode) {
			return {
				showMain: true,
				visibleStack: new Set(this.stack.map((_, i) => i))
			};
		}
		// Show only the last 2 in the combined sequence [main, stack[0], ..., stack[n-1]]
		const start = Math.max(0, total - 2);
		const showMain = start === 0;
		const visibleStack = new Set<number>();
		for (let combinedIdx = start; combinedIdx < total; combinedIdx++) {
			if (combinedIdx === 0) continue; // main handled separately
			const stackIdx = combinedIdx - 1;
			if (stackIdx >= 0) visibleStack.add(stackIdx);
		}
		return { showMain, visibleStack };
	}

	/**
	 * Apply visibility (display) to main and stack according to mobile rule
	 */
	private applyCombinedVisibility() {
		const { showMain, visibleStack } = this.computeCombinedVisibility();
		this.showMain = showMain;
		this.visibleStackIndices = visibleStack;

		// Main
		if (this.main) {
			this.main.style.display = this.showMain ? '' : 'none';
		}

		// Stack
		this.stack.forEach((el, idx) => {
			if (this.visibleStackIndices.has(idx)) {
				if (el.style.display === 'none') el.style.display = '';
			} else {
				el.style.display = 'none';
			}
		});
	}

	private showAll() {
		if (this.main) this.main.style.display = '';
		this.stack.forEach((el) => {
			el.style.display = '';
		});
		this.showMain = true;
		this.visibleStackIndices = new Set(this.stack.map((_, i) => i));
	}

	/**
	 * Set the main content element after instantiation
	 */
	setMainContent(element: HTMLElement) {
		this.main = element;
		// GPU acceleration hints
		this.main.style.willChange = 'transform, opacity';
		this.main.style.backfaceVisibility = 'hidden';
		// Ensure visibility applied if mode was decided before main arrived
		this.applyCombinedVisibility();
	}

	/**
	 * Update viewport dimensions
	 */
	updateViewport(viewport: { vw: number; vh: number }) {
		this.viewport = viewport;
		// Optionally re-evaluate on viewport change if you prefer dynamic switching:
		// this.setMobileMode();
	}

	goBack = () => {
		if (this.stack.length > 0) {
			const lastElement = this.stack[this.stack.length - 1];
			if (lastElement) {
				this.unregisterElement(lastElement);
			}
		}
	};

	/**
	 * Calculate slide progress based on horizontal or vertical delta
	 */
	getSwipeProgress(deltaX: number, deltaY: number = 0) {
		if (deltaX > 0) {
			return Math.max(0, Math.min(1, deltaX / (this.viewport.vw * 100)));
		} else if (deltaY > 0) {
			return Math.max(0, Math.min(1, deltaY / (this.viewport.vh * 50)));
		}
		return 0;
	}

	animateIn(element: HTMLElement): Promise<void> {
		// Make sure it's visible when animating in
		element.style.display = '';

		// Get the element's data-kind attribute to determine animation type
		const kind = element.getAttribute('data-kind') || 'default';

		// Check if we have custom animations defined for this kind
		const inAnimations = this.options.in?.[kind];

		if (inAnimations) {
			// Apply custom animation from options
			return animate(element, inAnimations, {
				duration: this.options.duration,
				easing: 'ease-out'
			});
		} else {
			// Default animation - fade in
			return animate(
				element,
				{
					opacity: [0, 1]
				},
				{
					duration: this.options.duration,
					easing: 'ease-out'
				}
			);
		}
	}

	animateOut(element: HTMLElement): Promise<void> {
		// Get the element's data-kind attribute to determine animation type
		const kind = element.getAttribute('data-kind') || 'default';

		// Check if we have custom animations defined for this kind
		const outAnimations = this.options.out?.[kind];

		if (outAnimations) {
			// Apply custom animation from options
			return animate(element, outAnimations, {
				duration: this.options.duration,
				easing: 'ease-in'
			}).then(this.goBackRouter);
		} else {
			// Default animation - fade out
			return animate(
				element,
				{
					opacity: [1, 0]
				},
				{
					duration: this.options.duration,
					easing: 'ease-in'
				}
			).then(this.goBackRouter);
		}
	}

	/**
	 * Register a sub element
	 */
	registerElement(element: HTMLElement) {
		// GPU acceleration hints
		element.style.willChange = 'transform, opacity';
		element.style.backfaceVisibility = 'hidden';

		this.stack.push(element);

		// Apply visibility rules first
		this.applyCombinedVisibility();

		this.updateMainContent();
		this.updateAllSubElements(0, 0, 'in');
	}

	/**
	 * Unregister a sub element with Motion One out animation
	 */
	unregisterElement(element: HTMLElement) {
		// Remove from stack
		const lastElement = this.stack.pop();

		// Animate out the element that was on top (lastElement)
		if (lastElement) {
			this.animateOut(lastElement);
		}

		// Re-apply visibility to keep at most two visible (considering main)
		this.applyCombinedVisibility();

		this.updateAllSubElements(0, 0);
		this.updateMainContent();
	}

	/**
	 * Unregister all elements from the stack
	 */
	unregisterAll() {
		// Snapshot all elements to animate out
		const elementsToRemove = [...this.stack];
		// Clear the stack immediately
		this.stack = [];

		// Animate all elements out simultaneously (without calling goBackRouter for each)
		// Get the element's data-kind attribute to determine animation type
		for (const element of elementsToRemove) {
			const kind = element.getAttribute('data-kind') || 'default';
			const outAnimations = this.options.out?.[kind];

			if (outAnimations) {
				animate(element, outAnimations, {
					duration: this.options.duration,
					easing: 'ease-in'
				});
			} else {
				animate(
					element,
					{
						opacity: [1, 0]
					},
					{
						duration: this.options.duration,
						easing: 'ease-in'
					}
				);
			}
		}

		// Navigate to root once after starting all animations
		if (this.goToRootRouter) {
			this.goToRootRouter();
		} else {
			// Fallback: call goBackRouter for each element (old behavior)
			for (let i = 0; i < elementsToRemove.length; i++) {
				this.goBackRouter();
			}
		}

		// Update visibility and positions once after clearing
		this.applyCombinedVisibility();
		this.updateAllSubElements(0, 0);
		this.updateMainContent();
	}

	/**
	 * Get current navigation depth (number of sub elements)
	 * - On mobile, counts only visible stack items
	 */
	subDepth(): number {
		return this.stack.filter(
			(item, idx) =>
				(!this.isMobileMode || this.visibleStackIndices.has(idx)) &&
				item.getAttribute('data-kind') === 'sub'
		).length;
	}

	/**
	 * Modal depth; see subDepth for mobile visibility handling
	 */
	modalDepth(): number {
		return this.stack.filter(
			(item, idx) =>
				(!this.isMobileMode || this.visibleStackIndices.has(idx)) &&
				item.getAttribute('data-kind') === 'modal'
		).length;
	}

	/**
	 * Update main content based on registered modal elements
	 */
	private updateMainContent(deltaX: number = 0, deltaY: number = 0) {
		if (!this.main) return;

		// Skip animating main if hidden on mobile
		if (this.isMobileMode && !this.showMain) return;

		const subDepth = this.subDepth();
		const modalDepth = this.modalDepth();

		// Calculate transforms similar to current reactive statements
		const subTweened = subDepth > 0 ? 1 : 0;
		const modalTweened = modalDepth > 0 ? 1 : 0;

		const swipeProgressX = deltaX > 0 ? this.getSwipeProgress(deltaX, 0) : 0;
		const swipeProgressY = deltaY > 0 ? this.getSwipeProgress(0, deltaY) : 0;

		const translateX = -(subTweened - swipeProgressX) * (this.viewport.vw * 20 + subDepth * 30);
		const translateY = (modalDepth - swipeProgressY) * 30;
		// Disable scale and rotateY on mobile - keep main content flat and full size
		const scale = this.isMobileMode ? 1 : (200 - (modalDepth - swipeProgressY) * 30) / 200;
		const rotateY = this.isMobileMode ? 0 : (subTweened - swipeProgressX) * -20;

		// Animate main element with Motion One using individual transform properties
		animate(
			this.main,
			{
				x: translateX,
				y: translateY,
				scale,
				rotateY
			},
			{
				// Shorter duration on mobile for snappier feel
				duration:
					deltaX !== 0 || deltaY !== 0 ? 0 : this.isMobileMode ? 0.2 : this.options.duration,
				easing: 'ease-out'
			}
		);
	}

	/**
	 * Update all sub elements based on current registration
	 */
	private updateAllSubElements(deltaX: number = 0, deltaY: number = 0, animateKind?: 'in' | 'out') {
		// Ensure visibility is applied before animating
		this.applyCombinedVisibility();

		let subDepth = 0;
		let modalDepth = 0;
		for (let i = this.stack.length - 1; i >= 0; i--) {
			const element = this.stack[i];

			// On mobile: skip non-visible elements to save work
			if (this.isMobileMode && !this.visibleStackIndices.has(i)) {
				element.style.display = 'none';
				continue;
			} else {
				element.style.display = '';
			}

			const effectiveSubDepth = subDepth - this.getSwipeProgress(deltaX, deltaY);
			const effectiveModalDepth = modalDepth - this.getSwipeProgress(deltaX, deltaY);

			if (animateKind && subDepth === 0 && modalDepth === 0) {
				animateKind == 'in' ? this.animateIn(element) : this.animateOut(element);
			} else {
				this.updateSubElement(
					element,
					subDepth == 0 ? subDepth : effectiveSubDepth,
					modalDepth == 0 ? modalDepth : effectiveModalDepth,
					deltaX,
					deltaY
				);
			}
			element.getAttribute('data-kind') === 'sub' ? subDepth++ : modalDepth++;
		}
	}

	/**
	 * Update a specific sub element with effective depth
	 */
	private updateSubElement(
		element: HTMLElement,
		effectiveSubDepth: number,
		effectiveModalDepth: number,
		deltaX: number = 0,
		deltaY: number = 0
	) {
		const isModal = element.getAttribute('data-kind') === 'modal';

		// Calculate transforms for stacked effect using effective depth
		const translateX = -effectiveSubDepth * 30 + (effectiveSubDepth == 0 ? deltaX : 0);
		const translateY =
			-effectiveModalDepth * 30 + (effectiveModalDepth == 0 && isModal ? deltaY : 0);
		// Disable scaling on mobile - keep full size for better readability
		const scale = this.isMobileMode
			? 1
			: Math.max(0.85, 1 - effectiveSubDepth * 0.05) *
				Math.max(0.85, 1 - effectiveModalDepth * 0.05);

		const opacity = Math.max(0.3, 1 - effectiveSubDepth * 0.3);
		// Motion One animation
		animate(
			element,
			{
				x: translateX,
				y: translateY,
				scale: scale,
				opacity: opacity
			},
			{
				// Shorter duration on mobile for snappier feel
				duration:
					deltaX !== 0 || deltaY !== 0 ? 0 : this.isMobileMode ? 0.2 : this.options.duration,
				easing: 'ease-out'
			}
		);
	}

	/**
	 * Real-time touch tracking for swipe-to-dismiss using Motion One
	 */
	trackSwipeDismiss(deltaX: number, deltaY: number = 0) {
		if (this.stack.length === 0) {
			return;
		}

		if (this.rafId) cancelAnimationFrame(this.rafId);

		this.rafId = requestAnimationFrame(() => {
			// Update all sub elements with the deltaX and deltaY
			this.updateAllSubElements(Math.max(0, deltaX), Math.max(0, deltaY));

			// Also update main content with deltaX and deltaY influence
			this.updateMainContent(Math.max(0, deltaX), Math.max(0, deltaY));
			this.rafId = null;
		});
	}

	/**
	 * Add debug info to elements
	 */
	private addDebugToElement(message: string) {
		// Find the first registered element to add debug info
		const firstElement = this.stack[0];
		if (firstElement) {
			let debugDiv = firstElement.querySelector('.pager-debug') as HTMLElement;
			if (!debugDiv) {
				debugDiv = document.createElement('div');
				debugDiv.className = 'pager-debug';
				debugDiv.style.cssText =
					'position: absolute; top: 100px; left: 4px; background: red; color: white; font-size: 10px; padding: 4px; z-index: 999; max-width: 200px;';
				firstElement.appendChild(debugDiv);
			}
			const logs = debugDiv.innerHTML.split('<br>').slice(-3);
			logs.push(`${new Date().toLocaleTimeString()}: ${message}`);
			debugDiv.innerHTML = logs.join('<br>');
		}
	}

	/**
	 * Handle swipe dismiss completion - animate elements to final positions
	 */
	completeSwipeDismiss() {
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		// Get the last element from the stack (top element)
		const topElement = this.stack[this.stack.length - 1];

		if (!topElement) {
			return;
		}
		this.unregisterElement(topElement);
	}

	/**
	 * Handle swipe dismiss cancellation - animate back to original positions
	 */
	async cancelSwipeDismiss(): Promise<void> {
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		// Reset all elements to their original positions (deltaX = 0, deltaY = 0)
		this.updateAllSubElements(0, 0);
		this.updateMainContent(0, 0);
	}

	/**
	 * Cleanup method
	 */
	destroy() {
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		// Show everything again in case caller reuses elements
		this.showAll();
		// Motion One automatically handles cleanup, but we can clear our arrays
		this.stack = [];
	}
}
