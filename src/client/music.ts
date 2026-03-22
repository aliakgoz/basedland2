import { backendUrl } from "./backend";

interface MusicManifestResponse {
  tracks?: string[];
}

export class BackgroundMusicPlayer {
  private readonly audio = new Audio();
  private tracks: string[] = [];
  private activated = false;
  private currentTrack: string | null = null;
  private manifestPromise: Promise<void> | null = null;
  private readonly onGesture = () => {
    if (!this.activated) {
      return;
    }
    void this.tryPlay();
  };

  constructor() {
    this.audio.preload = "auto";
    this.audio.loop = false;
    this.audio.volume = 0.42;
    this.audio.addEventListener("ended", () => {
      void this.playNext();
    });
    this.audio.addEventListener("error", () => {
      void this.playNext();
    });
    window.addEventListener("pointerdown", this.onGesture, true);
    window.addEventListener("keydown", this.onGesture, true);
  }

  preload(): void {
    void this.loadManifest();
  }

  activate(): void {
    this.activated = true;
    void this.tryPlay();
  }

  private loadManifest(): Promise<void> {
    if (this.manifestPromise) {
      return this.manifestPromise;
    }
    this.manifestPromise = fetch(backendUrl("/api/music"), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as MusicManifestResponse;
        this.tracks = (payload.tracks ?? [])
          .filter((track) => typeof track === "string" && track.length > 0)
          .map((track) => backendUrl(track));
      })
      .catch(() => {
        this.tracks = [];
      });
    return this.manifestPromise;
  }

  private async tryPlay(): Promise<void> {
    await this.loadManifest();
    if (!this.activated || this.tracks.length === 0) {
      return;
    }
    if (this.audio.src && this.audio.paused) {
      try {
        await this.audio.play();
      } catch {
        // Browser will retry on the next user gesture.
      }
      return;
    }
    if (!this.audio.src) {
      await this.playNext();
    }
  }

  private async playNext(): Promise<void> {
    if (!this.activated || this.tracks.length === 0) {
      return;
    }

    const nextTrack = this.pickNextTrack();
    if (!nextTrack) {
      return;
    }

    this.currentTrack = nextTrack;
    this.audio.src = nextTrack;
    this.audio.currentTime = 0;
    try {
      await this.audio.play();
    } catch {
      // Browser will retry on the next user gesture.
    }
  }

  private pickNextTrack(): string | null {
    if (this.tracks.length === 0) {
      return null;
    }
    if (this.tracks.length === 1) {
      return this.tracks[0] ?? null;
    }

    const choices = this.tracks.filter((track) => track !== this.currentTrack);
    const pool = choices.length > 0 ? choices : this.tracks;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }
}
