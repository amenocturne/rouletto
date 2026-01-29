/**
 * Audio management for the casino wheel app.
 * Handles sound effects with preloading and sequential variant rotation.
 */

import { createCrossfadeLoop, type CrossfadeLoopPlayer } from "./music";

// Base path for sounds
const SOUND_PATH = "/rouletto/sounds";

// Audio state
let audioEnabled = false;
let backgroundMusic: CrossfadeLoopPlayer | null = null;

// Volume settings (0-1)
let musicVolume = 0.2; // Default 20%
let sfxVolume = 0.2; // Default 20%

// Preloaded audio buffers
const audioBuffers: Map<string, AudioBuffer> = new Map();
let audioContext: AudioContext | null = null;

// Variant rotation indices for multi-variant sounds
const variantIndices: Map<string, number> = new Map();

// Card sound timing
let lastCardSoundTime = 0;
const CARD_SOUND_COOLDOWN_MAX = 200; // ms between sounds when few cards
const CARD_SOUND_COOLDOWN_MIN = 60; // ms between sounds when many cards

// Sound definitions with variant counts
const SOUNDS = {
	addUser: { file: "add_user.wav", variants: 1 },
	removeUser: { file: "remove_user.wav", variants: 1 },
	cardHover: { file: "card_hover", variants: 5 },
	clickBrownButton: { file: "click_brown_button.wav", variants: 1 },
	clickGoldenButton: { file: "click_golden_button.wav", variants: 1 },
	hoverBrownButton: { file: "hover_brown_button", variants: 2 },
	hoverGoldenButton: { file: "hover_over_golden_buttons.wav", variants: 1 },
	pullLever: { file: "pull_lever.wav", variants: 1 },
	vote: { file: "vote.wav", variants: 1 },
	wheelRotation: { file: "wheel_rotation.wav", variants: 1 },
	showNextHost: { file: "show_next_host.wav", variants: 1 },
} as const;

type SoundName = keyof typeof SOUNDS;

/** Get current music volume (0-1) */
export const getMusicVolume = (): number => musicVolume;

/** Get current SFX volume (0-1) */
export const getSfxVolume = (): number => sfxVolume;

/** Set music volume (0-1) */
export const setMusicVolume = (volume: number): void => {
	musicVolume = volume;
	if (backgroundMusic) backgroundMusic.setVolume(musicVolume);
	saveVolumeSettings();
};

/** Set SFX volume (0-1) */
export const setSfxVolume = (volume: number): void => {
	sfxVolume = volume;
	saveVolumeSettings();
};

/** Load volume settings from localStorage */
export const loadVolumeSettings = (): void => {
	const saved = localStorage.getItem("casinoWheelVolume");
	if (saved) {
		const settings = JSON.parse(saved);
		musicVolume = settings.music ?? 0.2;
		sfxVolume = settings.sfx ?? 0.2;
	}
};

/** Save volume settings to localStorage */
const saveVolumeSettings = (): void => {
	localStorage.setItem(
		"casinoWheelVolume",
		JSON.stringify({
			music: musicVolume,
			sfx: sfxVolume,
		}),
	);
};

/** Show toast prompting user to click to enable sounds */
const showEnableSoundsToast = (): void => {
	// Don't show if already exists
	if (document.getElementById("sounds-toast")) return;

	const toast = document.createElement("div");
	toast.id = "sounds-toast";
	toast.className = "music-toast"; // Reuse music toast styling
	toast.innerHTML = `
		<div class="music-toast-text">
			<span>🖱️</span> Click anywhere to enable sounds
		</div>
	`;

	document.body.appendChild(toast);

	// Trigger animation
	requestAnimationFrame(() => {
		toast.classList.add("show");
	});
};

/** Hide the enable sounds toast */
const hideEnableSoundsToast = (): void => {
	const toast = document.getElementById("sounds-toast");
	if (!toast) return;

	toast.classList.remove("show");
	toast.classList.add("hide");
	setTimeout(() => toast.remove(), 300);
};

/** Show toast notification when music starts */
const showMusicToast = (): void => {
	// Don't show if already exists
	if (document.getElementById("music-toast")) return;

	const toast = document.createElement("div");
	toast.id = "music-toast";
	toast.className = "music-toast";
	toast.innerHTML = `
		<div class="music-toast-text">
			<span>🎵</span> Music playing
		</div>
		<button class="music-toast-mute">Mute</button>
	`;

	document.body.appendChild(toast);

	// Trigger animation
	requestAnimationFrame(() => {
		toast.classList.add("show");
	});

	// Handle mute button
	const muteBtn = toast.querySelector(".music-toast-mute") as HTMLButtonElement;
	muteBtn.onclick = () => {
		musicVolume = 0;
		if (backgroundMusic) backgroundMusic.setVolume(0);
		saveVolumeSettings();
		// Update the settings panel slider if open
		const musicSlider = document.getElementById("music-volume") as HTMLInputElement | null;
		const musicValue = document.getElementById("music-volume-value");
		if (musicSlider) musicSlider.value = "0";
		if (musicValue) musicValue.textContent = "0%";
		// Hide toast
		hideToast();
	};

	// Auto-hide after 4 seconds
	const hideToast = (): void => {
		toast.classList.remove("show");
		toast.classList.add("hide");
		setTimeout(() => toast.remove(), 300);
	};

	setTimeout(hideToast, 4000);
};

/** Get the file path for a sound, handling variants */
const getSoundPath = (name: SoundName, variantIndex?: number): string => {
	const sound = SOUNDS[name];
	if (sound.variants === 1) {
		return `${SOUND_PATH}/${sound.file}`;
	}
	// Multi-variant sound: file_1.wav, file_2.wav, etc.
	const index = variantIndex ?? 1;
	return `${SOUND_PATH}/${sound.file}_${index}.wav`;
};

/** Preload a single audio file */
const preloadSound = async (path: string): Promise<void> => {
	if (!audioContext || audioBuffers.has(path)) return;

	try {
		const response = await fetch(path);
		const arrayBuffer = await response.arrayBuffer();
		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
		audioBuffers.set(path, audioBuffer);
	} catch (e) {
		console.warn(`Failed to preload sound: ${path}`, e);
	}
};

/** Preload all sounds */
const preloadAllSounds = async (): Promise<void> => {
	const loadPromises: Promise<void>[] = [];

	for (const [name, sound] of Object.entries(SOUNDS)) {
		if (sound.variants === 1) {
			loadPromises.push(preloadSound(getSoundPath(name as SoundName)));
		} else {
			// Load all variants
			for (let i = 1; i <= sound.variants; i++) {
				loadPromises.push(preloadSound(getSoundPath(name as SoundName, i)));
			}
		}
	}

	await Promise.all(loadPromises);
	console.log("All sounds preloaded");
};

/** Play a sound using Web Audio API */
const playSoundBuffer = (path: string, volumeMultiplier = 1): void => {
	if (!audioContext || !audioEnabled || sfxVolume === 0) return;

	const buffer = audioBuffers.get(path);
	if (!buffer) {
		console.warn(`Sound not preloaded: ${path}`);
		return;
	}

	const source = audioContext.createBufferSource();
	const gainNode = audioContext.createGain();

	source.buffer = buffer;
	gainNode.gain.value = sfxVolume * volumeMultiplier;

	source.connect(gainNode);
	gainNode.connect(audioContext.destination);

	source.start(0);
};

/** Play a sound effect with variant rotation */
export const playSound = (name: SoundName, volumeMultiplier = 1): void => {
	const sound = SOUNDS[name];

	if (sound.variants === 1) {
		playSoundBuffer(getSoundPath(name), volumeMultiplier);
	} else {
		// Get current variant index and rotate
		const currentIndex = variantIndices.get(name) ?? 1;
		const path = getSoundPath(name, currentIndex);
		playSoundBuffer(path, volumeMultiplier);

		// Rotate to next variant
		const nextIndex = currentIndex >= sound.variants ? 1 : currentIndex + 1;
		variantIndices.set(name, nextIndex);
	}
};

/** Initialize audio (called early, before user interaction) */
export const initAudio = (): void => {
	// Create audio context (will be resumed on user interaction)
	audioContext = new AudioContext();
};

/** Enable audio playback (requires user interaction) */
export const enableAudio = (): void => {
	if (audioEnabled) return;

	// Show toast prompting user to click
	showEnableSoundsToast();

	const unlock = async (): Promise<void> => {
		try {
			// Hide the enable sounds toast
			hideEnableSoundsToast();

			// Resume audio context (required after user interaction)
			if (audioContext && audioContext.state === "suspended") {
				await audioContext.resume();
			}

			audioEnabled = true;
			console.log("Audio unlocked");
			document.removeEventListener("click", unlock);
			document.removeEventListener("touchstart", unlock);

			// Preload all sounds
			await preloadAllSounds();

			// Initialize and start background music
			// Loop point at 3:58.035 = 238.035 seconds, with 2 second crossfade
			backgroundMusic = await createCrossfadeLoop(`${SOUND_PATH}/music.wav`, 238.035, 2);
			backgroundMusic.setVolume(musicVolume);
			backgroundMusic.play();

			// Show toast notification
			showMusicToast();
		} catch (e) {
			console.error("Failed to initialize audio:", e);
		}
	};

	document.addEventListener("click", unlock);
	document.addEventListener("touchstart", unlock);
};

// Convenience exports for specific sounds
export const playAddUserSound = (): void => playSound("addUser");
export const playRemoveUserSound = (): void => playSound("removeUser");

/** Play card hover sound with dynamic cooldown and envelope for smooth overlap */
export const playCardHoverSound = (displacedCount = 1): void => {
	if (!audioContext || !audioEnabled || sfxVolume === 0) return;

	// Dynamic cooldown: more cards = shorter cooldown = more sounds
	// Clamp between 1-8 cards for scaling
	const clampedCount = Math.min(Math.max(displacedCount, 1), 8);
	const cooldownRange = CARD_SOUND_COOLDOWN_MAX - CARD_SOUND_COOLDOWN_MIN;
	const cooldown = CARD_SOUND_COOLDOWN_MAX - (cooldownRange * (clampedCount - 1)) / 7;

	// Enforce cooldown
	const now = performance.now();
	if (now - lastCardSoundTime < cooldown) return;
	lastCardSoundTime = now;

	const sound = SOUNDS.cardHover;
	const currentIndex = variantIndices.get("cardHover") ?? 1;
	const path = getSoundPath("cardHover", currentIndex);

	// Rotate to next variant
	const nextIndex = currentIndex >= sound.variants ? 1 : currentIndex + 1;
	variantIndices.set("cardHover", nextIndex);

	const buffer = audioBuffers.get(path);
	if (!buffer) return;

	const source = audioContext.createBufferSource();
	const gainNode = audioContext.createGain();
	const currentTime = audioContext.currentTime;

	source.buffer = buffer;

	// Envelope: attack (fade in) and release (fade out)
	const targetVolume = sfxVolume * 0.06;
	const attackTime = 0.03; // 30ms fade in
	const releaseTime = 0.15; // 150ms fade out
	const sustainDuration = Math.max(0, buffer.duration - attackTime - releaseTime);

	// Start silent, ramp up (attack)
	gainNode.gain.setValueAtTime(0, currentTime);
	gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + attackTime);

	// Hold at target volume, then ramp down (release)
	gainNode.gain.setValueAtTime(targetVolume, currentTime + attackTime + sustainDuration);
	gainNode.gain.linearRampToValueAtTime(0, currentTime + buffer.duration);

	source.connect(gainNode);
	gainNode.connect(audioContext.destination);

	source.start(0);
};
export const playClickBrownButtonSound = (): void => playSound("clickBrownButton");
export const playClickGoldenButtonSound = (): void => playSound("clickGoldenButton");
export const playHoverBrownButtonSound = (): void => playSound("hoverBrownButton");
export const playHoverGoldenButtonSound = (): void => playSound("hoverGoldenButton");
export const playPullLeverSound = (): void => playSound("pullLever");
export const playVoteSound = (): void => playSound("vote");
export const playWheelRotationSound = (): void => playSound("wheelRotation");
export const playShowNextHostSound = (): void => playSound("showNextHost");

/** Stop all audio (for cleanup on disconnect) */
export const stopAllAudio = (): void => {
	if (backgroundMusic) backgroundMusic.stop();
};
