import { localize, format, formatTimestamp, openwgtngmSoundboardSheet } from "./helper.js";
import { TagEditor, TagPlaylistGenerator } from "./tags.js"; 
import { MODULE_NAME } from "./settings.js";

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
            "fadeSounds": this.#fadeSoundsToggle,
            "wgtngm-loop": this.#setLoop,
            "wgtngm-favorite": this.#setFavorite,
            "create-taglist": this.#createTaglist,
            "edit-taglist": this.#editTagList,
            "toggle-tag-mode": this.#toggleTagMode,
            // "toggle-tag-select": this.#toggleTagSelect
            "toggle-tag-select": {
                handler: this.#toggleTagSelect,
                buttons: [0, 2],
              },

        },
    };

    #currentPlaylist = null;
    #currentTrack = null;
    #isMuted = false;
    #isFade = game.settings.get("wgtgm-mini-player", "enable-crossfade");
    #previousVolume = 0.5;
    #timestampInterval = null;

    #tagMode = game.settings.get("wgtgm-mini-player", "lastTagMode") ?? false;
    // #tagSelection = new Map(game.settings.get("wgtgm-mini-player", "tagSelectionState") ?? []);
    #tagSelection = (() => {
        const saved = game.settings.get("wgtgm-mini-player", "tagSelectionState") ?? [];
        // Ensure we only keep tags that actually exist in the TagManager
        const availableTags = new Set(game.wgtngmTags?.getAllUniqueTags() ?? []);
        const validEntries = saved.filter(([tag]) => availableTags.has(tag));
        return new Map(validEntries);
    })();
    #matchMode = "AND";
    #tagPlaylistName = "taglist-miniPlayer";

    static PARTS = {
        main: {
            template: "modules/wgtgm-mini-player/templates/wgtgm-mini-player.hbs", scrollable: ["",".scrollable",".tag-cloud"] 
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
        const favoritePaths = new Set(favoritesPlaylist ? favoritesPlaylist.sounds.map(s => s.path) : []);

        if (this.#tagMode) {
            let tagPlaylist = game.playlists.find(p => p.name === this.#tagPlaylistName);
            
            this.#currentPlaylist = tagPlaylist || null;

            if (this.#currentPlaylist) {
                if (this.#currentTrack && !this.#currentPlaylist.sounds.has(this.#currentTrack.id)) {
                    this.#currentTrack = null;
                }

                const playingSound = this.#currentPlaylist.sounds.find(s => s.playing);

                if (!this.#currentTrack) {
                    this.#currentTrack = playingSound || this.#currentPlaylist.playbackOrder.map(id => this.#currentPlaylist.sounds.get(id))[0] || null;
                }
            }

            if (game.wgtngmTags.allTracks.length === 0) await game.wgtngmTags.scanLibrary();
            
            const filteredTracks = game.wgtngmTags.getFilteredTracks(this.#tagSelection, this.#matchMode);
            
            const availableTags = new Set();
            filteredTracks.forEach(t => {
                const trackTags = game.wgtngmTags.getTags(t.path);
                trackTags.forEach(tag => availableTags.add(tag));
            });

            const allTags = game.wgtngmTags.getAllUniqueTags();
            const tagCloud = allTags
                .filter(t => availableTags.has(t) || this.#tagSelection.has(t))
                .map(t => {
                    const stateVal = this.#tagSelection.get(t) || 0;
                    let stateClass = "";
                    if (stateVal === 1) stateClass = "include";
                    else if (stateVal === -1) stateClass = "exclude";
                    return { name: t, stateClass: stateClass };
                });

            const context = await super._prepareContext(options);
            context.tagMode = true;
            context.tags = tagCloud;
            context.matchMode = this.#matchMode;

            let tracks = [];
            if (this.#currentPlaylist) {
                 tracks = this.#currentPlaylist.playbackOrder
                .map(id => this.#currentPlaylist.sounds.get(id))
                .filter(Boolean)
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

            this.#prepareCommonContext(context, favoritesPlaylist);
            return context;
        }

        const filteredPlaylists = this.#getFilteredPlaylists();    
        if (this.#currentPlaylist && filteredPlaylists.some((p) => p.id === this.#currentPlaylist.id)) {
            if (!this.#currentTrack || !this.#currentPlaylist.sounds.has(this.#currentTrack?.id)) {
                this.#currentTrack = this.#currentPlaylist.playbackOrder.map(id => this.#currentPlaylist.sounds.get(id))[0] ?? null;
            }
        } else {
            const playingSound = game.playlists.playing.find((p) => p.sounds.some((s) => s.playing))?.sounds.find((s) => s.playing);
            if (playingSound && filteredPlaylists.some((p) => p.id === playingSound.parent.id)) {
                this.#currentPlaylist = playingSound.parent;
                this.#currentTrack = playingSound;
            } else {
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
        context.tagMode = false;
        context.playlists = filteredPlaylists.map(p => ({
            id: p.id,
            name: p.name,
            playing: p.playing,
            isSelected: p.id === this.#currentPlaylist?.id
        }));

        let tracks = [];
        if (this.#currentPlaylist) {
            tracks = this.#currentPlaylist.playbackOrder
                .map(id => this.#currentPlaylist.sounds.get(id))
                .filter(Boolean)
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

        this.#prepareCommonContext(context, favoritesPlaylist);
        return context;
    }

    #prepareCommonContext(context, favoritesPlaylist) {
        context.nowPlaying = this.#currentTrack?.name ?? "None";
        this.window.title = this.#currentTrack?.name ?? "Mini Player"; 
        const nextSound = this.#currentPlaylist?._getNextSound(this.#currentTrack?.id);
        context.nextUp = nextSound?.name ?? "End of Playlist";
        context.isPlaying = this.#currentTrack?.playing ?? false;
        context.isLooping = this.#currentTrack?.repeat ?? false;
        context.isDrawerOpen = game.settings.get("wgtgm-mini-player", "mpDrawerOpen");

        let volume = 0.5;
        if (this.#currentTrack) {
            volume = this.#currentTrack.volume;
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
        context.isFade = this.#isFade;
        context.isFavorite = isFavorite;
    }

    static async #toggleTagMode(event, target) {
        this.#tagMode = !this.#tagMode;

        target.classList.toggle('true', this.#tagMode);

        await game.settings.set("wgtgm-mini-player", "lastTagMode", this.#tagMode);
        
        if (this.#tagMode) {
            game.settings.set("wgtgm-mini-player", "mpDrawerOpen", true);
            if (game.wgtngmTags.allTracks.length === 0) await game.wgtngmTags.scanLibrary();
            await this.#updateTagPlaylist();
        }
        this.render();
    }


    static async #toggleTagSelect(event, target) {
        const app = game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance;
        if (!app) return;
        const tag = target.dataset.tag;
        const current = app.#tagSelection.get(tag) || 0;
        let next = 0;
        if (event.button === 2) {
            if (current === -1) next = 0;      // Exclude -> Neutral
            else if (current === 0) next = -1; // Neutral -> Exclude
            else next = 0;                     // Include -> Neutral
        } else {
            if (current === 0) next = 1;       // Neutral -> Include
            else if (current === 1) next = 0;  // Include -> Neutral
            else next = 0;                     // Exclude -> Neutral
        }

        if (next === 0) app.#tagSelection.delete(tag);
        else app.#tagSelection.set(tag, next);
        
        await game.settings.set("wgtgm-mini-player", "tagSelectionState", Array.from(app.#tagSelection.entries()));

        await app.#updateTagPlaylist();
        app.render();
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
       if (!this.#tagMode) html.querySelector("#playlist-select").addEventListener("change", this._onPlaylistSelect.bind(this));
        html.querySelector("#track-select").addEventListener("change", this._onTrackSelect.bind(this));
        html.querySelector('input[name="volume"]').addEventListener("input", this._onVolumeChange.bind(this));
        html.querySelector('[data-action="toggle-mute"]').addEventListener("click", this.#onToggleMute.bind(this));
    }

    async #updateTagPlaylist() {
        const filteredTracks = game.wgtngmTags.getFilteredTracks(this.#tagSelection, this.#matchMode);
        const crossfadeBaseDuration = game.settings.get("wgtgm-mini-player", "crossfade") * 1000;
        const enableCrossfade = game.settings.get("wgtgm-mini-player", "enable-crossfade");
        const fadeDuration = enableCrossfade ? crossfadeBaseDuration : 0;        
        let playlist = game.playlists.find(p => p.name === this.#tagPlaylistName);
        if (!playlist) {
            playlist = await Playlist.create({
                name: this.#tagPlaylistName,
                mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
                description: "Dynamically generated by Mini Player Tag Mode",
                flags: { [MODULE_NAME]: { tagPlaylist: true } },
                fade: fadeDuration 
            });
        } else {
            // Ensure existing playlist has correct fade setting
            if (playlist.fade !== fadeDuration) {
                await playlist.update({ fade: fadeDuration });
            }
        }

        const shouldLoop = game.settings.get("wgtgm-mini-player", "set-music-to-loop");
        
        const soundsToDelete = [];
        const filteredPaths = new Set(filteredTracks.map(t => t.path));
    
        const playingSound = playlist.sounds.find(s => s.playing);
        
        for (const sound of playlist.sounds) {
            if (sound.playing && filteredPaths.has(sound.path)) {
                continue;
            }
            soundsToDelete.push(sound.id);
        }

        if (soundsToDelete.length > 0) {
            await playlist.deleteEmbeddedDocuments("PlaylistSound", soundsToDelete);
        }
        const existingPaths = new Set(playlist.sounds.map(s => s.path));
        const soundsToAdd = [];

        for (const track of filteredTracks) {
            if (!existingPaths.has(track.path)) {
                soundsToAdd.push({
                    name: track.name,
                    path: track.path,
                    repeat: shouldLoop
                });
            }
        }

        if (soundsToAdd.length > 0) {
            await playlist.createEmbeddedDocuments("PlaylistSound", soundsToAdd);
        }
        
    
        this.#currentPlaylist = playlist;
        const newPlaying = playlist.sounds.find(s => s.playing);
        this.#currentTrack = newPlaying || playlist.sounds.contents[0] || null;
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

    static #fadeSoundsToggle(event, target) {
        const currentIsFade = game.settings.get("wgtgm-mini-player", "enable-crossfade");
        this.#isFade = !currentIsFade;
        game.settings.set("wgtgm-mini-player", "enable-crossfade", this.#isFade);
        target.classList.toggle('fade', this.#isFade);
        const filteredPlaylists = this.#getFilteredPlaylists();
        for (const p of filteredPlaylists) {
            p.update({ fade: this.#crossFadeLength() });
        }

    }

  /** @inheritDoc */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if ( !this.hasFrame ) return frame;
    const copyId = `
        <button type="button" class="header-control fa-solid fa-filter icon" data-action="create-taglist"
                data-tooltip="Create Tag Playlist" aria-label="Create Tag Playlist"></button>
        <button type="button" class="header-control fa-solid fa-tag icon" data-action="edit-taglist"
                data-tooltip="Edit Tags" aria-label="Edit Tags"></button>
        <button type="button" class="header-control fa-solid fa-border-all icon" data-action="open-soundboard"
                data-tooltip="Open Soundboard" aria-label="Open Soundboard"></button>
        <button type="button" class="header-control fa-solid fa-tags icon ${this.#tagMode}" data-action="toggle-tag-mode"
                data-tooltip="Toggle Tag Mode" aria-label="Toggle Tag Mode"></button>
      `;
      this.window.close.insertAdjacentHTML("beforebegin", copyId);
    return frame;
  }

    static #editTagList(event){
        new TagEditor().render(true);
    }

    static #createTaglist(event){
        new TagPlaylistGenerator().render(true);
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

    #crossFadeLength(){
        const CrossfadeEnabled = game.settings.get("wgtgm-mini-player", "enable-crossfade");
        const crossfadeBaseDuration = game.settings.get("wgtgm-mini-player", "crossfade") * 1000;
        const finalCrossfadeDuration = CrossfadeEnabled ? crossfadeBaseDuration : 1;
        return finalCrossfadeDuration;
    }

    async _onTrackSelect(event) {
        const trackId = event.currentTarget.value;
        if (!this.#currentPlaylist) return;
        const newTrack = this.#currentPlaylist.sounds.get(trackId);
        if (!newTrack) return;
        this.#currentTrack = newTrack;
        const filteredPlaylists = this.#getFilteredPlaylists();
        if (game.settings.get("wgtgm-mini-player", "stop-on-new-playlist") && game.settings.get("wgtgm-mini-player", "play-on-select")) {
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