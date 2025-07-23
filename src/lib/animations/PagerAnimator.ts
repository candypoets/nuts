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
	private options: AnimationOptions = { duration: 0.3 };

	constructor(
		viewport: { vw: number; vh: number },
		goBackRouter: () => void,
		options?: AnimationOptions
	) {
		this.viewport = viewport;
		this.goBackRouter = goBackRouter;
		if (options) {
			this.options = options;
		}
	}

	/**
	 * Set the main content element after instantiation
	 */
	setMainContent(element: HTMLElement) {
		this.main = element;
	}

	/**
	 * Update viewport dimensions
	 */
	updateViewport(viewport: { vw: number; vh: number }) {
		this.viewport = viewport;
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

	animateIn(element: HTMLElement) {
		// Get the element's data-kind attribute to determine animation type
		const kind = element.getAttribute('data-kind') || 'default';

		// Check if we have custom animations defined for this kind
		const inAnimations = this.options.in?.[kind];

		if (inAnimations) {
			// Apply custom animation from options
			animate(element, inAnimations, {
				duration: this.options.duration,
				easing: 'ease-out'
			});
		} else {
			// Default animation - fade in
			animate(
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

	animateOut(element: HTMLElement) {
		// Get the element's data-kind attribute to determine animation type
		const kind = element.getAttribute('data-kind') || 'default';

		// Check if we have custom animations defined for this kind
		const outAnimations = this.options.out?.[kind];

		if (outAnimations) {
			// Apply custom animation from options
			animate(element, outAnimations, {
				duration: this.options.duration,
				easing: 'ease-in'
			}).then(this.goBackRouter);
		} else {
			// Default animation - fade out
			animate(
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
		this.stack.push(element);

		this.updateMainContent();
		this.updateAllSubElements(0, 0, 'in');
	}

	/**
	 * Unregister a sub element with Motion One out animation
	 */
	unregisterElement(element: HTMLElement) {
		// Remove from stack
		const lastElement = this.stack.pop();

		this.animateOut(lastElement);

		this.updateAllSubElements(0, 0);
		this.updateMainContent();
	}

	/**
	 * Unregister all elements from the stack
	 */
	unregisterAll() {
		// Loop through in reverse order and unregister each element
		for (let i = this.stack.length - 1; i >= 0; i--) {
			this.unregisterElement(this.stack[i]);
		}
	}

	/**
	 * Get current navigation depth (number of sub elements)
	 */
	subDepth(): number {
		return this.stack.filter((item) => item.getAttribute('data-kind') === 'sub').length;
	}

	modalDepth(): number {
		return this.stack.filter((item) => item.getAttribute('data-kind') === 'modal').length;
	}

	/**
	 * Update main content based on registered modal elements
	 */
	private updateMainContent(deltaX: number = 0, deltaY: number = 0) {
		if (!this.main) return;

		const subDepth = this.subDepth();
		const modalDepth = this.modalDepth();

		// Calculate transforms similar to current reactive statements
		const subTweened = subDepth > 0 ? 1 : 0;
		const modalTweened = modalDepth > 0 ? 1 : 0;

		const swipeProgressX = deltaX > 0 ? this.getSwipeProgress(deltaX, 0) : 0;
		const swipeProgressY = deltaY > 0 ? this.getSwipeProgress(0, deltaY) : 0;

		// this.addDebugToElement(
		// 	`updateMainContent called: deltaX=${deltaX}, deltaY=${deltaY}, viewport=${this.viewport.vw} subTweened=${subTweened}, swipeProgressX=${swipeProgressX}, swipeProgressY=${swipeProgressY}`
		// );

		const translateX = -(subTweened - swipeProgressX) * (this.viewport.vw * 20 + subDepth * 30);
		const translateY = (modalDepth - swipeProgressY) * 30;
		const scale = (200 - (modalDepth - swipeProgressY) * 30) / 200;
		const rotateY = (subTweened - swipeProgressX) * -20;

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
				duration: deltaX !== 0 || deltaY !== 0 ? 0 : this.options.duration,
				easing: 'ease-out'
			}
		);
	}

	/**
	 * Update all sub elements based on current registration
	 */
	private updateAllSubElements(deltaX: number = 0, deltaY: number = 0, animate?: 'in' | 'out') {
		let subDepth = 0;
		let modalDepth = 0;
		for (let i = this.stack.length - 1; i >= 0; i--) {
			const element = this.stack[i];
			const effectiveSubDepth = subDepth - this.getSwipeProgress(deltaX, deltaY);
			const effectiveModalDepth = modalDepth - this.getSwipeProgress(deltaX, deltaY);
			if (animate && !subDepth && !modalDepth) {
				animate == 'in' ? this.animateIn(element) : this.animateOut(element);
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
		const scale =
			Math.max(0.85, 1 - effectiveSubDepth * 0.05) * Math.max(0.85, 1 - effectiveModalDepth * 0.05);
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
				duration: deltaX !== 0 || deltaY !== 0 ? 0 : this.options.duration,
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

		// Update all sub elements with the deltaX and deltaY
		this.updateAllSubElements(Math.max(0, deltaX), Math.max(0, deltaY));

		// Also update main content with deltaX and deltaY influence
		this.updateMainContent(Math.max(0, deltaX), Math.max(0, deltaY));
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
		// Reset all elements to their original positions (deltaX = 0, deltaY = 0)
		this.updateAllSubElements(0, 0);
		this.updateMainContent(0, 0);
	}

	/**
	 * Cleanup method
	 */
	destroy() {
		// Motion One automatically handles cleanup, but we can clear our arrays
		this.stack = [];
	}
}
