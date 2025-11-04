import { localize, format, formatTimestamp, openwgtngmSoundboardSheet } from "./helper.js";

var SearchFilter = foundry.applications.ux.SearchFilter;

var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const wgtngmmp = HandlebarsApplicationMixin(ApplicationV2);

export class wgtngmMiniPlayerSheet extends wgtngmmp {
    static SCOPE = "wgtngmMiniPlayer";
    static TYPE_KEY = "type";
    static DEFAULT_OPTIONS = {
        id: "wgtngmMiniPlayerSheet",
        classes: ["wgtngmMiniPlayer"],
        tag: "div",
        window: {
            frame: true,
            title: "Mini Player",
            icon: "fas fa-music",
            minimizable: true,
            resizable: true,
            zIndex: 10,
        },
        actions: {
            "toggle-play-pause": this.#onTogglePlayPause,
            "stop-track": this.#onStopTrack,
            "next-track": this.#onNextTrack,
            "previous-track": this.#onPreviousTrack,
            "open-soundboard": this.#openSoundboard,
            "open-playlists": this.#openPlaylists,
            "wgtngm-loop": this.#setLoop,
            "wgtngm-favorite": this.#setFavorite,

        },
    };

    #currentPlaylist = null;
    #currentTrack = null;
    #isMuted = false;
    #previousVolume = 0.5;
    #timestampInterval = null;

    static PARTS = {
        main: {
            template: "modules/wgtgm-mini-player/templates/wgtgm-mini-player.hbs",
        },
    };

    async close(options) {
        const { width, height, left, top } = this.position;
        game.settings.set("wgtgm-mini-player", "mpSheetDimensions", {
            width,
            height,
            left,
            top,
        });
        const currentStates = game.settings.get("wgtgm-mini-player", "mpSbOpened");
        game.settings.set("wgtgm-mini-player", "mpSbOpened", {
            ...currentStates,
            mp: false,
        });
        clearInterval(this.#timestampInterval);
        this._resizeObserver?.disconnect();
        return super.close(options);
    }

    async _prepareContext(options) {
        const favoritePlaylistName = "favorites-miniPlayer";
        const favoritesPlaylist = game.playlists.find(p => p.name === favoritePlaylistName);
        const filteredPlaylists = this.#getFilteredPlaylists();    
        if (this.#currentPlaylist && filteredPlaylists.some((p) => p.id === this.#currentPlaylist.id)) {
            if (!this.#currentTrack || !this.#currentPlaylist.sounds.has(this.#currentTrack?.id)) {
                this.#currentTrack = this.#currentPlaylist.playbackOrder.map(id => this.#currentPlaylist.sounds.get(id))[0] ?? null;
            }
        } 
        else {
            const playingSound = game.playlists.playing
                .find((p) => p.sounds.some((s) => s.playing))
                ?.sounds.find((s) => s.playing);

            if (playingSound && filteredPlaylists.some((p) => p.id === playingSound.parent.id)) {
                this.#currentPlaylist = playingSound.parent;
                this.#currentTrack = playingSound;
            } 
            else {
                const lastPlayed = game.settings.get("wgtgm-mini-player", "lastPlayedTrack");
                let lastPlayedPlaylist = lastPlayed ? game.playlists.get(lastPlayed.playlistId) : null;
                
                if (lastPlayedPlaylist && filteredPlaylists.some((p) => p.id === lastPlayedPlaylist.id)) {
                    this.#currentPlaylist = lastPlayedPlaylist;
                    this.#currentTrack = this.#currentPlaylist.sounds.get(lastPlayed.trackId);
                } else {
                    this.#currentPlaylist = filteredPlaylists[0] ?? null;
                    this.#currentTrack = null;
                }
            }
        }

        if (this.#currentPlaylist && !this.#currentTrack) {
             this.#currentTrack = this.#currentPlaylist.playbackOrder.map(id => this.#currentPlaylist.sounds.get(id))[0] ?? null;
        }


        const context = await super._prepareContext(options);
        context.playlists = filteredPlaylists.map(p => ({
            id: p.id,
            name: p.name,
            playing: p.playing,
            isSelected: p.id === this.#currentPlaylist?.id
        }));

        const favoritePaths = new Set(
            favoritesPlaylist ? favoritesPlaylist.sounds.map(s => s.path) : []
        );
        let tracks = [];
        if (this.#currentPlaylist) {
            tracks = this.#currentPlaylist.playbackOrder
                .map(id => this.#currentPlaylist.sounds.get(id))
                .filter(Boolean) // Filter out any missing sounds
                .map(s => ({
                    id: s.id,
                    name: s.name,
                    repeat: s.repeat,
                    volume: s.volume,
                    isMuted: s.volume === 0,
                    playing: s.playing,
                    isSelected: s.id === this.#currentTrack?.id,
                    isFavorite: favoritePaths.has(s.path)
                }));
        }
        context.tracks = tracks;
        const sound = this.#currentTrack;
        const nextSound = this.#currentPlaylist?._getNextSound(this.#currentTrack?.id);
    
        context.nowPlaying = this.#currentTrack?.name ?? "None";
        this.window.title = this.#currentTrack?.name ?? "Mini Player"; 
        context.nextUp = nextSound?.name ?? "End of Playlist";
        context.isPlaying = this.#currentTrack?.playing ?? false;
        context.isLooping = this.#currentTrack?.repeat ?? false;

        let volume = 0.5;
        if (sound) {
            volume = sound.volume; // Get the track's *actual* current volume
        }

        if (volume === 0 && !this.#isMuted) {
            this.#isMuted = true; 
        } else if (volume > 0 && this.#isMuted) {
            this.#isMuted = false; 
        }
        
        context.isMuted = this.#isMuted; 

        context.volume = this.#isMuted ? 0 : volume; 

        if (!this.#isMuted && volume > 0) {
            this.#previousVolume = volume;
        }

        let isFavorite = false;
        const soundPath = this.#currentTrack?.path; 

        if (favoritesPlaylist && soundPath) {
            isFavorite = favoritesPlaylist.sounds.some(s => s.path === soundPath);
        }
        context.isFavorite = isFavorite;
        context.isDrawerOpen = game.settings.get("wgtgm-mini-player", "mpDrawerOpen");
        return context;
    }


    async _onFirstRender(context, options) {
        const currentStates = game.settings.get("wgtgm-mini-player", "mpSbOpened");
        game.settings.set("wgtgm-mini-player", "mpSbOpened", { ...currentStates, mp: true });
        this.#timestampInterval = setInterval(() => this._updateTimestamps(), 1000);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this._activateListeners(this.element);
        const target = this.element;
        if (!this._resizeObserver) {
            const debouncedSave = foundry.utils.debounce((width, height) => {
                const { left, top } = this.position;
                game.settings.set("wgtgm-mini-player", "mpSheetDimensions", { width, height, left, top });
            }, 300);

            this._resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (height < 145) {
                        target.classList.remove("pre-compact-mode");
                        target.classList.add("compact-mode");
                    } else if (height < 165) {
                        target.classList.add("pre-compact-mode");
                    } else {
                        target.classList.remove("pre-compact-mode");
                        target.classList.remove("compact-mode");
                    }
                    debouncedSave(width, height);
                }
            });
            this._resizeObserver.observe(this.element);
        }
    }

    _activateListeners(html) {
        html.querySelector("#playlist-select").addEventListener("change", this._onPlaylistSelect.bind(this));
        html.querySelector("#track-select").addEventListener("change", this._onTrackSelect.bind(this));
        html.querySelector('input[name="volume"]').addEventListener("input", this._onVolumeChange.bind(this));
        html.querySelector('[data-action="toggle-mute"]').addEventListener("click", this.#onToggleMute.bind(this));
    }

    _updateTimestamps() {
        if (!this.element) return;
        const playlist = game.playlists.get(this.#currentPlaylist?.id);
        const sound = playlist?.sounds.get(this.#currentTrack?.id); 
        const currentTimeEl = this.element.querySelector(".wgtngm-current-time");
        const durationTimeEl = this.element.querySelector(".wgtngm-duration-time");
        if (sound?.sound?.loaded) {
            const isPaused = !sound.playing && sound.pausedTime;
            currentTimeEl.textContent = isPaused
                ? formatTimestamp(sound.pausedTime)
                : formatTimestamp(sound.sound.currentTime);
            durationTimeEl.textContent = formatTimestamp(sound.sound.duration);
        } else {
            currentTimeEl.textContent = "00:00";
            durationTimeEl.textContent = "00:00";
        }
    }


    syncState() {
        this.render();
    }

    #getFilteredPlaylists() {
        return game.playlists.filter((p) => p.mode !== CONST.PLAYLIST_MODES.DISABLED && p.sounds.size > 0);
    }


    static #openPlaylists(event) {
        const drawer = event.target.parentElement;
        if (!drawer) return;
        drawer.classList.toggle("open");
        const isNowOpen = drawer.classList.contains("open");
        game.settings.set("wgtgm-mini-player", "mpDrawerOpen", isNowOpen);
    }

    async _onPlaylistSelect(event) {
        const playlistId = event.currentTarget.value;
        const newPlaylist = game.playlists.get(playlistId);
        if (!newPlaylist) return;
        this.#currentPlaylist = newPlaylist;
        this.#currentTrack = this.#currentPlaylist?.playbackOrder.map(id => this.#currentPlaylist.sounds.get(id))[0] ?? null;
        const playingSound = newPlaylist.playing ? newPlaylist.sounds.find(s => s.playing) : null;
    
        if (playingSound) {
            this.#currentTrack = playingSound;
        } else {
            this.#currentTrack = this.#currentPlaylist?.playbackOrder.map(id => this.#currentPlaylist.sounds.get(id))[0] ?? null;
        }
        this.render();
    }

    async _onTrackSelect(event) {
        const trackId = event.currentTarget.value;
        if (!this.#currentPlaylist) return;
        const newTrack = this.#currentPlaylist.sounds.get(trackId);
        if (!newTrack) return;
        this.#currentTrack = newTrack;
        const filteredPlaylists = this.#getFilteredPlaylists();
        if (game.settings.get("wgtgm-mini-player", "stop-on-new-playlist")) {
            for (const p of filteredPlaylists) {
                if (p.id !== this.#currentPlaylist.id && p.playing) {
                    await p.stopAll();
                }
            }
        } 
        if (game.settings.get("wgtgm-mini-player", "play-on-select")) {
            await this.#currentPlaylist.playSound(this.#currentTrack);
        } else {
            this.render();
        }
    }

    static async #onTogglePlayPause(event) {
        if (!this.#currentPlaylist || !this.#currentTrack) return;

        const playlist = game.playlists.get(this.#currentPlaylist.id);
        const sound = playlist?.sounds.get(this.#currentTrack.id);

        if (sound.playing) {
            const ct = sound.sound.currentTime;
            await sound.update({ playing: false, pausedTime: ct });
        } else {
            if (game.settings.get("wgtgm-mini-player", "stop-on-new-playlist")) {
                const playingAndEnabledPlaylists = this.#getFilteredPlaylists().filter((p) => p.playing);
                for (const p of playingAndEnabledPlaylists) {
                    if (p.id !== this.#currentPlaylist.id) {
                        await p.stopAll();
                    }
                }
            }
            await playlist.playSound(sound);
        }
        this.render();
    }

    static async #setLoop(event){
       const targetSound =
            this.#currentTrack ??
            game.playlists.playing.find((p) => p.sounds.some((s) => s.playing))?.sounds.find((s) => s.playing);
        if (!targetSound) return;
        await targetSound.update({ repeat: !targetSound.repeat });
        const drawer = event.target;
        if (!drawer) return;
        if (!targetSound.repeat){drawer.classList.remove("open");}
        else{
        drawer.classList.add("open");}
        this.render();
    }

    static async #setFavorite(event){
            const targetSound =
                this.#currentTrack ??
                game.playlists.playing.find((p) => p.sounds.some((s) => s.playing))?.sounds.find((s) => s.playing);
                
            if (!targetSound) {
                 ui.notifications.warn("No track selected to favorite.");
                 return;
            }
            
            const favoritePlaylistName = "favorites-miniPlayer";
            let favoritesPlaylist = game.playlists.find(p => p.name === favoritePlaylistName);

            if (!favoritesPlaylist) {
                try {
                    favoritesPlaylist = await Playlist.create({
                        name: favoritePlaylistName,
                        mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
                    });
                     ui.notifications.info(`Created playlist: ${favoritePlaylistName}`);
                } catch (err) {
                    console.error("Mini Player | Failed to create favorites playlist", err);
                    ui.notifications.error("Failed to create favorites playlist.");
                    return;
                }
            }

            // Check if track is already a favorite (by path)
            const existingSound = favoritesPlaylist.sounds.find(s => s.path === targetSound.path);

            try {
                if (existingSound) {
                    // Remove from favorites
                    await favoritesPlaylist.deleteEmbeddedDocuments("PlaylistSound", [existingSound.id]);
                    ui.notifications.info(`Removed "${targetSound.name}" from favorites.`);
                } else {
                    // Add to favorites
                    const soundData = {
                        name: targetSound.name,
                        path: targetSound.path,
                        repeat: false, // Favorites probably shouldn't loop by default
                        volume: targetSound.volume,
                        flags: { ...targetSound.flags } // Preserve flags
                    };
                    await favoritesPlaylist.createEmbeddedDocuments("PlaylistSound", [soundData]);
                    ui.notifications.info(`Added "${targetSound.name}" to favorites.`);
                }
            } catch (err) {
                 console.error("Mini Player | Failed to update favorites playlist", err);
                 ui.notifications.error("Failed to update favorites playlist.");
            }
            
            this.render();
        }

    static async #onStopTrack(event) {
        if (this.#currentTrack && this.#currentPlaylist) {
            const playlist = game.playlists.get(this.#currentPlaylist.id);
            const sound = playlist?.sounds.get(this.#currentTrack.id);
            if (sound?.playing) {
                await playlist.stopSound(sound);
                return;
            }
        }
        const playingAndEnabledPlaylists = this.#getFilteredPlaylists().filter((p) => p.playing);
        for (const p of playingAndEnabledPlaylists) {
            await p.stopAll();
        }
    }

    static async #onNextTrack(event) {
        if (this.#currentPlaylist) {
            await this.#currentPlaylist.playNext(this.#currentTrack?.id);
            // this.syncState();
        }
    }

    static async #onPreviousTrack(event) {
        if (this.#currentPlaylist) {
            await this.#currentPlaylist.playNext(this.#currentTrack?.id, {
                direction: -1,
            });
        }
    }

    static #openSoundboard() {
        openwgtngmSoundboardSheet();
    }

    _onVolumeChange(event) {
        const volume = parseFloat(event.currentTarget.value);
        const targetSound =
            this.#currentTrack ??
            game.playlists.playing.find((p) => p.sounds.some((s) => s.playing))?.sounds.find((s) => s.playing);
        if (targetSound) {
            targetSound.debounceVolume(volume);
        }
        if (volume > 0 && this.#isMuted) {
            this.render();
        }
    }

    async #onToggleMute(event) {
        const targetSound =
            this.#currentTrack ??
            game.playlists.playing.find((p) => p.sounds.some((s) => s.playing))?.sounds.find((s) => s.playing);
        if (!targetSound) return;

        if (this.#isMuted) {
            await targetSound.update({ volume: this.#previousVolume });
            this.#isMuted = false;
        } else {
            this.#previousVolume = targetSound.volume > 0 ? targetSound.volume : 0.5; 
            await targetSound.update({ volume: 0 });
            this.#isMuted = true;
        }
        this.render();
    }

}