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
            "sb-click":{
                handler: this.#sbClick,
                buttons: [0,2]
            },
        },
    };

    #currentPlaylistId = null;
    #showEnvironmentOnly = false;
    #resizeAuto = true;
    #isMuted = false;
    #isSnapping = true;
    #isGM = game.user.isGM;
    static PARTS = {
        main: {
            template: "modules/wgtgm-mini-player/templates/wgtgm-soundboard.hbs",
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        let playlists = game.playlists.filter(p => p.mode === CONST.PLAYLIST_MODES.DISABLED);
        playlists = playlists.filter(p => p.sounds.size > 0);
        if (this.#showEnvironmentOnly) {
            playlists = playlists.filter(p => p.channel === "environment");
        }
        if (this.#currentPlaylistId && !playlists.some(p => p.id === this.#currentPlaylistId)) {
            this.#currentPlaylistId = null;
        }
        if (!this.#currentPlaylistId && playlists.length > 0) {
            this.#currentPlaylistId = playlists[0].id;
        }
        context.playlists = playlists.map(p => ({ id: p.id, name: p.name, playing: p.playing }));
        const currentPlaylist = playlists.find(p => p.id === this.#currentPlaylistId);
        if (currentPlaylist) {
            context.sounds = currentPlaylist.sounds.map(sound => {
                const image = sound.getFlag("wgtgm-mini-player", "image") || "";
                return {
                    id: sound.id,
                    name: sound.name,
                    playing: sound.playing,
                    image: image && image !== "" ? image : null,
                };
            });
        } else {
            context.sounds = [];
        }

        context.isMuted = this.#isMuted;
        context.isGM = this.#isGM;
        context.showEnvironmentOnly = this.#showEnvironmentOnly;
        context.resizeAuto = this.#resizeAuto;
        context.currentPlaylistId = this.#currentPlaylistId;
        return context;
    }

    async close(options) {
        const {width, height, left, top} = this.position;
        game.settings.set("wgtgm-mini-player", "sbSheetDimensions", {width, height, left, top });
        const currentStates = game.settings.get("wgtgm-mini-player", "mpSbOpened");
        game.settings.set("wgtgm-mini-player", "mpSbOpened", { ...currentStates, sb: false });        
        this._resizeObserver?.disconnect();
        return super.close(options);
    }

    async _onFirstRender(context, options) {
        const currentStates = game.settings.get("wgtgm-mini-player", "mpSbOpened");
        game.settings.set("wgtgm-mini-player", "mpSbOpened", { ...currentStates, sb: true });
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        this._resizeWindow();
        this._activateListeners(this.element);
        const debouncedSave = foundry.utils.debounce((width, height) => {
            const { left, top } = this.position;
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
                const trackCount = playlist.sounds.size;

                const buttonSize = 64; 
                const gap = 5; 
                const headerHeight = 74; 
                const horizontalPadding = 20;

                let columns;
                let rows;

                if (trackCount <= 3) {
                    columns = 3;
                    rows = 1;}
                else if (trackCount <= 6) {
                    columns = 3;
                    rows = 2;
                } else if (trackCount <= 9) {
                    columns = 3;
                    rows = 3;
                } else if (trackCount <= 12) {
                    columns = 4;
                    rows = 3;
                } else if (trackCount <= 16) {
                    columns = 4;
                    rows = 4;
                } else if (trackCount <= 20) {
                    columns = 5;
                    rows = 4;
                } else if (trackCount <= 25) {
                    columns = 5;
                    rows = 5;
                } else if (trackCount <= 30) {
                    columns = 6;
                    rows = 5;
                } else { // For more than 16 tracks
                    columns = 6;
                    rows = Math.ceil(trackCount / columns);
                }

                const newWidth = (columns * buttonSize) + ((columns - 1) * gap) + horizontalPadding;
                const newHeight = headerHeight + (rows * buttonSize) + ((rows - 1) * gap);

                this.setPosition({
                    height: newHeight,
                    width: newWidth
                });
            }
    }

async _onPlaylistSelect(event) {
        this.#currentPlaylistId = event.currentTarget.value;
        this.render();
    }


async _onSoundClick(event, target) {
    if (!event.target.dataset.soundId) return;
    const soundId = event.target.dataset.soundId;

    const playlist = game.playlists.get(this.#currentPlaylistId);
    console.log(this.#currentPlaylistId)
    const sound = playlist?.sounds.get(soundId);
    if (!sound) return;

    if (sound.playing) {
        await playlist.stopSound(sound);
    } else {
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


static #onToggleResize(event) {
    this.#resizeAuto = !this.#resizeAuto;
    this.render();
}

static #onToggleFilter(event) {
    this.#showEnvironmentOnly = !this.#showEnvironmentOnly;
    this.render();
}

static async #onRemoveImage(event){
    if (!event.target.dataset.soundId) return;
    const soundId = event.target.dataset.soundId;
    console.log(soundId);
    event.preventDefault();
    const playlist = game.playlists.get(this.#currentPlaylistId);
    const sound = playlist?.sounds.get(soundId);
    if (!sound) return;
    await sound.setFlag("wgtgm-mini-player", "image", null);
    this.render()
  }

// static #onRemoveImage(event){
//     this.document.setFlag("wgtgm-mini-player", "image", null);
//     this.render()
//   }

static #onMuteAll(event) {
    console.log(this.#isMuted);
    const playlist = game.playlists.get(this.#currentPlaylistId);
    if (!playlist) return;

    if (this.#isMuted) {
        for (const sound of playlist.sounds) {
            if (sound.playing) {
                // Restore the volume from the flag, defaulting to 0.5
                let previousVolume = sound?.getFlag("wgtgm-mini-player", "volume") || 0.5;

                // If the stored volume was 0 for some reason, restore to 0.5 anyway
                if (previousVolume === 0) {
                    previousVolume = 0.5;
                }
                
                sound.update({ volume: previousVolume });
            }
        }
    } else {
        // Mute all playing sounds and save their current volume
        for (const sound of playlist.sounds) {
            if (sound.playing) {
                sound.setFlag("wgtgm-mini-player", "volume", sound.volume);
                sound.update({ volume: 0 });
            }
        }
    }

    this.#isMuted = !this.#isMuted;
    this.render();
}

}