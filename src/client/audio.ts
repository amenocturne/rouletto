/**
 * Audio management for the casino wheel app.
 * Handles background music, sound effects, and volume settings.
 */

import { createCrossfadeLoop, type CrossfadeLoopPlayer } from "./music";

// Audio state
let spinSound: HTMLAudioElement | null = null;
let revealSound: HTMLAudioElement | null = null;
let audioEnabled = false;
let backgroundMusic: CrossfadeLoopPlayer | null = null;

// Volume settings (0-1)
let musicVolume = 0.2; // Default 20%
let sfxVolume = 0.2; // Default 20%

/** Get current music volume (0-1) */
export const getMusicVolume = (): number => musicVolume;

/** Get current SFX volume (0-1) */
export const getSfxVolume = (): number => sfxVolume;

/** Set music volume (0-1) */
export const setMusicVolume = (volume: number): void => {
	musicVolume = volume;
	applyVolume();
	saveVolumeSettings();
};

/** Set SFX volume (0-1) */
export const setSfxVolume = (volume: number): void => {
	sfxVolume = volume;
	applyVolume();
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
	applyVolume();
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

/** Apply current volume to all audio elements */
const applyVolume = (): void => {
	if (spinSound) spinSound.volume = sfxVolume;
	if (revealSound) revealSound.volume = sfxVolume;
	if (backgroundMusic) backgroundMusic.setVolume(musicVolume);
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
		applyVolume();
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

/** Initialize audio elements (SFX files - may not exist) */
export const initAudio = (): void => {
	// Create audio elements (these files are optional - SFX may not exist yet)
	try {
		spinSound = new Audio("/rouletto/sounds/spin.mp3");
		spinSound.loop = true;
		spinSound.volume = sfxVolume;
		spinSound.load();
	} catch {
		spinSound = null;
	}

	try {
		revealSound = new Audio("/rouletto/sounds/reveal.mp3");
		revealSound.volume = sfxVolume;
		revealSound.load();
	} catch {
		revealSound = null;
	}
};

/** Enable audio playback (requires user interaction) */
export const enableAudio = (): void => {
	if (audioEnabled) return;

	const unlock = async (): Promise<void> => {
		try {
			// Try to unlock with spin sound if it exists, otherwise use a silent audio context
			if (spinSound) {
				try {
					await spinSound.play();
					spinSound.pause();
					spinSound.currentTime = 0;
				} catch {
					// SFX file might not exist, continue anyway
				}
			}

			audioEnabled = true;
			console.log("Audio unlocked");
			document.removeEventListener("click", unlock);
			document.removeEventListener("touchstart", unlock);

			// Initialize and start background music
			// Loop point at 3:58.035 = 238.035 seconds, with 2 second crossfade
			backgroundMusic = await createCrossfadeLoop("/rouletto/sounds/music.wav", 238.035, 2);
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

/** Play the spin sound effect (looping) */
export const playSpinSound = (): void => {
	if (!audioEnabled || !spinSound) return;
	spinSound.currentTime = 0;
	spinSound.play().catch((e) => console.warn("Spin sound failed:", e));
};

/** Stop the spin sound effect */
export const stopSpinSound = (): void => {
	if (!spinSound) return;
	spinSound.pause();
	spinSound.currentTime = 0;
};

/** Play the reveal/winner sound effect */
export const playRevealSound = (): void => {
	if (!audioEnabled || !revealSound) return;
	stopSpinSound();
	revealSound.currentTime = 0;
	revealSound.play().catch((e) => console.warn("Reveal sound failed:", e));
};

/** Stop all audio (for cleanup on disconnect) */
export const stopAllAudio = (): void => {
	stopSpinSound();
	if (backgroundMusic) backgroundMusic.stop();
};
