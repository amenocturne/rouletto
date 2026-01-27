/**
 * Crossfade loop audio player for seamless infinite background music.
 * Uses Web Audio API with two overlapping sources to create smooth transitions.
 */

export interface CrossfadeLoopPlayer {
	play: () => void;
	stop: () => void;
	setVolume: (volume: number) => void;
	isPlaying: () => boolean;
}

/**
 * Creates a crossfade loop player that seamlessly loops audio with overlap.
 *
 * @param audioUrl - URL to the audio file
 * @param loopPoint - Time in seconds where the loop should restart (with crossfade)
 * @param fadeTime - Duration of the crossfade in seconds (default 2)
 */
export const createCrossfadeLoop = async (
	audioUrl: string,
	loopPoint: number,
	fadeTime = 2,
): Promise<CrossfadeLoopPlayer> => {
	const ctx = new AudioContext();

	// Master gain node for volume control - doesn't interfere with fade automation
	const masterGain = ctx.createGain();
	masterGain.connect(ctx.destination);

	let buffer: AudioBuffer | null = null;
	let playing = false;
	let scheduledSources: AudioBufferSourceNode[] = [];
	let nextScheduleTimeout: ReturnType<typeof setTimeout> | null = null;

	// Load audio buffer
	const response = await fetch(audioUrl);
	const arrayBuffer = await response.arrayBuffer();
	buffer = await ctx.decodeAudioData(arrayBuffer);

	const scheduleSource = (startTime: number): void => {
		if (!buffer || !playing) return;

		const source = ctx.createBufferSource();
		const fadeGain = ctx.createGain();

		source.buffer = buffer;
		source.connect(fadeGain);
		fadeGain.connect(masterGain); // Connect to master, not destination

		// Fade in
		fadeGain.gain.setValueAtTime(0, startTime);
		fadeGain.gain.linearRampToValueAtTime(1, startTime + fadeTime);

		// Sustain at full volume
		const fadeOutStart = startTime + loopPoint - fadeTime;
		fadeGain.gain.setValueAtTime(1, fadeOutStart);

		// Fade out
		fadeGain.gain.linearRampToValueAtTime(0, fadeOutStart + fadeTime);

		source.start(startTime);
		source.stop(startTime + loopPoint);

		// Track for cleanup
		scheduledSources.push(source);

		source.onended = () => {
			scheduledSources = scheduledSources.filter((s) => s !== source);
		};

		// Schedule next source to start at fade-out point (overlap during crossfade)
		const nextStart = fadeOutStart;
		const delayMs = (nextStart - ctx.currentTime) * 1000;

		if (delayMs > 0 && playing) {
			nextScheduleTimeout = setTimeout(() => {
				if (playing) {
					scheduleSource(nextStart);
				}
			}, Math.max(0, delayMs - 100)); // Schedule slightly early to avoid gaps
		}
	};

	const play = (): void => {
		if (playing || !buffer) return;

		// Resume context if suspended (browser autoplay policy)
		if (ctx.state === "suspended") {
			ctx.resume();
		}

		playing = true;
		scheduleSource(ctx.currentTime);
	};

	const stop = (): void => {
		playing = false;

		if (nextScheduleTimeout) {
			clearTimeout(nextScheduleTimeout);
			nextScheduleTimeout = null;
		}

		// Stop all currently playing sources
		for (const source of scheduledSources) {
			try {
				source.stop();
			} catch {
				// Already stopped
			}
		}
		scheduledSources = [];
	};

	const setVolume = (volume: number): void => {
		const clampedVolume = Math.max(0, Math.min(1, volume));
		masterGain.gain.setValueAtTime(clampedVolume, ctx.currentTime);
	};

	const isPlaying = (): boolean => playing;

	return {
		play,
		stop,
		setVolume,
		isPlaying,
	};
};
