import { MODULE_NAME } from "./settings.js";
import { formatTrackName } from "./importer.js"; 
import { confirmationDialog } from "./helper.js";
import { ttrpgIntegration } from "./ttrpg.js"; // Import the singleton
const AUDIO_EXTENSIONS = new Set(Object.keys(CONST.AUDIO_FILE_EXTENSIONS).map(e => `.${e.toLowerCase()}`));
const FilePicker =foundry.applications.apps.FilePicker.implementation;
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


export class TagManager {
    constructor() {
        this.tags = game.settings.get(MODULE_NAME, "trackTags") || {};
        this.allTracks = []; 
    }


    async scanLibrary() {
        const musicFolder = game.settings.get(MODULE_NAME, "music-folder");
        if (!musicFolder) {
            ui.notifications.warn("Mini Player: Music folder not set.");
            return [];
        }

        const files = [];
        await this._scanRecursive(musicFolder, files);
        this.allTracks = files;
        return files;
    }

    async _scanRecursive(path, fileList) {
        const dirName = path.split("/").pop();
        if (dirName.toLowerCase().endsWith("-sfx")) {
            return;
        }

        try {
            const result = await FilePicker.browse("data", path);
            
            for (const file of result.files) {
                const ext = `.${file.split(".").pop()}`.toLowerCase();
                if (AUDIO_EXTENSIONS.has(ext)) {
                    fileList.push({
                        path: file,
                        name: formatTrackName(file)
                    });
                }
            }

            for (const dir of result.dirs) {
                await this._scanRecursive(dir, fileList);
            }
        } catch (e) {
            // console.error("Mini Player Tag Scan Error:", e);
        }
    }

    getTags(path) {
        return this.tags[path] || [];
    }

    getAllUniqueTags() {
        const unique = new Set();
        Object.values(this.tags).forEach(tList => tList.forEach(t => unique.add(t)));
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

        const included = [];
        const excluded = [];
        
        for (const [tag, state] of tagSelection.entries()) {
            if (state === 1) included.push(tag);
            else if (state === -1) excluded.push(tag);
        }
        if (included.length === 0 && excluded.length === 0) {
            return this.allTracks;
        }

        return this.allTracks.filter(track => {
            const trackTags = this.getTags(track.path);
            if (excluded.some(t => trackTags.includes(t))) return false;
            if (included.length > 0) {
                if (matchMode === "AND") {
                    return included.every(t => trackTags.includes(t));
                } else {
                    return included.some(t => trackTags.includes(t));
                }
            }

            return true;
        });
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
        if (!this.allTracks || this.allTracks.length === 0) {
            await this.scanLibrary();
        }
        if (this.allTracks.length === 0) {
            ui.notifications.warn("Mini Player: No tracks found in scan. Cleanup aborted to prevent data loss.");
            return 0;
        }

        const validPaths = new Set(this.allTracks.map(t => t.path));
        const dbPaths = Object.keys(this.tags);
        let removedCount = 0;

        for (const path of dbPaths) {
            if (!validPaths.has(path)) {
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
        // console.log(importedData);
        if (!importedData || typeof importedData !== 'object') {
            ui.notifications.error("Mini Player: Invalid tag data.");
            return;
        }

        if (mode === "replace") {
            this.tags = importedData;
        } else {
            for (const [path, newTags] of Object.entries(importedData)) {
                if (!Array.isArray(newTags)) continue;

                if (!this.tags[path]) {
                    this.tags[path] = [];
                }
                
                for (const tag of newTags) {
                    if (!this.tags[path].includes(tag)) {
                        this.tags[path].push(tag);
                    }
                }
            }
        }
        
        await this._save();
        ui.notifications.info(`Mini Player: Tags imported successfully (${mode} mode).`);
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
            addTag: async function(event, target) {
                const path = target.dataset.path;
                const input = target.previousElementSibling;
                await game.wgtngmTags.addTag(path, input.value);
                input.value = "";
                this.render();
            },
            removeTag: async function(event, target) {
                const path = target.dataset.path;
                const tag = target.dataset.tag;
                await game.wgtngmTags.removeTag(path, tag);
                this.render();
            },
            previewTrack: async function(event, target) {
                const path = target.dataset.path;
                await playPreview(path, target);
            },
            cleanTags: async function(event, target) {
                const confirm = await confirmationDialog(
                    "This will permanently remove tags for files that are no longer in your Music Directory. <br><br><strong>Ensure your hard drives/modules are loaded correctly before proceeding.</strong>"
                );
                if (confirm) {
                    const count = await game.wgtngmTags.cleanUpTags();
                    if (count > 0) {
                        ui.notifications.info(`Mini Player: Cleaned up ${count} missing tracks from the database.`);
                        this.render();
                    } else {
                        ui.notifications.info("Mini Player: Database is already clean.");
                    }
                }
            },
            exportTags: async function(event, target) {
                await game.wgtngmTags.exportTags();
            },
            importTagsTrigger: function(event, target) {
                this.element.querySelector("#wgtgm-import-file").click();
            }
        }
    };

    static PARTS = {
        main: { template: "modules/wgtgm-mini-player/templates/tag-editor.hbs", scrollable: [".track-list"] }
    };


  /** @inheritDoc */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    if ( !this.hasFrame ) return frame;
    const copyId = `
        <button type="button" class="header-control fa-solid fa-file-export icon" data-action="exportTags"
                data-tooltip="Export Tags to JSON" aria-label="Export Tags to JSON"></button>
        <button type="button" class="header-control fa-solid fa-file-import icon" data-action="importTagsTrigger"
                data-tooltip="Import Tags from JSON" aria-label="Import Tags from JSON"></button>
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
        context.tracks = game.wgtngmTags.allTracks.map(t => ({
            ...t,
            tags: game.wgtngmTags.getTags(t.path),
            isPlaying: currentPreview === t.path
        })).sort((a, b) => a.name.localeCompare(b.name));
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
                handler: function(event, target) {
                    const tag = target.dataset.tag;
                    const current = this.tagSelection.get(tag) || 0;
                    let next = 0;

                    if (event.button === 2) {
                        // Right Click: Toggle Exclude (-1)
                        if (current === -1) next = 0;      // Exclude -> Neutral
                        else if (current === 0) next = -1; // Neutral -> Exclude
                        else next = 0;                     // Include -> Neutral
                    } else {
                        // Left Click: Toggle Include (1)
                        if (current === 0) next = 1;       // Neutral -> Include
                        else if (current === 1) next = 0;  // Include -> Neutral
                        else next = 0;                     // Exclude -> Neutral
                    }

                    if (next === 0) this.tagSelection.delete(tag);
                    else this.tagSelection.set(tag, next);

                    this.render();
                },
                buttons: [0, 2] // Enable Left (0) and Right (2) clicks
            },
            toggleTTRPG: function() {
                if (!ttrpgIntegration.active) return;
                this.includeTTRPG = !this.includeTTRPG;
                this.tagSelection.clear();
                this.render();
            },
            toggleMatchMode: function() {
                this.matchMode = this.matchMode === "AND" ? "OR" : "AND";
                this.render();
            },
            createPlaylist: async function() {
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
                    // Resolve Path: Local file or TTRPG URL
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
            previewTrack: async function(event, target) {
                const path = target.dataset.path;
                const isTtrpg = target.dataset.isTtrpg === "true";
                
                if (isTtrpg) {
                    const trackName = target.closest('li').innerText.trim(); // Fallback or use ID lookup
                }
                await playPreview(path, target);
            }
        }
    };

    static PARTS = {
        main: { template: "modules/wgtgm-mini-player/templates/tag-generator.hbs", scrollable: ["",".scrollable",".tag-cloud",".preview-section"] },
        footer: { template: "modules/wgtgm-mini-player/templates/form-footer-tag.hbs" },
    };

    constructor(options) {
        super(options);
        this.tagSelection = new Map(); 
        this.matchMode = "AND"; 
        this.includeTTRPG = false;
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
        
        // Pass TTRPG availability to template
        context.showTTRPGToggle = ttrpgIntegration.active;
        context.ttrpgEnabled = this.includeTTRPG;

        return context;
    }
}

