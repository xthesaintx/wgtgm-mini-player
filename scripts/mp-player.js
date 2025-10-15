import {
    localize,
    format,
    formatTimestamp
} from "./helper.js";
var SearchFilter = foundry.applications.ux.SearchFilter;

var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const wgtngmmp = HandlebarsApplicationMixin((ApplicationV2));

export class wgtngmMiniPlayerSheet extends wgtngmmp {
    static SCOPE = "wgtngmMiniPlayer";
    static TYPE_KEY = "type";
    static DEFAULT_OPTIONS = {
        id: "wgtngmMiniPlayerSheet",
        classes: ["wgtngmMiniPlayer"],
        tag: 'div',
        window: {
            frame: true,
            title: 'Mini Player',
            icon: 'fas fa-music',
            minimizable: true,
            resizable: true,
            zIndex: 10,
        },
        actions: {
            "toggle-play-pause": this.#onTogglePlayPause,
            "stop-track": this.#onStopTrack,
            "next-track": this.#onNextTrack,
            "previous-track": this.#onPreviousTrack,
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
        }
    };

    async close(options) {
        const {width, height, left, top} = this.position;
        game.settings.set("wgtgm-mini-player", "mpSheetDimensions", {width, height, left, top });
        clearInterval(this.#timestampInterval);
        this._resizeObserver?.disconnect();
        // if (this.#currentTrack) {
        //     const playlist = game.playlists.get(this.#currentPlaylist?.id);
        //     const sound = playlist?.sounds.get(this.#currentTrack.id);
        //     const lastPlayed = {
        //         playlistId: playlist.id,
        //         trackId: sound.id,
        //         pausedTime: sound?.pausedTime || 0,
        //         playing: sound.playing
        //     };
        //     game.settings.set("wgtgm-mini-player", "lastPlayedTrack", lastPlayed);
        // } else {
        //     game.settings.set("wgtgm-mini-player", "lastPlayedTrack", null);
        // }
        return super.close(options);
    }
    

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.playlists = game.playlists.filter(p => p.sounds.size > 0);
        return context;
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this._activateListeners(this.element);
        this.#timestampInterval = setInterval(() => this._updateTimestamps(), 1000);
        this.syncState();
        const debouncedSave = foundry.utils.debounce((width, height) => {
            const { left, top } = this.position;
            game.settings.set("wgtgm-mini-player", "mpSheetDimensions", {width, height, left, top });
        }, 300);
        const target = this.element;
        this._resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width < 300 || height < 150) {
                    target.classList.add("compact-mode");
                } else {
                    target.classList.remove("compact-mode");
                }
                debouncedSave(width, height);
            }
        });

        this._resizeObserver.observe(this.element);

    }

    /**
     * Activates listeners for non-click events.
     * Click events are handled by the 'actions' object.
     */
    _activateListeners(html) {
        html.querySelector('#playlist-select').addEventListener('change', this._onPlaylistSelect.bind(this));
        html.querySelector('#track-select').addEventListener('change', this._onTrackSelect.bind(this));
        html.querySelector('input[name="volume"]').addEventListener('input', this._onVolumeChange.bind(this));
        html.querySelector('[data-action="toggle-mute"]').addEventListener('click', this.#onToggleMute.bind(this));
    }

    _updateTimestamps() {
        if (!this.element) return;
        const playlist = game.playlists.get(this.#currentPlaylist?.id);
        const sound = playlist?.sounds.get(this.#currentTrack.id);
        const currentTimeEl = this.element.querySelector('.wgtngm-current-time');
        const durationTimeEl = this.element.querySelector('.wgtngm-duration-time');
        if (sound?.sound?.loaded) {
            const isPaused = !sound.playing && sound.pausedTime;
            currentTimeEl.textContent = isPaused ? formatTimestamp(sound.pausedTime) : formatTimestamp(sound.sound.currentTime);
            durationTimeEl.textContent = formatTimestamp(sound.sound.duration);
        } else {
            currentTimeEl.textContent = "00:00";
            durationTimeEl.textContent = "00:00";
        }
    }
    syncState() {
        // If a playlist is already selected, just refresh the UI without changing the selection.
        if (this.#currentPlaylist) {
            this.#updateUIFromState();
            this.#updatePlayPauseIcon();
            return;
        }

        // Otherwise, determine the initial state to display.
        const playingSound = game.playlists.playing.find(p => p.sounds.some(s => s.playing))?.sounds.find(s => s.playing);

        if (playingSound) {
            this.#currentPlaylist = playingSound.parent;
            this.#currentTrack = playingSound;
        } else {
            const lastPlayed = game.settings.get("wgtgm-mini-player", "lastPlayedTrack");
            if(lastPlayed) {
                this.#currentPlaylist = game.playlists.get(lastPlayed.playlistId);
                if (this.#currentPlaylist) {
                    this.#currentTrack = this.#currentPlaylist.sounds.get(lastPlayed.trackId);
                    if(this.#currentTrack && !this.#currentTrack.playing && lastPlayed.pausedTime) {
                        this.#currentTrack.update({pausedTime: lastPlayed.pausedTime});
                    }
                }
            } else {
                if (!this.#currentPlaylist) {
                    const availablePlaylists = game.playlists.filter(p => p.sounds.size > 0);
                    if (availablePlaylists.length > 0) {
                        this.#currentPlaylist = availablePlaylists[0];
                    }
                }
                this.#currentTrack = null;
            }
        }
        this.#updateUIFromState();
        this.#updatePlayPauseIcon();
    }

    /**
     * Helper function to update all UI elements from the current state.
     */
    #updateUIFromState() {
        const playlistSelect = this.element.querySelector('#playlist-select');
        const trackSelect = this.element.querySelector('#track-select');

        if (this.#currentPlaylist) {
            playlistSelect.value = this.#currentPlaylist.id;
            trackSelect.innerHTML = ''; 
            
            const sounds = this.#currentPlaylist.playbackOrder.map(id => this.#currentPlaylist.sounds.get(id));

            sounds.forEach(sound => {
                if (!sound) return;
                const option = document.createElement('option');
                option.value = sound.id;
                option.textContent = sound.name;
                trackSelect.appendChild(option);
            });
            
            if ( !this.#currentTrack ) {
                this.#currentTrack = sounds[0] ?? null;
            }

        } else {
            playlistSelect.value = "";
            trackSelect.innerHTML = '<option value="">--Select a Track--</option>';
            this.#currentTrack = null;
        }

        if (this.#currentTrack) {
            trackSelect.value = this.#currentTrack.id;
        }

        this.#updateTrackInfo();
        this.#updatePlayPauseIcon();
    }

    #updateTrackInfo() {
        const nowPlayingEl = this.element.querySelector('.wgtngm-track-name');
        const windowPlayingEl = this.element.querySelector('.wgtngmMiniPlayer .window-title');
        const nextUpEl = this.element.querySelector('.wgtngm-next-track-name');
        nowPlayingEl.textContent = this.#currentTrack ? this.#currentTrack.name : "None";
        windowPlayingEl.textContent = this.#currentTrack ? this.#currentTrack.name : "Mini Player";
        if (this.#currentPlaylist && this.#currentTrack) {
            const nextSound = this.#currentPlaylist._getNextSound(this.#currentTrack.id);
            nextUpEl.textContent = nextSound ? nextSound.name : "End of Playlist";
        } else {
            nextUpEl.textContent = "--";
        }
    }

    #updatePlayPauseIcon() {
        const icon = this.element.querySelector('[data-action="toggle-play-pause"] i');
        if (!icon) return;
        if (this.#currentTrack?.playing) {
            icon.classList.replace('fa-play', 'fa-pause');
        } else {
            icon.classList.replace('fa-pause', 'fa-play');
        }
    }

    _onPlaylistSelect(event) {
        const playlistId = event.currentTarget.value;
        this.#currentPlaylist = game.playlists.get(playlistId);
        this.#currentTrack = null; 
        this.#updateUIFromState();
    }

    async _onTrackSelect(event) {
        const trackId = event.currentTarget.value;
        if (!this.#currentPlaylist) return;
        const newTrack = this.#currentPlaylist.sounds.get(trackId);
        if (!newTrack) return;
        
        if (game.settings.get("wgtgm-mini-player", "stop-on-new-playlist")) {
            for (const p of game.playlists.playing) {
                if (p.id !== this.#currentPlaylist.id) {
                    await p.stopAll();
                }
            }
        }

        this.#currentTrack = newTrack;
        
        await this.#currentPlaylist.playSound(this.#currentTrack);

        this.#updateTrackInfo();
        this.#updatePlayPauseIcon();
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
                for (const p of game.playlists.playing) {
                    if (p.id !== this.#currentPlaylist.id) {
                        await p.stopAll();
                    }
                }
            }
            await playlist.playSound(sound);
        }
        this.#updatePlayPauseIcon();
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
        
        for (const p of game.playlists.playing) {
            await p.stopAll();
        }
    }

   static async #onNextTrack(event) {
        if (this.#currentPlaylist) {
            await this.#currentPlaylist.playNext(this.#currentTrack?.id);
            this.syncState();
        }
    }
    
   static async #onPreviousTrack(event) {
        if (this.#currentPlaylist) {
            await this.#currentPlaylist.playNext(this.#currentTrack?.id, { direction: -1 });
            this.syncState();
        }
    }
    _onVolumeChange(event) {
        const volume = parseFloat(event.currentTarget.value);
        const targetSound = this.#currentTrack ?? game.playlists.playing.find(p => p.sounds.some(s => s.playing))?.sounds.find(s => s.playing);
        if (targetSound) {
            targetSound.debounceVolume(volume);
        }
        if (volume > 0 && this.#isMuted) {
            this.#isMuted = false;
            this.#updateMuteIcon();
        }
    }

    async #onToggleMute(event) {
        const targetSound = this.#currentTrack ?? game.playlists.playing.find(p => p.sounds.some(s => s.playing))?.sounds.find(s => s.playing);
        if (!targetSound) return;
        if (this.#isMuted){
            await targetSound.update({ volume: this.#previousVolume });
        } else {
            this.#previousVolume = targetSound.volume;
            await targetSound.update({ volume: 0 });
        }
        this.#isMuted = !this.#isMuted;
        this.#updateMuteIcon();
    }

    #setVolume(volume) {
        const playingSound = game.playlists.playing.find(p => p.sounds.some(s => s.playing))?.sounds.find(s => s.playing);
        if (playingSound && playingSound.sound) {
            playingSound.sound.volume = volume;
        }
        this.element.querySelector('input[name="volume"]').value = volume;
    }

    #updateMuteIcon() {
        const icon = this.element.querySelector('[data-action="toggle-mute"] i');
        if (this.#isMuted) {
            icon.classList.replace('fa-volume-high', 'fa-volume-xmark');
        } else {
            icon.classList.replace('fa-volume-xmark', 'fa-volume-high');
        }
    }
}
