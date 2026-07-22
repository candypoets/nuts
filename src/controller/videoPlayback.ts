type VideoEntry = {
	intersectionRatio: number;
	isIntersecting: boolean;
	shouldAutoplay: () => boolean;
	resumeOnEnter: boolean;
	startedAutomatically: boolean;
};

const videos = new Map<HTMLVideoElement, VideoEntry>();
let activeVideo: HTMLVideoElement | null = null;

function pause(video: HTMLVideoElement, resumeOnEnter = false) {
	if (!video.paused && resumeOnEnter) {
		videos.get(video)!.resumeOnEnter = true;
	}
	video.pause();
	if (activeVideo === video) activeVideo = null;
}

function play(video: HTMLVideoElement, automatically = false) {
	for (const other of videos.keys()) {
		if (other !== video) pause(other);
	}

	activeVideo = video;
	const entry = videos.get(video)!;
	entry.resumeOnEnter = false;
	entry.startedAutomatically = automatically;
	void video.play().catch(() => {
		if (activeVideo === video) activeVideo = null;
	});
}

function updatePlayback() {
	if (document.hidden) {
		for (const video of videos.keys()) pause(video, true);
		return;
	}

	for (const [video, entry] of videos) {
		if (!entry.isIntersecting) pause(video, true);
		else if (entry.startedAutomatically && !entry.shouldAutoplay()) pause(video);
	}

	const candidates = [...videos.entries()]
		.filter(
			([, entry]) =>
				entry.isIntersecting &&
				(entry.shouldAutoplay() || (entry.resumeOnEnter && !entry.startedAutomatically))
		)
		.sort((a, b) => b[1].intersectionRatio - a[1].intersectionRatio);

	const nextVideo = candidates[0]?.[0];
	if (nextVideo && nextVideo !== activeVideo) {
		const entry = videos.get(nextVideo)!;
		play(nextVideo, entry.startedAutomatically || !entry.resumeOnEnter);
	}
}

const observer =
	typeof IntersectionObserver === 'undefined'
		? null
		: new IntersectionObserver(
				(entries) => {
					for (const intersection of entries) {
						const entry = videos.get(intersection.target as HTMLVideoElement);
						if (!entry) continue;
						entry.isIntersecting = intersection.isIntersecting;
						entry.intersectionRatio = intersection.intersectionRatio;
					}
					updatePlayback();
				},
				{ threshold: [0, 0.25, 0.5, 0.75, 1] }
			);

function onVisibilityChange() {
	updatePlayback();
}

if (typeof document !== 'undefined') {
	document.addEventListener('visibilitychange', onVisibilityChange);
}

export function registerVideo(video: HTMLVideoElement, shouldAutoplay: () => boolean) {
	const entry: VideoEntry = {
		intersectionRatio: 0,
		isIntersecting: false,
		shouldAutoplay,
		resumeOnEnter: false,
		startedAutomatically: false
	};
	videos.set(video, entry);

	const onPlay = () => {
		if (activeVideo !== video) play(video);
	};
	video.addEventListener('play', onPlay);
	observer?.observe(video);

	return {
		refresh: updatePlayback,
		unregister: () => {
			observer?.unobserve(video);
			video.removeEventListener('play', onPlay);
			videos.delete(video);
			if (activeVideo === video) activeVideo = null;
			updatePlayback();
		}
	};
}
