import { MODULE_NAME } from "./settings.js";
import { formatTrackName } from "./importer.js";
import { confirmationDialog } from "./helper.js";
import { ttrpgIntegration } from "./ttrpg.js"; 
import { filterTracksBySelection, sanitizeImportedTagData } from "./tag-utils.js";
const AUDIO_EXTENSIONS = new Set(Object.keys(CONST.AUDIO_FILE_EXTENSIONS).map(e => `.${e.toLowerCase()}`));
const FAVORITES_PLAYLIST_NAME = "favorites-miniPlayer";
const TAG_PLAYLIST_NAME = "taglist-miniPlayer";
const FilePicker = foundry.applications.apps.FilePicker.implementation;
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

async function playPreview(path, btnElement) {
    if (game.wgtngmPreviewSound) {
        const isSameTrack = game.wgtngmPreviewSound._previewPath === path;

        game.wgtngmPreviewSound.pause();
        game.wgtngmPreviewSound.onended = null;
        game.wgtngmPreviewSound = null;

        if (game.wgtngmPreviewBtn) {
            const icon = game.wgtngmPreviewBtn.querySelector("i");
            if (icon) {
                icon.classList.remove("fa-stop");
                icon.classList.add("fa-play");
            }
            game.wgtngmPreviewBtn = null;
        }

        if (isSameTrack) {
            if (btnElement) {
                const icon = btnElement.querySelector("i");
                if (icon) {
                    icon.classList.remove("fa-stop");
                    icon.classList.add("fa-play");
                }
            }
            return;
        }
    }

    const audio = new Audio(path);
    audio._previewPath = path;
    audio.volume = game.settings.get("core", "globalInterfaceVolume") ?? 0.5;

    try {
        await audio.play();
        game.wgtngmPreviewSound = audio;
        game.wgtngmPreviewBtn = btnElement;

        if (btnElement) {
            const icon = btnElement.querySelector("i");
            if (icon) {
                icon.classList.remove("fa-play");
                icon.classList.add("fa-stop");
            }
        }

        audio.onended = () => {
            if (game.wgtngmPreviewSound === audio) {
                game.wgtngmPreviewSound = null;
                if (game.wgtngmPreviewBtn) {
                    const icon = game.wgtngmPreviewBtn.querySelector("i");
                    if (icon) {
                        icon.classList.remove("fa-stop");
                        icon.classList.add("fa-play");
                    }
                    game.wgtngmPreviewBtn = null;
                }
            }
        };
    } catch (e) {
        console.warn("Mini Player | Preview failed", e);
        ui.notifications.warn("Could not play preview.");
    }
}

function stopPreviewPlayback() {
    if (game.wgtngmPreviewSound) {
        game.wgtngmPreviewSound.pause();
        game.wgtngmPreviewSound.onended = null;
        game.wgtngmPreviewSound = null;
    }

    if (game.wgtngmPreviewBtn) {
        const icon = game.wgtngmPreviewBtn.querySelector("i");
        if (icon) {
            icon.classList.remove("fa-stop");
            icon.classList.add("fa-play");
        }
        game.wgtngmPreviewBtn = null;
    }
}


export class TagManager {
    constructor() {
        this.tags = game.settings.get(MODULE_NAME, "trackTags") || {};

        
        if (!this.tags || typeof this.tags !== "object" || Array.isArray(this.tags)) {
            console.warn("Mini Player | Tag database is corrupted or invalid format. Resetting to empty object.");
            this.tags = {};
        }

        this.allTracks = [];
    }


    async scanLibrary({ force = false } = {}) {
        const musicFolder = game.settings.get(MODULE_NAME, "music-folder");
        const includePlaylistSounds = game.settings.get(MODULE_NAME, "include-playlist-sounds-in-tag-scan");
        const playlistFingerprint = includePlaylistSounds ? this._getPlaylistScanFingerprint() : "";

        if (!musicFolder && !includePlaylistSounds) {
            ui.notifications.warn("Mini Player: Music folder not set.");
            return [];
        }

        if (!force) {
            if (this.allTracks.length > 0) return this.allTracks;
            const cached = game.settings.get(MODULE_NAME, "trackScanCache");
            if (
                cached?.folder === musicFolder &&
                cached?.includePlaylistSounds === includePlaylistSounds &&
                cached?.playlistFingerprint === playlistFingerprint &&
                Array.isArray(cached?.tracks)
            ) {
                this.allTracks = cached.tracks;
                return this.allTracks;
            }
        }

        const files = [];
        const seenPaths = new Set();

        if (musicFolder) {
            await this._scanRecursive(musicFolder, files, seenPaths);
        }

        if (includePlaylistSounds) {
            this._collectPlaylistTracks(files, seenPaths);
        }

        this.allTracks = files;
        await game.settings.set(MODULE_NAME, "trackScanCache", {
            folder: musicFolder,
            includePlaylistSounds,
            playlistFingerprint,
            tracks: files,
            scannedAt: Date.now()
        });
        return files;
    }

    async _scanRecursive(path, fileList, seenPaths = new Set()) {
        const dirName = path.split("/").pop();
        if (dirName.toLowerCase().endsWith("-sfx")) {
            return;
        }

        try {
            const result = await FilePicker.browse("data", path);

            for (const file of result.files) {
                const ext = `.${file.split(".").pop()}`.toLowerCase();
                if (AUDIO_EXTENSIONS.has(ext)) {
                    if (seenPaths.has(file)) continue;
                    seenPaths.add(file);
                    fileList.push({
                        path: file,
                        name: formatTrackName(file)
                    });
                }
            }

            for (const dir of result.dirs) {
                await this._scanRecursive(dir, fileList, seenPaths);
            }
        } catch (e) {
            console.warn(`Mini Player | Failed to scan directory "${path}"`, e);
        }
    }

    _collectPlaylistTracks(fileList, seenPaths) {
        for (const playlist of game.playlists) {
            if (this._isMiniPlayerPlaylist(playlist)) continue;
            if (this._isSoundboardOnlyPlaylist(playlist)) continue;

            for (const sound of playlist.sounds) {
                const path = sound?.path?.trim();
                if (!path || seenPaths.has(path)) continue;

                seenPaths.add(path);
                fileList.push({
                    path,
                    name: sound.name || formatTrackName(path)
                });
            }
        }
    }

    _isMiniPlayerPlaylist(playlist) {
        if (!playlist) return false;
        if (playlist.getFlag(MODULE_NAME, "imported") === true) return true;
        if (playlist.getFlag(MODULE_NAME, "createdFromTags") === true) return true;
        if (playlist.getFlag(MODULE_NAME, "tagPlaylist") === true) return true;

        const normalizedName = playlist.name?.toLowerCase();
        return normalizedName === FAVORITES_PLAYLIST_NAME.toLowerCase() || normalizedName === TAG_PLAYLIST_NAME.toLowerCase();
    }

    _getPlaylistScanFingerprint() {
        const parts = [];
        for (const playlist of game.playlists) {
            if (this._isMiniPlayerPlaylist(playlist)) continue;
            if (this._isSoundboardOnlyPlaylist(playlist)) continue;
            parts.push(`${playlist.id}:${playlist.sounds.size}`);
        }
        return parts.sort().join("|");
    }

    _isSoundboardOnlyPlaylist(playlist) {
        if (!playlist) return false;
        return (
            playlist.mode === CONST.PLAYLIST_MODES.DISABLED ||
            playlist.parent?.mode === CONST.PLAYLIST_MODES.DISABLED
        );
    }

    getTags(path) {
        return this.tags[path] || [];
    }

    getAllUniqueTags() {
        const unique = new Set();
        if (!this.tags || typeof this.tags !== "object" || Array.isArray(this.tags)) return [];

        Object.values(this.tags).forEach(tList => {
            if (Array.isArray(tList)) {
                tList.forEach(t => {
                    if (typeof t === "string") unique.add(t);
                });
            }
        });
        return Array.from(unique).sort();
    }


    /**
     * Filters tracks based on tag selection and match mode.
     * @param {Map} tagSelection - Map of tag strings to state (1=Include, -1=Exclude)
     * @param {string} matchMode - "AND" or "OR"
     * @returns {Array} Filtered tracks
     */
    getFilteredTracks(tagSelection, matchMode) {
        if (!this.allTracks || this.allTracks.length === 0) return [];
        return filterTracksBySelection(
            this.allTracks,
            tagSelection,
            (track) => this.getTags(track.path),
            matchMode
        );
    }

    async addTag(path, tag) {
        if (!tag) return;
        tag = tag.toLowerCase().trim();
        if (!this.tags[path]) this.tags[path] = [];
        if (!this.tags[path].includes(tag)) {
            this.tags[path].push(tag);
            await this._save();
        }
    }

    async removeTag(path, tag) {
        if (!this.tags[path]) return;
        this.tags[path] = this.tags[path].filter(t => t !== tag);
        if (this.tags[path].length === 0) delete this.tags[path];
        await this._save();
    }

    /**
     * Compare the Database (this.tags) against the Active Scan (this.allTracks).
     * Remove keys from Database that are not found in the Active Scan.
     */
    async cleanUpTags() {
        await this.scanLibrary({ force: true });
        if (!this.allTracks || this.allTracks.length === 0) return 0;

        const validPaths = new Set(this.allTracks.map(t => t.path));
        const dbPaths = Object.keys(this.tags);
        let removedCount = 0;

        for (const path of dbPaths) {
            const tagList = Array.isArray(this.tags[path]) ? this.tags[path] : [];
            const hasTags = tagList.length > 0;

            if (!validPaths.has(path) && !hasTags) {
                delete this.tags[path];
                removedCount++;
            }
        }

        if (removedCount > 0) {
            await this._save();
        }
        return removedCount;
    }

    async _save() {
        await game.settings.set(MODULE_NAME, "trackTags", this.tags);
    }

    async exportTags() {
        const data = this.tags;
        const filename = `mini-player-tags-export.json`;
        foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
        ui.notifications.info("Mini Player: Tags exported successfully.");
    }

    async importTags(importedData, mode = "merge") {
        if (!importedData || typeof importedData !== "object" || Array.isArray(importedData)) {
            ui.notifications.error("Mini Player: Invalid tag data format. Expected an object map, not an array or primitive.");
            return;
        }
        const { sanitized, skipped, validPaths } = sanitizeImportedTagData(importedData);

        if (validPaths === 0) {
            ui.notifications.warn(`Mini Player: No valid tag data found to import. (Skipped ${skipped} invalid entries)`);
            return;
        }

        if (mode === "replace") {
            this.tags = sanitized;
        } else {
            for (const [path, tags] of Object.entries(sanitized)) {
                if (!this.tags[path]) this.tags[path] = [];
                const merged = new Set([...this.tags[path], ...tags]);
                this.tags[path] = Array.from(merged).sort();
            }
        }

        await this._save();

        let message = `Mini Player: Tags imported successfully (${mode} mode).`;
        if (skipped > 0) {
            message += ` Skipped ${skipped} invalid or malformed entries.`;
            ui.notifications.warn(message);
        } else {
            ui.notifications.info(message);
        }
    }
}

export class TagEditor extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "wgtgm-tag-editor",
        tag: "div",
        classes: ["wgtgm-tag-editor"],
        window: { title: "Edit Track Tags", resizable: true },
        position: { width: 600, height: 700 },
        actions: {
            addTag: async function (event, target) {
                const path = target.dataset.path;
                const input = target.previousElementSibling;
                await game.wgtngmTags.addTag(path, input.value);
                input.value = "";
                this.render();
            },
            removeTag: async function (event, target) {
                const path = target.dataset.path;
                const tag = target.dataset.tag;
                await game.wgtngmTags.removeTag(path, tag);
                this.render();
            },
            previewTrack: async function (event, target) {
                const path = target.dataset.path;
                await playPreview(path, target);
            },
            cleanTags: async function (event, target) {
                const confirm = await confirmationDialog(
                    "This refreshes the track scan and removes only untagged/empty entries for files no longer found. Tagged missing tracks are preserved. <br><br><strong>Ensure your hard drives/modules are loaded correctly before proceeding.</strong>"
                );
                if (confirm) {
                    const count = await game.wgtngmTags.cleanUpTags();
                    if (count > 0) {
                        ui.notifications.info(`Mini Player: Cleaned up ${count} missing tracks from the database.`);
                    } else {
                        ui.notifications.info("Mini Player: Database is already clean.");
                    }
                    this.render();
                }
            },
            rescanTracks: async function () {
                await game.wgtngmTags.scanLibrary({ force: true });
                ui.notifications.info("Mini Player: Track scan refreshed.");
                this.render();
            },
            exportTags: async function (event, target) {
                await game.wgtngmTags.exportTags();
            },
            importTagsTrigger: function (event, target) {
                this.element.querySelector("#wgtgm-import-file").click();
            },
            toggleUntaggedFilter: async function () {
                this.onlyUntagged = !this.onlyUntagged;
                await game.settings.set(MODULE_NAME, "tagEditorOnlyUntagged", this.onlyUntagged);
                this.render();
            }
        }
    };

    static PARTS = {
        main: { template: "modules/wgtgm-mini-player/templates/tag-editor.hbs", scrollable: [".track-list"] }
    };

    constructor(options = {}) {
        super(options);
        this.onlyUntagged = game.settings.get(MODULE_NAME, "tagEditorOnlyUntagged") ?? false;
    }


    /** @inheritDoc */
    async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        if (!this.hasFrame) return frame;
        const filterIcon = this.onlyUntagged ? "fa-tags" : "fa-tags";
        const filterTooltip = this.onlyUntagged
            ? "Showing tracks with no tags only (click for all tracks)"
            : "Showing all tracks (click for untagged only)";
        const copyId = `
        <button type="button" class="header-control fa-solid fa-rotate icon" data-action="rescanTracks"
                data-tooltip="Rescan Tracks" aria-label="Rescan Tracks"></button>
        <button type="button" class="header-control fa-solid fa-file-export icon" data-action="exportTags"
                data-tooltip="Export Tags to JSON" aria-label="Export Tags to JSON"></button>
        <button type="button" class="header-control fa-solid fa-file-import icon" data-action="importTagsTrigger"
                data-tooltip="Import Tags from JSON" aria-label="Import Tags from JSON"></button>
        <button type="button" class="header-control fa-solid ${filterIcon} icon" data-action="toggleUntaggedFilter"
                data-tooltip="${filterTooltip}" aria-label="${filterTooltip}"></button>
        <button type="button" class="header-control fa-solid fa-broom icon" data-action="cleanTags"
                data-tooltip="Remove tags for missing files" aria-label="Remove tags for missing files"></button>
      `;
        this.window.close.insertAdjacentHTML("beforebegin", copyId);

        return frame;
    }
    _onRender(context, options) {
        super._onRender(context, options);

        const fileInput = this.element.querySelector("#wgtgm-import-file");
        if (fileInput) {
            fileInput.addEventListener("change", (event) => this._handleFileSelect(event));
        }
    }


    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        if (game.wgtngmTags.allTracks.length === 0) {
            await game.wgtngmTags.scanLibrary();
        }

        const allTags = game.wgtngmTags.getAllUniqueTags();
        const currentPreview = game.wgtngmPreviewSound?._previewPath;
        const tracks = game.wgtngmTags.allTracks.map(t => ({
            ...t,
            tags: game.wgtngmTags.getTags(t.path),
            isPlaying: currentPreview === t.path
        })).sort((a, b) => a.name.localeCompare(b.name));
        context.tracks = this.onlyUntagged
            ? tracks.filter((track) => track.tags.length === 0)
            : tracks;
        context.onlyUntagged = this.onlyUntagged;
        context.allTags = allTags;
        return context;
    }

    async _handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                const mode = await new Promise((resolve) => {
                    new foundry.applications.api.DialogV2({
                        window: { title: "Import Tags" },
                        content: "<p>How would you like to import these tags?</p>",
                        buttons: [
                            {
                                action: "merge",
                                label: "Merge",
                                icon: "fas fa-code-merge",
                                default: true,
                                callback: () => resolve("merge")
                            },
                            {
                                action: "replace",
                                label: "Replace All",
                                icon: "fas fa-trash-can",
                                callback: () => resolve("replace")
                            }
                        ],
                        close: () => resolve(null)
                    }).render(true);
                });

                if (mode) {
                    await game.wgtngmTags.importTags(json, mode);
                    this.render();
                }

            } catch (err) {
                console.error(err);
                ui.notifications.error("Mini Player: Failed to parse JSON file.");
            }
            event.target.value = "";
        };
        reader.readAsText(file);
    }

}

export class TagPlaylistGenerator extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "wgtgm-tag-generator",
        tag: "div",
        classes: ["wgtgm-tag-generator"],
        window: { title: "Create Playlist from Tags", resizable: true, width: 500, height: 600 },
        actions: {
            toggleTag: {
                handler: function (event, target) {
                    const tag = target.dataset.tag;
                    const current = this.tagSelection.get(tag) || 0;
                    let next = 0;

                    if (event.button === 2) {
                        
                        if (current === -1) next = 0;      
                        else if (current === 0) next = -1; 
                        else next = 0;                     
                    } else {
                        
                        if (current === 0) next = 1;       
                        else if (current === 1) next = 0;  
                        else next = 0;                     
                    }

                    if (next === 0) this.tagSelection.delete(tag);
                    else this.tagSelection.set(tag, next);

                    this.render();
                },
                buttons: [0, 2] 
            },
            toggleTTRPG: function () {
                if (!ttrpgIntegration.active) return;
                this.includeTTRPG = !this.includeTTRPG;
                this.tagSelection.clear();
                this.render();
            },
            toggleMatchMode: function () {
                this.matchMode = this.matchMode === "AND" ? "OR" : "AND";
                this.render();
            },
            createPlaylist: async function () {
                if (this.tagSelection.size === 0) return;

                const { included, excluded } = this._getSplitTags();
                const matchingTracks = this._getCombinedFilteredTracks(included, excluded);

                if (matchingTracks.length === 0) {
                    ui.notifications.warn("No tracks found with these tags.");
                    return;
                }

                const incStr = included.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(this.matchMode === "AND" ? " & " : " | ");
                const excStr = excluded.length > 0 ? " !" + excluded.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(" !") : "";
                const finalName = `Tag: ${incStr}${excStr}`;

                const shouldLoop = game.settings.get(MODULE_NAME, "set-music-to-loop");

                const playlist = await Playlist.create({
                    name: finalName,
                    mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
                    flags: { [MODULE_NAME]: { createdFromTags: true } }
                });

                const sounds = matchingTracks.map(t => {
                    
                    let path = t.path;
                    if (t.isTTRPG) {
                        path = ttrpgIntegration.getPath(t, shouldLoop);
                    }

                    return {
                        name: t.name,
                        path: path,
                        repeat: shouldLoop,
                        flags: { [MODULE_NAME]: { imported: true } }
                    };
                });

                await playlist.createEmbeddedDocuments("PlaylistSound", sounds);
                ui.notifications.info(`Created playlist "${playlist.name}" with ${sounds.length} tracks.`);
                this.close();
            },
            previewTrack: async function (event, target) {
                const path = target.dataset.path;
                const isTtrpg = target.dataset.isTtrpg === "true";

                if (isTtrpg) {
                    const trackName = target.closest('li').innerText.trim(); 
                }
                await playPreview(path, target);
            },
            stopPreviews: function () {
                stopPreviewPlayback();
                this.render();
            }
        }
    };

    static PARTS = {
        main: { template: "modules/wgtgm-mini-player/templates/tag-generator.hbs", scrollable: ["", ".scrollable", ".tag-cloud", ".preview-section"] },
        footer: { template: "modules/wgtgm-mini-player/templates/form-footer-tag.hbs" },
    };

    constructor(options) {
        super(options);
        this.tagSelection = new Map();
        this.matchMode = "AND";
        this.includeTTRPG = false;
    }

    /** @inheritDoc */
    async _renderFrame(options) {
        const frame = await super._renderFrame(options);
        if (!this.hasFrame) return frame;

        const copyId = `
        <button type="button" class="header-control fa-solid fa-stop icon" data-action="stopPreviews"
                data-tooltip="Stop preview playback" aria-label="Stop preview playback"></button>
      `;
        this.window.close.insertAdjacentHTML("beforebegin", copyId);

        return frame;
    }

    _getSplitTags() {
        const included = [];
        const excluded = [];
        for (const [tag, state] of this.tagSelection.entries()) {
            if (state === 1) included.push(tag);
            else if (state === -1) excluded.push(tag);
        }
        return { included, excluded };
    }

    /**
     * Merge local and TTRPG tracks (if enabled) and apply filters
     */
    _getCombinedFilteredTracks(included, excluded) {
        let pool = [...game.wgtngmTags.allTracks];

        if (this.includeTTRPG && ttrpgIntegration.isAvailable) {
            pool = pool.concat(ttrpgIntegration.tracks);
        }
        return pool.filter(track => {
            let trackTags;
            if (track.isTTRPG) {
                trackTags = track.tags;
            } else {
                trackTags = game.wgtngmTags.getTags(track.path);
            }

            if (excluded.length > 0 && excluded.some(t => trackTags.includes(t))) return false;

            if (included.length > 0) {
                if (this.matchMode === "AND") {
                    return included.every(t => trackTags.includes(t));
                } else {
                    return included.some(t => trackTags.includes(t));
                }
            }
            return true;
        });
    }

    _getFilteredTracks(included, excluded) {
        let tracks = game.wgtngmTags.allTracks;

        if (excluded.length > 0) {
            tracks = tracks.filter(track => {
                const trackTags = game.wgtngmTags.getTags(track.path);
                return !excluded.some(t => trackTags.includes(t));
            });
        }

        if (included.length > 0) {
            tracks = tracks.filter(track => {
                const trackTags = game.wgtngmTags.getTags(track.path);
                if (this.matchMode === "AND") {
                    return included.every(t => trackTags.includes(t));
                } else {
                    return included.some(t => trackTags.includes(t));
                }
            });
        }

        return tracks;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        if (game.wgtngmTags.allTracks.length === 0) {
            await game.wgtngmTags.scanLibrary();
        }

        const allLocalTags = game.wgtngmTags.getAllUniqueTags();
        let allTagsSet = new Set(allLocalTags);

        if (this.includeTTRPG && ttrpgIntegration.isAvailable) {
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

        const { included, excluded } = this._getSplitTags();

        let matchingTracks = this._getCombinedFilteredTracks(included, excluded);

        let availableTags = null;
        if (this.matchMode === "AND") {
            availableTags = new Set();
            matchingTracks.forEach(t => {
                let tags;
                if (t.isTTRPG) tags = t.tags;
                else tags = game.wgtngmTags.getTags(t.path);

                tags.forEach(tag => availableTags.add(tag));
            });
        }
        const refinedTagCloud = allTags
            .filter(t => {
                if (this.matchMode === "OR") return true;
                return availableTags.has(t) || this.tagSelection.has(t);
            })
            .map(t => {
                const stateVal = this.tagSelection.get(t) || 0;
                let stateClass = "";
                if (stateVal === 1) stateClass = "include";
                else if (stateVal === -1) stateClass = "exclude";

                return {
                    name: t,
                    stateClass: stateClass
                };
            });
        const currentPreview = game.wgtngmPreviewSound?._previewPath;
        matchingTracks = matchingTracks.map(t => {
            let rawTags;
            let displayPath;

            if (t.isTTRPG) {
                rawTags = t.tags;
                displayPath = ttrpgIntegration.getPath(t, false);
            } else {
                rawTags = game.wgtngmTags.getTags(t.path);
                displayPath = t.path;
            }

            const formattedTags = rawTags.map(tagName => ({
                name: tagName,
                isSelected: included.includes(tagName)
            }));

            return {
                ...t,
                previewPath: displayPath,
                tags: formattedTags,
                isPlaying: currentPreview === displayPath
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        context.tags = refinedTagCloud;
        context.previewTracks = matchingTracks;
        context.hasSelection = this.tagSelection.size > 0;
        context.matchMode = this.matchMode;
        context.hasTags = allTags.length > 0;

        
        context.showTTRPGToggle = ttrpgIntegration.active;
        context.ttrpgEnabled = this.includeTTRPG;

        return context;
    }
}
