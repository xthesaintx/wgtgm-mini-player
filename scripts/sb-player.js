import { MODULE_NAME } from "./settings.js";

var ApplicationV2 = foundry.applications.api.ApplicationV2;
var HandlebarsApplicationMixin = foundry.applications.api.HandlebarsApplicationMixin;
const wgtngmsb = HandlebarsApplicationMixin((ApplicationV2));

export class wgtngmSoundboardSheet extends wgtngmsb {
    static SCOPE = "wgtngmSoundboard";
    static DEFAULT_OPTIONS = {
        id: "wgtngmSoundboardSheet",
        classes: ["wgtngmSoundboard"],
        tag: 'div',
        window: {
            frame: true,
            title: 'Soundboard',
            icon: 'fas fa-border-all',
            minimizable: true,
            resizable: true,
            zIndex: 10,
        },
        actions: {
            "remove-image": this.#onRemoveImage,
            "toggle-resize": this.#onToggleResize,
            "toggle-filter": this.#onToggleFilter,
            "mute-all": this.#onMuteAll,
            "set-dock-sb": this.#onToggleDockMode,
            "toggle-dock-panel": this.#onToggleDockPanel,
            "fadeSounds": this.#fadeSoundsToggle,
            "multiSounds": this.#multiSoundsToggle,
            "sb-click":{
                handler: this.#sbClick,
                buttons: [0,2]
            },
        },
    };

    #currentPlaylistId = game.settings.get(MODULE_NAME, "sbLastPlaylistId") || null;
    #playlists = null;
    #showEnvironmentOnly = false;
    #resizeAuto = game.settings.get(MODULE_NAME, "sbResizeAuto") ?? true;
    #isMuted = false;
    #isFade = game.settings.get("wgtgm-mini-player", "enable-sb-crossfade");
    #isNotMulti = game.settings.get("wgtgm-mini-player", "stop-on-new-soundboard");
    #isSnapping = true;
    #isGM = game.user.isGM;
    #dockMode = game.settings.get(MODULE_NAME, "sbDockMode") ?? false;
    #dockCollapsed = game.settings.get(MODULE_NAME, "sbDockCollapsed") ?? false;
    #dockTop = Number(game.settings.get(MODULE_NAME, "sbDockTop")) || 96;
    #dockTopSaveTimeout = null;
    #autoResizeInProgress = false;
    #pendingAutoResize = false;
    #isUserResizing = false;
    #pointerDownHandler = null;
    #pointerUpHandler = null;
    static PARTS = {
        main: {
            template: "modules/wgtgm-mini-player/templates/wgtgm-soundboard.hbs",
        }
    };

    async minimize() {
        if (this.#dockMode) {
            this.#dockCollapsed = !this.#dockCollapsed;
            await game.settings.set(MODULE_NAME, "sbDockCollapsed", this.#dockCollapsed);
            this.#applyDockState();
            return this;
        }
        return super.minimize();
    }

    // async maximize() {
    //     if (this.#dockMode) {
    //         this.#dockCollapsed = false;
    //         await game.settings.set(MODULE_NAME, "sbDockCollapsed", false);
    //         this.#applyDockState();
    //         return this;
    //     }
    //     return super.maximize();
    // }

    setPosition(options = {}) {
        const position = super.setPosition(options);
        if (this.#dockMode && Number.isFinite(position?.top)) {
            const nextTop = Math.max(0, Math.round(position.top));
            if (nextTop !== this.#dockTop) {
                this.#dockTop = nextTop;
                if (this.#dockTopSaveTimeout) clearTimeout(this.#dockTopSaveTimeout);
                this.#dockTopSaveTimeout = setTimeout(() => {
                    this.#dockTopSaveTimeout = null;
                    game.settings.set(MODULE_NAME, "sbDockTop", this.#dockTop);
                }, 120);
            }
        }
        return position;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.isNotMulti = this.#isNotMulti;
        context.isFade = this.#isFade;
        
        let playlists = game.playlists.filter(p => p.mode === CONST.PLAYLIST_MODES.DISABLED);
        playlists = playlists.filter(p => p.sounds.size > 0);
        
        if (this.#showEnvironmentOnly) {
            playlists = playlists.filter(p => p.channel === "environment");
        }
        
        this.#playlists = playlists;
        
        let playlistIdChanged = false;
        if (this.#currentPlaylistId && !playlists.some(p => p.id === this.#currentPlaylistId)) {
            this.#currentPlaylistId = null;
            playlistIdChanged = true;
        }
        if (!this.#currentPlaylistId && playlists.length > 0) {
            this.#currentPlaylistId = playlists[0].id;
            playlistIdChanged = true;
        }
        if (playlistIdChanged) {
            await game.settings.set(MODULE_NAME, "sbLastPlaylistId", this.#currentPlaylistId ?? "");
        }

        context.playlists = playlists.map(p => {
            const sounds = p.playbackOrder.map(soundId => { 
                const sound = p.sounds.get(soundId); 
                if (!sound) return null; 

                const image = sound.getFlag("wgtgm-mini-player", "image") || "";
                return {
                    id: sound.id,
                    name: sound.name,
                    playing: sound.playing,
                    image: image && image !== "" ? image : null,
                };
            }).filter(Boolean);

            return { 
                id: p.id, 
                name: p.name, 
                playing: p.playing,
                sounds: sounds 
            };
        });

        context.isMuted = this.#isMuted;
        context.isGM = this.#isGM;
        context.showEnvironmentOnly = this.#showEnvironmentOnly;
        context.resizeAuto = this.#resizeAuto;
        context.currentPlaylistId = this.#currentPlaylistId;
        return context;
    }

    async _onPlaylistSelect(event) {
        this.#currentPlaylistId = event.currentTarget.value;
        await game.settings.set(MODULE_NAME, "sbLastPlaylistId", this.#currentPlaylistId ?? "");

        const grids = this.element.querySelectorAll(".soundboard-grid");
        grids.forEach(g => g.style.display = "none");

        const activeGrid = this.element.querySelector(`.soundboard-grid[data-playlist-id="${this.#currentPlaylistId}"]`);
        if (activeGrid) {
            activeGrid.style.display = "grid";
        }

        this._resizeWindow();
    }

    async close(options) {
        if (this.element) {
            this.element.style.setProperty("display", "none", "important");
        }
        this._resizeObserver?.disconnect();
        if (this.#pointerDownHandler) {
            document.removeEventListener("pointerdown", this.#pointerDownHandler);
            this.#pointerDownHandler = null;
        }
        if (this.#pointerUpHandler) {
            document.removeEventListener("pointerup", this.#pointerUpHandler);
            this.#pointerUpHandler = null;
        }
        const {width, height, left, top} = this.position;
        game.settings.set("wgtgm-mini-player", "sbSheetDimensions", {width, height, left, top });
        game.settings.set(MODULE_NAME, "sbDockCollapsed", this.#dockCollapsed);
        if (this.#dockTopSaveTimeout) {
            clearTimeout(this.#dockTopSaveTimeout);
            this.#dockTopSaveTimeout = null;
        }
        const currentStates = game.settings.get("wgtgm-mini-player", "mpSbOpened");
        game.settings.set("wgtgm-mini-player", "mpSbOpened", { ...currentStates, sb: false });        
        return super.close(options);
    }

    async _onFirstRender(context, options) {
        const currentStates = game.settings.get("wgtgm-mini-player", "mpSbOpened");
        game.settings.set("wgtgm-mini-player", "mpSbOpened", { ...currentStates, sb: true });
        
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this.#dockMode = game.settings.get(MODULE_NAME, "sbDockMode") ?? this.#dockMode;
        this.#dockCollapsed = game.settings.get(MODULE_NAME, "sbDockCollapsed") ?? this.#dockCollapsed;
        this.#dockTop = Number(game.settings.get(MODULE_NAME, "sbDockTop")) || this.#dockTop;
        this.#applyDockState();
        this._resizeWindow();
        this._activateListeners(this.element);
        if (!this.#pointerDownHandler) {
            this.#pointerDownHandler = () => {
                this.#isUserResizing = true;
            };
            document.addEventListener("pointerdown", this.#pointerDownHandler);
        }
        if (!this.#pointerUpHandler) {
            this.#pointerUpHandler = () => {
                const hadResizeInteraction = this.#isUserResizing || this.#pendingAutoResize;
                this.#isUserResizing = false;
                if (!hadResizeInteraction) return;
                if (this.#resizeAuto && this.#pendingAutoResize) {
                    this.#pendingAutoResize = false;
                    this._resizeWindow();
                }
            };
            document.addEventListener("pointerup", this.#pointerUpHandler);
        }
        this._resizeObserver?.disconnect();
        const debouncedSave = foundry.utils.debounce((width, height) => {
            const saved = game.settings.get(MODULE_NAME, "sbSheetDimensions") || {};
            const left = this.#dockMode
                ? 0
                : (Number.isFinite(this.position?.left) ? this.position.left : (Number.isFinite(saved.left) ? saved.left : 40));
            const top = this.#dockMode
                ? this.#dockTop
                : ((Number.isFinite(this.position?.top) && this.position.top > 0)
                    ? this.position.top
                    : (Number.isFinite(saved.top) ? saved.top : 40));
            game.settings.set("wgtgm-mini-player", "sbSheetDimensions", {width, height, left, top });
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
                if (this.#dockMode) {
                    // Foundry resize writes can clear inline !important styles;
                    // force dock anchors each resize tick to prevent vertical jump.
                    if (!target?.isConnected) continue;
                    target.style.setProperty("left", "0px", "important");
                    target.style.setProperty("top", `${this.#dockTop}px`, "important");
                }
                if (this.#resizeAuto && !this.#autoResizeInProgress) {
                    this.#pendingAutoResize = true;
                }
                debouncedSave(width, height);
            }
        });
        this._resizeObserver.observe(this.element);
    }

    _activateListeners(html) {
        html.querySelector('#playlist-select').addEventListener('change', this._onPlaylistSelect.bind(this));
    }


    _resizeWindow(){
        const playlist = game.playlists.get(this.#currentPlaylistId);
            if (this.#resizeAuto && playlist) {
                this.#pendingAutoResize = false;
                const trackCount = playlist.sounds.size;

                const buttonSize = 64; 
                const gap = 5; 
                const headerHeight = 74; 
                const horizontalPadding = 20;
                const saved = game.settings.get(MODULE_NAME, "sbSheetDimensions") || {};
                const currentLeft = this.#dockMode
                    ? 0
                    : (Number.isFinite(this.position?.left)
                    ? this.position.left
                    : (Number.isFinite(saved.left) ? saved.left : 40));
                const currentTop = this.#dockMode
                    ? this.#dockTop
                    : (Number.isFinite(this.position?.top) && this.position.top > 0
                    ? this.position.top
                    : (Number.isFinite(saved.top) ? saved.top : 40));
                const currentWidth = Number.isFinite(this.position?.width) && this.position.width > 0
                    ? this.position.width
                    : (Number.isFinite(saved.width) ? saved.width : 240);
                const maxAutoWidth = (Math.max(1, trackCount) * buttonSize) + ((Math.max(1, trackCount) - 1) * gap) + horizontalPadding;
                const enforceSingleRowMax = game.settings.get(MODULE_NAME, "sbAutoMaxSingleRow");
                const clampedWidth = enforceSingleRowMax ? Math.min(currentWidth, maxAutoWidth) : currentWidth;

                const usableWidth = Math.max(1, clampedWidth - horizontalPadding);
                const columns = Math.max(1, Math.min(trackCount || 1, Math.floor((usableWidth + gap) / (buttonSize + gap))));
                const rows = Math.max(1, Math.ceil((trackCount || 1) / columns));
                const newHeight = headerHeight + (rows * buttonSize) + ((rows - 1) * gap);

                this.#autoResizeInProgress = true;
                this.setPosition({
                    left: currentLeft,
                    top: currentTop,
                    height: newHeight,
                    width: clampedWidth
                });
                this.#autoResizeInProgress = false;
                game.settings.set("wgtgm-mini-player", "sbSheetDimensions", {
                    width: clampedWidth,
                    height: newHeight,
                    left: currentLeft,
                    top: currentTop
                });
            }
    }

    async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        if (!this.hasFrame) return frame;
        const dockIcon = this.#dockMode ? "window-maximize" : "left-to-bracket";
        const copyId = `
        <button type="button" class="header-control fa-solid fa-${dockIcon} icon" data-action="set-dock-sb"
                data-tooltip="Toggle left dock mode" aria-label="Toggle left dock mode"></button>
      `;
        this.window.close.insertAdjacentHTML("beforebegin", copyId);
        return frame;
    }

    #applyDockState() {
        if (!this.element) return;
        this.element.classList.toggle("docked-left", this.#dockMode);
        this.element.classList.toggle("collapsed", this.#dockMode && this.#dockCollapsed);
        if (this.#dockMode) {
            this.element.style.setProperty("top", `${this.#dockTop}px`, "important");
        }

        const existingHandle = this.element.querySelector(".wgtngm-sb-dock-handle");
        if (!this.#dockMode) {
            if (existingHandle) existingHandle.remove();
            return;
        }

        if (!existingHandle) {
            const handle = document.createElement("button");
            handle.type = "button";
            handle.className = "wgtngm-sb-dock-handle";
            handle.dataset.action = "toggle-dock-panel";
            this.element.appendChild(handle);
        }

        const handle = this.element.querySelector(".wgtngm-sb-dock-handle");
        if (handle) {
            handle.title = this.#dockCollapsed ? "Expand soundboard" : "Collapse soundboard";
            handle.setAttribute("aria-label", handle.title);
            handle.innerHTML = `<i class="fas fa-chevron-${this.#dockCollapsed ? "right" : "left"}"></i>`;
        }
    }


async _onSoundClick(event, target) {
    if (!event.target.dataset.soundId) return;
    const soundId = event.target.dataset.soundId;

    const playlist = game.playlists.get(this.#currentPlaylistId);
    const sound = playlist?.sounds.get(soundId);
    if (!sound) return;

    if (sound.playing) {
        await sound.update({ playing: false });
        target.classList.remove('playing');
    } else {
            const playlists = this.#playlists;
            if (this.#isNotMulti) {
                const playingAndEnabledPlaylists = playlists.filter((p) => p.playing);
                for (const p of playingAndEnabledPlaylists) {
                    await p.stopAll();
                }
            }
            await playlist.playSound(sound);
    }
}


_onSoundRightClick(event, target) {
    event.preventDefault();
    if (!event.target.dataset.soundId) return;
    const soundId = event.target.dataset.soundId;
    const playlist = game.playlists.get(this.#currentPlaylistId);
    const sound = playlist?.sounds.get(soundId);
    if (!sound) return;


    const current = sound.getFlag("wgtgm-mini-player", "image") || "";
    const fp = new foundry.applications.apps.FilePicker.implementation({
        type: "image",
        current: current,
        callback: async (path) => {
            try {
                await sound.setFlag("wgtgm-mini-player", "image", path);
                this.render(false);
            } catch (error) {
                console.error("Failed to update image:", error);
                ui.notifications.error("Failed to update image");
            }
        },
        top: this.position.top + 40,
        left: this.position.left + 10,
    });
    return fp.browse();
    }

static #sbClick(event, target){
    if (event?.type === "contextmenu"){
      this._onSoundRightClick(event, target);
    } else {
      this._onSoundClick(event, target);
    }
}

static #onToggleResize(event, target) {
    this.#resizeAuto = !this.#resizeAuto;
    game.settings.set(MODULE_NAME, "sbResizeAuto", this.#resizeAuto);
    const button = target || event?.currentTarget;
    if (button) {
        button.classList.toggle("active", this.#resizeAuto);
        button.title = `Auto Size ${this.#resizeAuto ? "On" : "Off"}`;
        button.setAttribute("aria-label", button.title);
    }

    if (this.#resizeAuto) {
        this._resizeWindow();
    }

    if (this.position) {
        const { width, height, left, top } = this.position;
        game.settings.set("wgtgm-mini-player", "sbSheetDimensions", { width, height, left, top });
    }
}

static async #onToggleDockMode(event, target) {
    this.#dockMode = !this.#dockMode;
    if (this.#dockMode) {
        const currentTop = Number(this.position?.top);
        this.#dockTop = Number.isFinite(currentTop) ? Math.max(0, Math.round(currentTop)) : this.#dockTop;
        await game.settings.set(MODULE_NAME, "sbDockTop", this.#dockTop);
    }
    if (!this.#dockMode) {
        if (this.element) {
            this.element.style.removeProperty("left");
            this.element.style.removeProperty("top");
        }
        this.#dockCollapsed = false;
        await game.settings.set(MODULE_NAME, "sbDockCollapsed", false);
        const saved = game.settings.get(MODULE_NAME, "sbSheetDimensions");
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
            this.setPosition(saved);
        }
    }
    await game.settings.set(MODULE_NAME, "sbDockMode", this.#dockMode);
    target.classList.toggle("fa-window-maximize", this.#dockMode);
    target.classList.toggle("fa-left-to-bracket", !this.#dockMode);
    this.render(true);
}

static async #onToggleDockPanel() {
    if (!this.#dockMode) return;
    this.#dockCollapsed = !this.#dockCollapsed;
    await game.settings.set(MODULE_NAME, "sbDockCollapsed", this.#dockCollapsed);
    this.#applyDockState();
}

static #fadeSoundsToggle(event, target) {
    const currentIsFade = game.settings.get("wgtgm-mini-player", "enable-sb-crossfade");
    this.#isFade = !currentIsFade;
    game.settings.set("wgtgm-mini-player", "enable-sb-crossfade", this.#isFade);
    target.classList.toggle('fade', this.#isFade);
    const sbCrossfadeEnabled = game.settings.get("wgtgm-mini-player", "enable-sb-crossfade");
    const crossfadeBaseDuration = game.settings.get("wgtgm-mini-player", "crossfade") * 1000;
    const finalCrossfadeDuration = sbCrossfadeEnabled ? crossfadeBaseDuration : 1;
    for (const p of this.#playlists) {
            p.update({ fade: finalCrossfadeDuration });
    }
}

static #multiSoundsToggle(event, target) {
    const currentMulti = game.settings.get("wgtgm-mini-player", "stop-on-new-soundboard");
    this.#isNotMulti = !currentMulti;
    game.settings.set("wgtgm-mini-player", "stop-on-new-soundboard", this.#isNotMulti);
    target.classList.toggle('nomulti', this.#isNotMulti);
}

static #onToggleFilter(event) {
    this.#showEnvironmentOnly = !this.#showEnvironmentOnly;
    this.render();
}

static async #onRemoveImage(event){
    if (!event.target.dataset.soundId) return;
    const soundId = event.target.dataset.soundId;
    event.preventDefault();
    const playlist = game.playlists.get(this.#currentPlaylistId);
    const sound = playlist?.sounds.get(soundId);
    if (!sound) return;
    await sound.setFlag("wgtgm-mini-player", "image", null);
    this.render()
  }


static #onMuteAll(event,target) {
    const playlist = game.playlists.get(this.#currentPlaylistId);
    if (!playlist) return;

    if (this.#isMuted) {
        for (const sound of playlist.sounds) {
            if (sound.playing) {
                let previousVolume = sound?.getFlag("wgtgm-mini-player", "volume") || 0.5;

                if (previousVolume === 0) {
                    previousVolume = 0.5;
                }
                
                sound.update({ volume: previousVolume });
            }
        }
    } else {
        for (const sound of playlist.sounds) {
            if (sound.playing) {
                sound.setFlag("wgtgm-mini-player", "volume", sound.volume);
                sound.update({ volume: 0 });
            }
        }
    }
    this.#isMuted = !this.#isMuted;
    target.classList.toggle('fa-volume-mute', this.#isMuted);
    target.classList.toggle('fa-volume-high', !this.#isMuted);

}

}
