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
	private elementKinds = new WeakMap<HTMLElement, string>();
	private elementStates = new WeakMap<
		HTMLElement,
		{ x: number; y: number; scale: number; opacity: number; rotateY?: number }
	>();
	private elementSizes = new WeakMap<HTMLElement, { width: number; height: number }>();
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
	private pendingDeltaX = 0;
	private pendingDeltaY = 0;
	private readonly depthBuffer: { subDepth: number; modalDepth: number } = {
		subDepth: 0,
		modalDepth: 0
	};

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
		this.main.style.contain = 'paint';
		this.setElementState(this.main, 0, 0, 1, 1);
		this.captureElementSize(this.main);
		// Ensure visibility applied if mode was decided before main arrived
		this.applyCombinedVisibility();
	}

	/**
	 * Update viewport dimensions
	 */
	updateViewport(viewport: { vw: number; vh: number }) {
		this.viewport = viewport;
		if (this.main) this.captureElementSize(this.main);
		for (const element of this.stack) {
			this.captureElementSize(element);
		}
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

	private getElementKind(element: HTMLElement): string {
		const cached = this.elementKinds.get(element);
		if (cached) return cached;
		const kind = element.getAttribute('data-kind') || 'default';
		this.elementKinds.set(element, kind);
		return kind;
	}

	animateIn(element: HTMLElement): Promise<void> {
		// Make sure it's visible when animating in
		element.style.display = '';

		// Get the element's data-kind attribute to determine animation type
		const kind = this.getElementKind(element);

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

	private setElementState(
		element: HTMLElement,
		x: number,
		y: number,
		scale: number,
		opacity: number,
		rotateY?: number
	) {
		this.elementStates.set(element, { x, y, scale, opacity, rotateY });
	}

	private getElementState(element: HTMLElement): {
		x: number;
		y: number;
		scale: number;
		opacity: number;
		rotateY?: number;
	} {
		return this.elementStates.get(element) ?? { x: 0, y: 0, scale: 1, opacity: 1, rotateY: 0 };
	}

	private captureElementSize(element: HTMLElement) {
		const rect = element.getBoundingClientRect();
		this.elementSizes.set(element, {
			width: rect.width || this.viewport.vw * 100,
			height: rect.height || this.viewport.vh * 100
		});
	}

	private getElementSize(element: HTMLElement): { width: number; height: number } {
		return (
			this.elementSizes.get(element) ?? {
				width: this.viewport.vw * 100,
				height: this.viewport.vh * 100
			}
		);
	}

	private resolveAxisEndValue(value: unknown, axis: 'x' | 'y', element: HTMLElement): unknown {
		if (typeof value !== 'string') return value;
		const trimmed = value.trim();

		// Convert percentages to px using cached element size to avoid hot-path layout reads
		const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);
		if (percentMatch) {
			const percent = parseFloat(percentMatch[1]) / 100;
			const size = this.getElementSize(element);
			return (axis === 'x' ? size.width : size.height) * percent;
		}

		const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/);
		if (pxMatch) return parseFloat(pxMatch[1]);

		return value;
	}

	private withCurrentStartValues(
		element: HTMLElement,
		animations: Record<string, unknown>
	): Record<string, unknown> {
		const current = this.getElementState(element);
		const next = { ...animations } as Record<string, unknown>;

		const getEndValue = (value: unknown) =>
			Array.isArray(value) ? value[value.length - 1] : value;

		if (next.x !== undefined) {
			const end = this.resolveAxisEndValue(getEndValue(next.x), 'x', element);
			next.x = [current.x, end];
		}
		if (next.y !== undefined) {
			const end = this.resolveAxisEndValue(getEndValue(next.y), 'y', element);
			next.y = [current.y, end];
		}
		if (next.scale !== undefined) {
			const rawEnd = getEndValue(next.scale);
			const end = typeof rawEnd === 'string' ? parseFloat(rawEnd) : rawEnd;
			next.scale = [current.scale, end];
		}
		if (next.opacity !== undefined) {
			const rawEnd = getEndValue(next.opacity);
			const end = typeof rawEnd === 'string' ? parseFloat(rawEnd) : rawEnd;
			next.opacity = [current.opacity, end];
		}
		if (next.rotateY !== undefined) {
			const rawEnd = getEndValue(next.rotateY);
			const end = typeof rawEnd === 'string' ? parseFloat(rawEnd) : rawEnd;
			next.rotateY = [current.rotateY ?? 0, end];
		}

		return next;
	}

	animateOut(element: HTMLElement, fromCurrentPosition: boolean = false): Promise<void> {
		// Get the element's data-kind attribute to determine animation type
		const kind = this.getElementKind(element);

		// Check if we have custom animations defined for this kind
		const outAnimations = this.options.out?.[kind] as Record<string, unknown> | undefined;

		if (outAnimations) {
			const animationValues = fromCurrentPosition
				? this.withCurrentStartValues(element, outAnimations)
				: outAnimations;
			// Apply custom animation from options
			return animate(element, animationValues, {
				duration: this.options.duration,
				easing: 'ease-in'
			}).then(this.goBackRouter);
		} else {
			const currentOpacity = fromCurrentPosition ? this.getElementState(element).opacity : 1;
			// Default animation - fade out
			return animate(
				element,
				{
					opacity: [currentOpacity, 0]
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
		element.style.contain = 'paint';
		this.elementKinds.set(element, element.getAttribute('data-kind') || 'default');
		this.setElementState(element, 0, 0, 1, 1);
		this.captureElementSize(element);

		this.stack.push(element);

		// Apply visibility rules first
		this.applyCombinedVisibility();

		const depths = this.updateAllSubElements(0, 0, 'in');
		this.updateMainContent(0, 0, false, depths);
	}

	/**
	 * Unregister a sub element with Motion One out animation
	 */
	unregisterElement(element: HTMLElement, fromCurrentPosition: boolean = false) {
		// Remove from stack
		const lastElement = this.stack.pop();

		// Animate out the element that was on top (lastElement)
		if (lastElement) {
			this.animateOut(lastElement, fromCurrentPosition);
		}

		// Re-apply visibility to keep at most two visible (considering main)
		this.applyCombinedVisibility();

		const depths = this.updateAllSubElements(0, 0);
		this.updateMainContent(0, 0, false, depths);
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
			const kind = this.getElementKind(element);
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
		const depths = this.updateAllSubElements(0, 0);
		this.updateMainContent(0, 0, false, depths);
	}

	/**
	 * Get current navigation depth (number of sub elements)
	 * - On mobile, counts only visible stack items
	 */
	subDepth(): number {
		return this.countVisibleDepths().subDepth;
	}

	/**
	 * Modal depth; see subDepth for mobile visibility handling
	 */
	modalDepth(): number {
		return this.countVisibleDepths().modalDepth;
	}

	private countVisibleDepths(): { subDepth: number; modalDepth: number } {
		let subDepth = 0;
		let modalDepth = 0;
		for (let i = this.stack.length - 1; i >= 0; i--) {
			if (this.isMobileMode && !this.visibleStackIndices.has(i)) continue;
			const element = this.stack[i];
			if (!element) continue;
			this.getElementKind(element) === 'sub' ? subDepth++ : modalDepth++;
		}
		return { subDepth, modalDepth };
	}

	/**
	 * Update main content based on registered modal elements
	 */
	private updateMainContent(
		deltaX: number = 0,
		deltaY: number = 0,
		immediate: boolean = false,
		depths?: { subDepth: number; modalDepth: number }
	) {
		if (!this.main) return;

		// Skip animating main if hidden on mobile
		if (this.isMobileMode && !this.showMain) return;

		const { subDepth, modalDepth } = depths ?? this.countVisibleDepths();

		// Calculate transforms similar to current reactive statements
		const subTweened = subDepth > 0 ? 1 : 0;

		const swipeProgressX = deltaX > 0 ? this.getSwipeProgress(deltaX, 0) : 0;
		const swipeProgressY = deltaY > 0 ? this.getSwipeProgress(0, deltaY) : 0;

		const translateX = -(subTweened - swipeProgressX) * (this.viewport.vw * 20 + subDepth * 30);
		const translateY = (modalDepth - swipeProgressY) * 30;
		// Disable scale and rotateY on mobile - keep main content flat and full size
		const scale = this.isMobileMode ? 1 : (200 - (modalDepth - swipeProgressY) * 30) / 200;
		const rotateY = this.isMobileMode ? 0 : (subTweened - swipeProgressX) * -20;
		if (immediate) {
			this.setElementState(this.main, translateX, translateY, scale, 1, rotateY);
			this.main.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale}) rotateY(${rotateY}deg)`;
			return;
		}

		// Animate main element with Motion One using individual transform properties
		// Start from current state to ensure smooth continuity after swipe
		const current = this.getElementState(this.main);
		animate(
			this.main,
			{
				x: [current.x, translateX],
				y: [current.y, translateY],
				scale: [current.scale, scale],
				rotateY: [current.rotateY ?? 0, rotateY]
			},
			{
				// Shorter duration on mobile for snappier feel
				duration: this.isMobileMode ? 0.2 : this.options.duration,
				easing: 'ease-out'
			}
		);
		this.setElementState(this.main, translateX, translateY, scale, 1, rotateY);
	}

	/**
	 * Update all sub elements based on current registration
	 */
	private updateAllSubElements(
		deltaX: number = 0,
		deltaY: number = 0,
		animateKind?: 'in' | 'out',
		immediate: boolean = false
	): { subDepth: number; modalDepth: number } {
		if (!immediate) {
			// Ensure visibility is applied before regular animations
			this.applyCombinedVisibility();
		}

		this.depthBuffer.subDepth = 0;
		this.depthBuffer.modalDepth = 0;
		const swipeProgress = this.getSwipeProgress(deltaX, deltaY);
		for (let i = this.stack.length - 1; i >= 0; i--) {
			const element = this.stack[i];
			if (!element) continue;

			// On mobile: skip non-visible elements to save work
			if (this.isMobileMode && !this.visibleStackIndices.has(i)) {
				if (!immediate) element.style.display = 'none';
				continue;
			} else if (!immediate) {
				element.style.display = '';
			}

			const effectiveSubDepth = this.depthBuffer.subDepth - swipeProgress;
			const effectiveModalDepth = this.depthBuffer.modalDepth - swipeProgress;

			if (animateKind && this.depthBuffer.subDepth === 0 && this.depthBuffer.modalDepth === 0) {
				animateKind == 'in' ? this.animateIn(element) : this.animateOut(element);
			} else {
				this.updateSubElement(
					element,
					this.depthBuffer.subDepth == 0 ? this.depthBuffer.subDepth : effectiveSubDepth,
					this.depthBuffer.modalDepth == 0 ? this.depthBuffer.modalDepth : effectiveModalDepth,
					deltaX,
					deltaY,
					immediate
				);
			}
			this.getElementKind(element) === 'sub'
				? this.depthBuffer.subDepth++
				: this.depthBuffer.modalDepth++;
		}
		return this.depthBuffer;
	}

	/**
	 * Update a specific sub element with effective depth
	 */
	private updateSubElement(
		element: HTMLElement,
		effectiveSubDepth: number,
		effectiveModalDepth: number,
		deltaX: number = 0,
		deltaY: number = 0,
		immediate: boolean = false
	) {
		const isModal = this.getElementKind(element) === 'modal';

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
		if (immediate) {
			// Update state so future animations know where we are
			this.setElementState(element, translateX, translateY, scale, opacity);
			element.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
			element.style.opacity = `${opacity}`;
			return;
		}

		// Motion One animation - start from current state to target
		const current = this.getElementState(element);
		animate(
			element,
			{
				x: [current.x, translateX],
				y: [current.y, translateY],
				scale: [current.scale, scale],
				opacity: [current.opacity, opacity]
			},
			{
				// Shorter duration on mobile for snappier feel
				duration: this.isMobileMode ? 0.2 : this.options.duration,
				easing: 'ease-out'
			}
		);
		this.setElementState(element, translateX, translateY, scale, opacity);
	}

	private flushPendingSwipePosition() {
		if (this.stack.length === 0) return;
		const depths = this.updateAllSubElements(
			this.pendingDeltaX,
			this.pendingDeltaY,
			undefined,
			true
		);
		this.updateMainContent(this.pendingDeltaX, this.pendingDeltaY, true, depths);
	}

	private readonly runSwipeFrame = () => {
		// Update all sub elements with latest pending deltas
		const depths = this.updateAllSubElements(
			this.pendingDeltaX,
			this.pendingDeltaY,
			undefined,
			true
		);

		// Also update main content with delta influence
		this.updateMainContent(this.pendingDeltaX, this.pendingDeltaY, true, depths);

		this.rafId = null;
	}

	/**
	 * Real-time touch tracking for swipe-to-dismiss using direct style updates
	 */
	trackSwipeDismiss(deltaX: number, deltaY: number = 0) {
		if (this.stack.length === 0) {
			this.pendingDeltaX = 0;
			this.pendingDeltaY = 0;
			return;
		}

		this.pendingDeltaX = Math.max(0, deltaX);
		this.pendingDeltaY = Math.max(0, deltaY);

		if (this.rafId !== null) {
			return;
		}

		this.rafId = requestAnimationFrame(this.runSwipeFrame);
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

		// Ensure the final pointer position is applied before out animation starts
		this.flushPendingSwipePosition();

		// Get the last element from the stack (top element)
		const topElement = this.stack[this.stack.length - 1];

		if (!topElement) {
			this.pendingDeltaX = 0;
			this.pendingDeltaY = 0;
			return;
		}
		this.unregisterElement(topElement, true);
		this.pendingDeltaX = 0;
		this.pendingDeltaY = 0;
	}

	/**
	 * Handle swipe dismiss cancellation - animate back to original positions
	 */
	async cancelSwipeDismiss(): Promise<void> {
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		// Ensure we start cancel animation from the last pointer position
		this.flushPendingSwipePosition();
		this.pendingDeltaX = 0;
		this.pendingDeltaY = 0;

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
		this.pendingDeltaX = 0;
		this.pendingDeltaY = 0;
		// Show everything again in case caller reuses elements
		this.showAll();
		// Motion One automatically handles cleanup, but we can clear our arrays
		this.stack = [];
		this.elementKinds = new WeakMap<HTMLElement, string>();
		this.elementStates = new WeakMap<
			HTMLElement,
			{ x: number; y: number; scale: number; opacity: number }
		>();
		this.elementSizes = new WeakMap<HTMLElement, { width: number; height: number }>();
		this.depthBuffer.subDepth = 0;
		this.depthBuffer.modalDepth = 0;
	}
}
