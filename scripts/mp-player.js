import { formatTimestamp, openwgtngmSoundboardSheet } from "./helper.js";
import { TagEditor, TagPlaylistGenerator } from "./tags.js";
import { MODULE_NAME } from "./settings.js";
import { ttrpgIntegration } from "./ttrpg.js";
import { filterTracksBySelection } from "./tag-utils.js";
const FAVORITES_PLAYLIST_NAME = "favorites-miniPlayer";
const TAG_PLAYLIST_NAME = "taglist-miniPlayer";

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
            "rescan-library": this.#rescanLibrary,
            "toggle-tag-mode": this.#toggleTagMode,
            "toggle-ttrpg-source": this.#toggleTTRPG,
            "toggle-tag-select": {
                handler: this.#toggleTagSelect,
                buttons: [0, 2],
            },
            "set-dock": this.#_toggleDock,
            "set-dock-left": this.#_toggleDockLeft,
            "toggle-dock-left-panel": this.#_toggleDockLeftPanel,


        },
    };

    #currentPlaylist = null;
    #currentTrack = null;
    #isMuted = false;
    #isFade = game.settings.get("wgtgm-mini-player", "enable-crossfade");
    #previousVolume = 0.5;
    #timestampInterval = null;
    #lastTimestamp = { trackId: null, current: 0, duration: 0 };

    #tagMode = game.settings.get("wgtgm-mini-player", "lastTagMode") ?? false;
    #tagSelection = new Map(game.settings.get("wgtgm-mini-player", "tagSelectionState") ?? []);
    #matchMode = "AND";
    #includeTTRPG = game.settings.get("wgtgm-mini-player", "ttrpgSourceEnabled") ?? false;
    #tagPlaylistName = TAG_PLAYLIST_NAME;
    #tagUpdateTimeout = null;
    #dockLeft = game.settings.get(MODULE_NAME, "dockLeft") ?? false;
    #dockLeftTop = Number(game.settings.get(MODULE_NAME, "dockLeftTop")) || 100;
    #dockLeftCollapsed = game.settings.get(MODULE_NAME, "dockLeftCollapsed") ?? false;
    #compactClassState = "normal";
    #pendingDockLeftDimensions = null;
    dontUpdate = false;
    positionDirty = false;

    static PARTS = {
        main: {
            template: "modules/wgtgm-mini-player/templates/wgtgm-mini-player.hbs", scrollable: ["", ".scrollable", ".tag-cloud"]
        },
    };

    setPosition(options = {}) {
        const position = super.setPosition(options);
        this.positionDirty = true;
        if (this.#dockLeft && Number.isFinite(position?.top)) {
            this.#dockLeftTop = Math.max(0, Math.round(position.top));
            game.settings.set(MODULE_NAME, "dockLeftTop", this.#dockLeftTop);
        }
        return position;
    }

    #saveWindowDimensionsIfAllowed() {
        const dockSidebar = game.settings.get(MODULE_NAME, "dockSidebar");
        if (dockSidebar || !this.position) return;
        const { width, height, left, top } = this.position;
        if (![width, height, left, top].every(Number.isFinite)) return;
        game.settings.set(MODULE_NAME, "mpSheetDimensions", { width, height, left, top });
    }

    async close(options) {
        if (this.element) {
            this.element.style.setProperty("display", "none", "important");
        }
        game.settings.set(MODULE_NAME, "dockLeftCollapsed", this.#dockLeftCollapsed);
        this.#saveWindowDimensionsIfAllowed();
        const currentStates = game.settings.get("wgtgm-mini-player", "mpSbOpened");
        game.settings.set("wgtgm-mini-player", "mpSbOpened", {
            ...currentStates,
            mp: false,
        });
        clearInterval(this.#timestampInterval);
        if (this.#tagUpdateTimeout) clearTimeout(this.#tagUpdateTimeout);
        this._resizeObserver?.disconnect();
        return super.close(options);
    }

    async minimize() {
        if (this.#dockLeft) {
            this.#dockLeftCollapsed = !this.#dockLeftCollapsed;
            await game.settings.set(MODULE_NAME, "dockLeftCollapsed", this.#dockLeftCollapsed);
            this.#applyDockLeftState();
            return this;
        }
        return super.minimize();
    }

    async maximize() {
        if (this.#dockLeft) {
            this.#dockLeftCollapsed = false;
            await game.settings.set(MODULE_NAME, "dockLeftCollapsed", false);
            this.#applyDockLeftState();
            return this;
        }
        return super.maximize();
    }

    async _prepareContext(options) {
        const favoritesPlaylist = game.playlists.find(p => p.name === FAVORITES_PLAYLIST_NAME);
        const favoritePaths = new Set(favoritesPlaylist ? favoritesPlaylist.sounds.map(s => s.path) : []);

        if (this.#tagMode) {
            if (game.wgtngmTags.allTracks.length === 0) await game.wgtngmTags.scanLibrary();

            const allUniqueTags = new Set(game.wgtngmTags.getAllUniqueTags());

            if (this.#includeTTRPG && ttrpgIntegration.isAvailable) {
                ttrpgIntegration.tags.forEach(t => allUniqueTags.add(t));
            }

            let stateChanged = false;
            for (const [tag] of this.#tagSelection) {
                if (!allUniqueTags.has(tag)) {
                    this.#tagSelection.delete(tag);
                    stateChanged = true;
                }
            }
            if (stateChanged) {
                game.settings.set("wgtgm-mini-player", "tagSelectionState", Array.from(this.#tagSelection.entries()));
            }

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

            const filteredTracks = this.#getCombinedFilteredTracks();

            let availableTags = new Set();

            if (this.#matchMode === "AND") {
                filteredTracks.forEach(t => {
                    let tags;
                    if (t.isTTRPG) tags = t.tags;
                    else tags = game.wgtngmTags.getTags(t.path);

                    tags.forEach(tag => availableTags.add(tag));
                });
            }

            const allLocalTags = game.wgtngmTags.getAllUniqueTags();
            let allTagsSet = new Set(allLocalTags);
            if (this.#includeTTRPG && ttrpgIntegration.isAvailable) {
                ttrpgIntegration.tags.forEach(t => allTagsSet.add(t));
            }
            const PRIORITY_TAGS = ["standard", "alternate", "bonus"];

            const allTags = Array.from(allTagsSet).sort((a, b) => {
                const indexA = PRIORITY_TAGS.indexOf(a);
                const indexB = PRIORITY_TAGS.indexOf(b);
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a.localeCompare(b);
            });


            const tagCloud = allTags
                .filter(t => {
                    if (this.#matchMode === "OR") return true;
                    if (this.#tagSelection.size === 0) return true;
                    return availableTags.has(t) || this.#tagSelection.has(t);
                })
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

            context.showTTRPGToggle = ttrpgIntegration.active;
            context.ttrpgEnabled = this.#includeTTRPG;
            this.#setLocalizedUiContext(context);

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
        this.#setLocalizedUiContext(context);
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
        context.nowPlaying = this.#currentTrack?.name ?? game.i18n.localize(`${MODULE_NAME}.ui.none`);
        this.window.title = this.#currentTrack?.name ?? game.i18n.localize(`${MODULE_NAME}.ui.windowTitle`);
        const nextSound = this.#currentPlaylist?._getNextSound(this.#currentTrack?.id);
        context.nextUp = nextSound?.name ?? game.i18n.localize(`${MODULE_NAME}.ui.endOfPlaylist`);
        context.isPlaying = this.#currentTrack?.playing ?? false;
        context.isLooping = this.#currentTrack?.repeat ?? false;
        context.isDrawerOpen = game.settings.get("wgtgm-mini-player", "mpDrawerOpen");


        let currentTrackTags = [];
        if (this.#currentTrack) {
            const path = this.#currentTrack.path;
            currentTrackTags = game.wgtngmTags.getTags(path);
            if (currentTrackTags.length === 0 && ttrpgIntegration.active && ttrpgIntegration.isAvailable) {
                const ttrpgTrack = ttrpgIntegration.tracks.find(t =>
                    ttrpgIntegration.getPath(t, false) === path ||
                    ttrpgIntegration.getPath(t, true) === path
                );
                if (ttrpgTrack) currentTrackTags = ttrpgTrack.tags;
            }
        }
        context.currentTrackTags = currentTrackTags.map(t => ({ name: t }));

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

    #setLocalizedUiContext(context) {
        context.tagHintText = game.i18n.localize(`${MODULE_NAME}.ui.tagHint`);
        context.tagToggleTitle = game.i18n.localize(`${MODULE_NAME}.ui.tagToggleTitle`);
        context.ttrpgSourceToggleTitle = game.i18n.localize(`${MODULE_NAME}.ui.ttrpgSourceToggleTitle`);
        context.resultsLabel = game.i18n.localize(`${MODULE_NAME}.ui.resultsLabel`);
        context.playlistLabel = game.i18n.localize(`${MODULE_NAME}.ui.playlistLabel`);
        context.trackLabel = game.i18n.localize(`${MODULE_NAME}.ui.trackLabel`);
        context.noMatchesText = game.i18n.localize(`${MODULE_NAME}.ui.noMatchesText`);
        context.selectTrackText = game.i18n.localize(`${MODULE_NAME}.ui.selectTrackText`);
        context.favoriteTitle = game.i18n.localize(`${MODULE_NAME}.ui.favoriteTitle`);
        context.crossfadeTitle = game.i18n.localize(
            this.#isFade ? `${MODULE_NAME}.ui.crossfadeOn` : `${MODULE_NAME}.ui.crossfadeOff`
        );
        context.loopTitle = game.i18n.localize(`${MODULE_NAME}.ui.loopTitle`);
        context.previousTrackTitle = game.i18n.localize(`${MODULE_NAME}.ui.previousTrackTitle`);
        context.playPauseTitle = game.i18n.localize(`${MODULE_NAME}.ui.playPauseTitle`);
        context.stopTitle = game.i18n.localize(`${MODULE_NAME}.ui.stopTitle`);
        context.nextTrackTitle = game.i18n.localize(`${MODULE_NAME}.ui.nextTrackTitle`);
        context.muteTitle = game.i18n.localize(`${MODULE_NAME}.ui.muteTitle`);
        context.nextLabel = game.i18n.localize(`${MODULE_NAME}.ui.nextLabel`);
    }

    #safePausedTime(value, fallback = 0) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric >= 0) return numeric;
        const fallbackNumeric = Number(fallback);
        if (Number.isFinite(fallbackNumeric) && fallbackNumeric >= 0) return fallbackNumeric;
        return 0;
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

        app.#scheduleTagPlaylistUpdate();
        app.render();
    }

    #scheduleTagPlaylistUpdate() {
        if (this.#tagUpdateTimeout) clearTimeout(this.#tagUpdateTimeout);
        this.#tagUpdateTimeout = setTimeout(async () => {
            this.#tagUpdateTimeout = null;
            await this.#updateTagPlaylist();
            if (this.rendered) this.render();
        }, 150);
    }

    async _onFirstRender(context, options) {
        const currentStates = game.settings.get("wgtgm-mini-player", "mpSbOpened");
        game.settings.set("wgtgm-mini-player", "mpSbOpened", { ...currentStates, mp: true });
        this.#timestampInterval = setInterval(() => this._updateTimestamps(), 1000);
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this._activateListeners(this.element);
        const dockSidebar = game.settings.get(MODULE_NAME, "dockSidebar");
        this.#dockLeft = game.settings.get(MODULE_NAME, "dockLeft") ?? this.#dockLeft;
        this.#dockLeftTop = Number(game.settings.get(MODULE_NAME, "dockLeftTop")) || this.#dockLeftTop;
        this.#dockLeftCollapsed = game.settings.get(MODULE_NAME, "dockLeftCollapsed") ?? this.#dockLeftCollapsed;

        const target = this.element;
        const players = document.getElementById("playlists");
        const directoryHeader = players?.querySelector(".global-volume") || players?.querySelector(".directory-header");
        if (directoryHeader) {
        }
        const uiConfig = game.settings.get("core", "uiConfig") || {};
        const colorScheme = uiConfig.colorScheme;
        const systemTheme = matchMedia("(prefers-color-scheme: dark)").matches ? 'dark' : 'light';
        const activeTheme = colorScheme?.interface || systemTheme;
        const dockedTheme = `theme-${activeTheme}`;


        if (dockSidebar && !this.#dockLeft) {
            if (directoryHeader && directoryHeader.parentNode) {
                this.element.classList.add("docked", dockedTheme);
                this.element.classList.remove("docked-left");
                this.element.style.top = "";
                this.element.style.left = "";
                this.element.style.width = "";
                this.element.style.height = "";
                this.element.style.position = "";

                if (this.element.parentNode !== directoryHeader.parentNode || this.element.previousElementSibling !== directoryHeader) {
                    directoryHeader.after(this.element);
                }
            }
        } else if (this.#dockLeft) {
            this.element.classList.remove("docked");
            const classesToRemove = [...this.element.classList].filter(c => c.startsWith("theme-"));
            this.element.classList.remove(...classesToRemove);
            if (directoryHeader && this.element.parentNode === directoryHeader.parentNode) {
                document.body.appendChild(this.element);
            }
            this.element.style.removeProperty("position");
            this.element.classList.add("docked-left");
            this.element.style.setProperty("left", "0px", "important");
            this.element.style.setProperty("top", `${this.#dockLeftTop}px`, "important");
            if (this.#pendingDockLeftDimensions) {
                const { width, height } = this.#pendingDockLeftDimensions;
                this.setPosition({ width, height, left: 0, top: this.#dockLeftTop });
                this.#pendingDockLeftDimensions = null;
            }
            this.#applyDockLeftState();
        } else {
            this.element.classList.remove("docked");
            this.element.classList.remove("docked-left");
            this.element.classList.remove("collapsed");
            const classesToRemove = [...this.element.classList].filter(c => c.startsWith("theme-"));
            this.element.classList.remove(...classesToRemove);
            this.element.style.removeProperty("left");
            this.element.style.removeProperty("top");
            const existingHandle = this.element.querySelector(".wgtngm-mp-dock-handle");
            if (existingHandle) existingHandle.remove();
            if (directoryHeader && this.element.parentNode === directoryHeader.parentNode) {
                document.body.appendChild(this.element);
            }
            const saved = game.settings.get(MODULE_NAME, "mpSheetDimensions");
            if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {

                this.setPosition(saved);
            } else {
                this.setPosition({ top: 100, left: 100 });
            }

        }
        if (dockSidebar) {
            this._resizeObserver?.disconnect();
            this._resizeObserver = null;
            this.#compactClassState = "normal";
            target.classList.remove("pre-compact-mode");
            target.classList.remove("compact-mode");
        } else if (!this._resizeObserver) {
            this._resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { height } = entry.contentRect;
                    const nextState = this.#resolveCompactState(height);
                    if (nextState === this.#compactClassState) continue;
                    this.#compactClassState = nextState;
                    if (nextState === "compact") {
                        target.classList.remove("pre-compact-mode");
                        target.classList.add("compact-mode");
                    } else if (nextState === "pre-compact") {
                        target.classList.remove("compact-mode");
                        target.classList.add("pre-compact-mode");
                    } else {
                        target.classList.remove("pre-compact-mode");
                        target.classList.remove("compact-mode");
                    }
                    this.positionDirty = true;
                }
            });
            this._resizeObserver.observe(this.element);
        }
    }

    #resolveCompactState(rawHeight) {
        const height = Number(rawHeight);
        if (!Number.isFinite(height) || height < 90) return this.#compactClassState;
        const current = this.#compactClassState;
        if (current === "compact") {
            if (height > 152) return height < 165 ? "pre-compact" : "normal";
            return "compact";
        }
        if (current === "pre-compact") {
            if (height < 140) return "compact";
            if (height > 172) return "normal";
            return "pre-compact";
        }
        if (height < 145) return "compact";
        if (height < 165) return "pre-compact";
        return "normal";
    }

    _activateListeners(html) {
        if (!this.#tagMode) html.querySelector("#playlist-select").addEventListener("change", this._onPlaylistSelect.bind(this));
        html.querySelector("#track-select").addEventListener("change", this._onTrackSelect.bind(this));
        html.querySelector('input[name="volume"]').addEventListener("input", this._onVolumeChange.bind(this));
        html.querySelector('[data-action="toggle-mute"]').addEventListener("click", this.#onToggleMute.bind(this));
    }


    #getCombinedFilteredTracks() {
        let pool = [...game.wgtngmTags.allTracks];

        if (this.#includeTTRPG && ttrpgIntegration.isAvailable) {
            pool = pool.concat(ttrpgIntegration.tracks);
        }
        return filterTracksBySelection(
            pool,
            this.#tagSelection,
            (track) => (track.isTTRPG ? track.tags : game.wgtngmTags.getTags(track.path)),
            this.#matchMode
        );
    }

    static async #toggleTTRPG(event, target) {
        const app = game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance;
        if (!app) return;

        if (!ttrpgIntegration.active) {
            ui.notifications.warn("TTRPG Music module is not active or linked.");
            return;
        }

        app.#includeTTRPG = !app.#includeTTRPG;
        await game.settings.set("wgtgm-mini-player", "ttrpgSourceEnabled", app.#includeTTRPG);
        await app.#updateTagPlaylist();
        app.render();
    }

    syncState() {
        this.render();
    }

    async #updateTagPlaylist() {
        this.dontUpdate = true;
        try {
            const filteredTracks = this.#getCombinedFilteredTracks();
            const sortedFiltered = filteredTracks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            const MAX_TRACKS = game.settings.get("wgtgm-mini-player", "maxTrackCount");
            const limitedTracks = sortedFiltered.slice(0, MAX_TRACKS);

            const crossfadeBaseDuration = game.settings.get("wgtgm-mini-player", "crossfade") * 1000;
            const enableCrossfade = game.settings.get("wgtgm-mini-player", "enable-crossfade");
            const fadeDuration = enableCrossfade ? crossfadeBaseDuration : 1;

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
                if (playlist.fade !== fadeDuration) {
                    await playlist.update({ fade: fadeDuration });
                }
            }

            const shouldLoop = game.settings.get("wgtgm-mini-player", "set-music-to-loop");

            const validPaths = new Set();

            limitedTracks.forEach(t => {
                if (t.isTTRPG) {
                    validPaths.add(ttrpgIntegration.getPath(t, shouldLoop));
                } else {
                    validPaths.add(t.path);
                }
            });

            const soundsToDelete = [];

            for (const sound of playlist.sounds) {
                // Never delete currently playing sounds during filter updates.
                // This prevents tag filtering from interrupting live playback.
                if (sound.playing) {
                    continue;
                }
                if (!validPaths.has(sound.path)) {
                    soundsToDelete.push(sound.id);
                }
            }

            if (soundsToDelete.length > 0) {
                await playlist.deleteEmbeddedDocuments("PlaylistSound", soundsToDelete);
            }

            const existingPaths = new Set(playlist.sounds.map(s => s.path));
            const soundsToAdd = [];

            for (const track of limitedTracks) {
                let finalPath;
                if (track.isTTRPG) {
                    finalPath = ttrpgIntegration.getPath(track, shouldLoop);
                } else {
                    finalPath = track.path;
                }

                if (!existingPaths.has(finalPath)) {
                    soundsToAdd.push({
                        name: track.name,
                        path: finalPath,
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
        finally {
            this.dontUpdate = false;
        }
    }


    _updateTimestamps() {
        if (!this.element) return;
        if (document.hidden || this.minimized) return;

        if (this.positionDirty) {
            this.positionDirty = false;
            this.#saveWindowDimensionsIfAllowed();
        }

        const playlist = game.playlists.get(this.#currentPlaylist?.id);
        const sound = playlist?.sounds.get(this.#currentTrack?.id);
        const currentTrackId = this.#currentTrack?.id ?? null;
        const currentTimeEl = this.element.querySelector(".wgtngm-current-time");
        const durationTimeEl = this.element.querySelector(".wgtngm-duration-time");
        const liveCurrent = sound?.sound?.currentTime;
        const liveDuration = sound?.sound?.duration;
        const pausedTime = sound?.pausedTime;
        const hasLiveTime = Number.isFinite(liveCurrent) && Number.isFinite(liveDuration);
        const hasPausedTime = Number.isFinite(pausedTime);

        if (hasLiveTime) {
            const displayCurrent = hasPausedTime && !sound.playing ? pausedTime : liveCurrent;
            currentTimeEl.textContent = formatTimestamp(displayCurrent);
            durationTimeEl.textContent = formatTimestamp(liveDuration);
            this.#lastTimestamp = { trackId: currentTrackId, current: displayCurrent, duration: liveDuration };
            return;
        }

        if (hasPausedTime) {
            const fallbackDuration = Number.isFinite(liveDuration)
                ? liveDuration
                : (this.#lastTimestamp.trackId === currentTrackId ? this.#lastTimestamp.duration : 0);
            currentTimeEl.textContent = formatTimestamp(pausedTime);
            durationTimeEl.textContent = formatTimestamp(fallbackDuration);
            this.#lastTimestamp = { trackId: currentTrackId, current: pausedTime, duration: fallbackDuration };
            return;
        }

        if (this.#lastTimestamp.trackId === currentTrackId && Number.isFinite(this.#lastTimestamp.duration) && this.#lastTimestamp.duration > 0) {
            currentTimeEl.textContent = formatTimestamp(this.#lastTimestamp.current);
            durationTimeEl.textContent = formatTimestamp(this.#lastTimestamp.duration);
            return;
        }

        currentTimeEl.textContent = "00:00";
        durationTimeEl.textContent = "00:00";
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
        if (!this.hasFrame) return frame;
        const dockedState = game.settings.get(MODULE_NAME, "dockSidebar") ? "window-maximize" : "right-to-bracket";
        const dockLeftState = this.#dockLeft ? "active" : "";

        const copyId = `
        <button type="button" class="header-control fa-solid fa-filter icon" data-action="create-taglist"
                data-tooltip="${game.i18n.localize(`${MODULE_NAME}.ui.createTagPlaylist`)}" aria-label="${game.i18n.localize(`${MODULE_NAME}.ui.createTagPlaylist`)}"></button>
        <button type="button" class="header-control fa-solid fa-tag icon" data-action="edit-taglist"
                data-tooltip="${game.i18n.localize(`${MODULE_NAME}.ui.editTags`)}" aria-label="${game.i18n.localize(`${MODULE_NAME}.ui.editTags`)}"></button>
        <button type="button" class="header-control fa-solid fa-rotate-right icon" data-action="rescan-library"
                data-tooltip="${game.i18n.localize(`${MODULE_NAME}.ui.rescanLibrary`)}" aria-label="${game.i18n.localize(`${MODULE_NAME}.ui.rescanLibrary`)}"></button>
        <button type="button" class="header-control fa-solid fa-border-all icon" data-action="open-soundboard"
                data-tooltip="${game.i18n.localize(`${MODULE_NAME}.ui.openSoundboard`)}" aria-label="${game.i18n.localize(`${MODULE_NAME}.ui.openSoundboard`)}"></button>
        <button type="button" class="header-control fa-solid fa-tags icon ${this.#tagMode}" data-action="toggle-tag-mode"
                data-tooltip="${game.i18n.localize(`${MODULE_NAME}.ui.toggleTagMode`)}" aria-label="${game.i18n.localize(`${MODULE_NAME}.ui.toggleTagMode`)}"></button>
      <button type="button" class="header-control fa-solid fa-${dockedState} icon" data-action="set-dock"
              data-tooltip="${game.i18n.localize(`${MODULE_NAME}.ui.toggleDock`)}" aria-label="${game.i18n.localize(`${MODULE_NAME}.ui.toggleDock`)}"></button>
      <button type="button" class="header-control fa-solid fa-left-to-bracket icon ${dockLeftState}" data-action="set-dock-left"
              data-tooltip="Toggle left dock" aria-label="Toggle left dock"></button>`
        this.window.close.insertAdjacentHTML("beforebegin", copyId);
        return frame;
    }


    static async #_toggleDock(event, target) {
        const dockedState = game.settings.get(MODULE_NAME, "dockSidebar");
        if (!dockedState) {
            this.#saveWindowDimensionsIfAllowed();
            await game.settings.set(MODULE_NAME, "dockLeft", false);
            await game.settings.set(MODULE_NAME, "dockLeftCollapsed", false);
            this.#dockLeft = false;
            this.#dockLeftCollapsed = false;
            const leftDockBtn = this.element?.querySelector('[data-action="set-dock-left"]');
            if (leftDockBtn) leftDockBtn.classList.remove("active");
        }
        await game.settings.set(MODULE_NAME, "dockSidebar", !dockedState);
        target.classList.toggle("fa-window-maximize", !dockedState);
        target.classList.toggle("fa-right-to-bracket", dockedState);
        this.render(true);
    }

    static async #_toggleDockLeft(event, target) {
        const wasSideDocked = game.settings.get(MODULE_NAME, "dockSidebar");
        this.#dockLeft = !this.#dockLeft;
        if (this.#dockLeft) {
            const saved = game.settings.get(MODULE_NAME, "mpSheetDimensions") || {};
            const rect = this.element?.getBoundingClientRect?.();
            const liveWidth = Number.isFinite(rect?.width) && rect.width > 0 ? Math.round(rect.width) : null;
            const liveHeight = Number.isFinite(rect?.height) && rect.height > 0 ? Math.round(rect.height) : null;
            const currentWidth = liveWidth ?? (Number.isFinite(this.position?.width) && this.position.width > 0 ? this.position.width : null);
            const currentHeight = liveHeight ?? (Number.isFinite(this.position?.height) && this.position.height > 0 ? this.position.height : null);
            const savedWidth = Number.isFinite(saved.width) && saved.width > 0 ? saved.width : null;
            const savedHeight = Number.isFinite(saved.height) && saved.height > 0 ? saved.height : null;
            const targetWidth = wasSideDocked ? (savedWidth ?? currentWidth) : (currentWidth ?? savedWidth);
            const targetHeight = wasSideDocked ? (savedHeight ?? currentHeight) : (currentHeight ?? savedHeight);
            if (Number.isFinite(targetWidth) && Number.isFinite(targetHeight)) {
                this.#pendingDockLeftDimensions = { width: targetWidth, height: targetHeight };
            } else {
                this.#pendingDockLeftDimensions = null;
            }
            this.#dockLeftTop = Number.isFinite(this.position?.top) ? Math.max(0, Math.round(this.position.top)) : this.#dockLeftTop;
            await game.settings.set(MODULE_NAME, "dockLeftTop", this.#dockLeftTop);
            this.#dockLeftCollapsed = false;
            await game.settings.set(MODULE_NAME, "dockLeftCollapsed", false);
            await game.settings.set(MODULE_NAME, "dockSidebar", false);
            const sideDockBtn = this.element?.querySelector('[data-action="set-dock"]');
            if (sideDockBtn) {
                sideDockBtn.classList.remove("fa-window-maximize");
                sideDockBtn.classList.add("fa-right-to-bracket");
            }
        } else {
            this.#dockLeftCollapsed = false;
            await game.settings.set(MODULE_NAME, "dockLeftCollapsed", false);
        }
        await game.settings.set(MODULE_NAME, "dockLeft", this.#dockLeft);
        target.classList.toggle("active", this.#dockLeft);
        this.render(true);
    }

    #applyDockLeftState() {
        if (!this.element) return;
        this.element.classList.toggle("collapsed", this.#dockLeft && this.#dockLeftCollapsed);

        if (!this.#dockLeft) return;
        let handle = this.element.querySelector(".wgtngm-mp-dock-handle");
        if (!handle) {
            handle = document.createElement("button");
            handle.type = "button";
            handle.className = "wgtngm-mp-dock-handle";
            handle.dataset.action = "toggle-dock-left-panel";
            this.element.appendChild(handle);
        }
        handle.title = this.#dockLeftCollapsed ? "Expand mini player" : "Collapse mini player";
        handle.setAttribute("aria-label", handle.title);
        handle.innerHTML = `<i class="fas fa-chevron-${this.#dockLeftCollapsed ? "right" : "left"}"></i>`;
    }

    static async #_toggleDockLeftPanel() {
        if (!this.#dockLeft) return;
        this.#dockLeftCollapsed = !this.#dockLeftCollapsed;
        await game.settings.set(MODULE_NAME, "dockLeftCollapsed", this.#dockLeftCollapsed);
        this.#applyDockLeftState();
    }

    static async #rescanLibrary() {
        await game.wgtngmTags.scanLibrary({ force: true });
        if (this.#tagMode) {
            await this.#updateTagPlaylist();
        }
        ui.notifications.info(game.i18n.localize(`${MODULE_NAME}.ui.rescanComplete`));
        this.render(true);
    }

    static #editTagList(event) {
        new TagEditor().render(true);
    }

    static #createTaglist(event) {
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

    #crossFadeLength() {
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
        if (!sound) return;
        if (sound.playing) {
            const pausedTime = this.#safePausedTime(sound?.sound?.currentTime, sound.pausedTime);
            await sound.update({ playing: false, pausedTime });
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

    static async #setLoop(event) {
        const targetSound =
            this.#currentTrack ??
            game.playlists.playing.find((p) => p.sounds.some((s) => s.playing))?.sounds.find((s) => s.playing);
        if (!targetSound) return;
        await targetSound.update({ repeat: !targetSound.repeat });
        const drawer = event.target;
        if (!drawer) return;
        if (!targetSound.repeat) { drawer.classList.remove("open"); }
        else {
            drawer.classList.add("open");
        }
        this.render();
    }

    static async #setFavorite(event) {
        const targetSound =
            this.#currentTrack ??
            game.playlists.playing.find((p) => p.sounds.some((s) => s.playing))?.sounds.find((s) => s.playing);

        if (!targetSound) {
            ui.notifications.warn(game.i18n.localize(`${MODULE_NAME}.ui.noTrackSelectedToFavorite`));
            return;
        }

        let favoritesPlaylist = game.playlists.find(p => p.name === FAVORITES_PLAYLIST_NAME);

        if (!favoritesPlaylist) {
            try {
                favoritesPlaylist = await Playlist.create({
                    name: FAVORITES_PLAYLIST_NAME,
                    mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
                });
                ui.notifications.info(game.i18n.localize(`${MODULE_NAME}.ui.favoritesCreated`));
            } catch (err) {
                console.error("Mini Player | Failed to create favorites playlist", err);
                ui.notifications.error(game.i18n.localize(`${MODULE_NAME}.ui.favoritesCreateFailed`));
                return;
            }
        }


        const existingSound = favoritesPlaylist.sounds.find(s => s.path === targetSound.path);

        try {
            if (existingSound) {
                await favoritesPlaylist.deleteEmbeddedDocuments("PlaylistSound", [existingSound.id]);
                ui.notifications.info(game.i18n.format(`${MODULE_NAME}.ui.favoriteRemoved`, { name: targetSound.name }));
            } else {
                const soundData = {
                    name: targetSound.name,
                    path: targetSound.path,
                    repeat: false,
                    volume: targetSound.volume,
                    flags: { ...targetSound.flags }
                };
                await favoritesPlaylist.createEmbeddedDocuments("PlaylistSound", [soundData]);
                ui.notifications.info(game.i18n.format(`${MODULE_NAME}.ui.favoriteAdded`, { name: targetSound.name }));
            }
        } catch (err) {
            console.error("Mini Player | Failed to update favorites playlist", err);
            ui.notifications.error(game.i18n.localize(`${MODULE_NAME}.ui.favoritesUpdateFailed`));
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
            await this.#currentPlaylist.playNext(null);
            const playingSound = this.#currentPlaylist.sounds.find(s => s.playing);
            this.#currentTrack = playingSound;
        }
    }

    static async #onPreviousTrack(event) {
        if (this.#currentPlaylist) {
            await this.#currentPlaylist.playNext(null, {
                direction: -1,
            });
            const playingSound = this.#currentPlaylist.sounds.find(s => s.playing);
            this.#currentTrack = playingSound;
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
