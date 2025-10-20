import { MODULE_NAME } from "./settings.js";
import { confirmationDialog } from "./helper.js";

const AUDIO_EXTENSIONS = new Set(
    Object.keys(CONST.AUDIO_FILE_EXTENSIONS).map((e) => `.${e.toLowerCase()}`),
);

/**
 * Formats a file path into a user-friendly name.
 * @param {string} filePath - The full path to the file.
 * @returns {string} A formatted name.
 */
function formatTrackName(filePath) {
    let decodedPath = "";
    try {
        decodedPath = decodeURIComponent(filePath);
    } catch (e) {
        console.warn(`Mini Player: Could not decode path: ${filePath}`, e);
        decodedPath = filePath;
    }
    let name = decodedPath.split("/").pop() || "Unknown Track"; 
    name = name.substring(0, name.lastIndexOf("."));
    name = name.replace(/[_-]/g, " ");
    name = name.replace(/\b\w/g, (l) => l.toUpperCase());
    return name;
}

/**
 * Checks if a file path has a valid audio extension.
 * @param {string} filePath - The full path to the file.
 * @returns {boolean} True if it's a valid audio file, false otherwise.
 */
function isValidAudioFile(filePath) {
    const ext = `.${filePath.split(".").pop()}`.toLowerCase();
    return AUDIO_EXTENSIONS.has(ext);
}

/**
 * Handles the logic for importing and updating playlists from a directory.
 */
export class PlaylistImporter {
    constructor() {
        this.source = "data";
        this.bucket = null;
        this.rootPath = "";
    }

    /**
     * Parses the music folder setting to determine the source, bucket, and path.
     * @returns {boolean} True if the path is valid, false otherwise.
     */
    _parseMusicFolderSetting() {
        const musicFolderSetting = game.settings.get(
            MODULE_NAME,
            "music-folder",
        );
        if (!musicFolderSetting || musicFolderSetting.trim() === "") {
            ui.notifications.warn(
                "Mini Player: Music folder not set. Please set it in the module settings.",
            );
            return false;
        }
            this.source = "data";
            this.bucket = null;
            this.rootPath = musicFolderSetting.trim();

        if (this.rootPath === "" || this.rootPath === "/") {
            ui.notifications.warn(
                "Mini Player: Music folder path is invalid or set to the root. Please select a specific folder.",
            );
            return false;
        }
        return true;
    }

    /**
     * Main entry point to start the import process.
     */
    async importFromDirectory() {
        if (!this._parseMusicFolderSetting()) return;

        ui.notifications.info(
            `Mini Player: Starting playlist import from '${this.rootPath}'...`,
        );

        try {
            const browseResult = await foundry.applications.apps.FilePicker.implementation.browse(
                this.source,
                this.rootPath,
                {
                    bucket: this.bucket,
                },
            );

            for (const dir of browseResult.dirs) {
                const dirName = dir.split("/").pop();
                await this._processSubdirectory(dir, [dirName]);
            }

            ui.notifications.info(
                "Mini Player: Playlist import/update complete!",
            );
                game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.syncState();
                game.wgtngmSoundboard.wgtngmSoundboardInstance.render();
                game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.render();
        } catch (err) {
            console.error(err);
            ui.notifications.error(
                `Mini Player: Error browsing music folder. Check console (F12) for details.`,
            );
        }
    }

    /**
     * Recursively processes subdirectories to create playlists and add sounds.
     * @param {string} dirPath - The full path to the current directory.
     * @param {string[]} nameParts - An array of directory names, used to build the playlist name.
     */
    async _processSubdirectory(dirPath, nameParts) {
        const playlistName = decodeURIComponent(nameParts.join("_"));
        let playlist = null;

        try {
            const browseResult = await foundry.applications.apps.FilePicker.implementation.browse(
                this.source,
                dirPath,
                {
                    bucket: this.bucket,
                },
            );

            const validAudioFiles = browseResult.files.filter(isValidAudioFile);
            if (validAudioFiles.length > 0) {
                playlist = await this._createOrUpdatePlaylist(
                    playlistName,
                    dirPath,
                );
                if (playlist) {
                    await this._addOrUpdateSounds(playlist, validAudioFiles);
                }
            }
            for (const subDir of browseResult.dirs) {
                const dirName = subDir.split("/").pop();
                await this._processSubdirectory(subDir, [...nameParts, dirName]);
            }
        } catch (err) {
            console.error(
                `Error processing directory ${dirPath} for playlist ${playlistName}:`,
                err,
            );
            ui.notifications.warn(
                `Mini Player: Skipped directory ${playlistName} due to an error.`,
            );
        }
    }

    /**
     * Creates a new playlist or updates an existing one based on the directory path.
     * @param {string} name - The desired name for the playlist.
     * @param {string} path - The unique directory path for this playlist.
     * @returns {Playlist|null} The created or updated Playlist document.
     */
    async _createOrUpdatePlaylist(name, path) {
        const isSfx = name.toLowerCase().endsWith("-sfx");
        const playlistData = {
            name: name,
            flags: {
                [MODULE_NAME]: {
                    imported: true,
                    importPath: path,
                },
            },
            mode: isSfx
                ? CONST.PLAYLIST_MODES.DISABLED
                : CONST.PLAYLIST_MODES.SEQUENTIAL,
        };

        if (isSfx && game.settings.get(MODULE_NAME, "set-to-environment")) {
            playlistData.channel = "environment";
        }

        let playlist = game.playlists.find(
            (p) => p.getFlag(MODULE_NAME, "importPath") === path,
        );

        try {
            if (playlist) {
                await playlist.update(playlistData);
            } else {
                playlist = await Playlist.create(playlistData);
            }
            return playlist;
        } catch (err) {
            console.error(`Failed to create/update playlist ${name}:`, err);
            return null;
        }
    }

    /**
     * Adds new audio files to a playlist, skipping any that already exist.
     * @param {Playlist} playlist - The playlist document to update.
     * @param {string[]} validAudioFiles - A pre-filtered list of full paths to valid audio files.
     */
    async _addOrUpdateSounds(playlist, validAudioFiles) {
        const isSfx = playlist.name.toLowerCase().endsWith("-sfx");
        const shouldLoop =
            isSfx && game.settings.get(MODULE_NAME, "set-to-loop");
        const existingPaths = new Set(playlist.sounds.map((s) => s.path));
        const newSoundsData = [];
        for (const path of validAudioFiles) {
            if (existingPaths.has(path)) {
                continue;
            }

            newSoundsData.push({
                name: formatTrackName(path),
                path: path,
                repeat: shouldLoop,
                flags: {
                    [MODULE_NAME]: {
                        imported: true,
                    },
                },
            });
        }

        if (newSoundsData.length > 0) {
            try {
                await playlist.createEmbeddedDocuments(
                    "PlaylistSound",
                    newSoundsData,
                );
            } catch (err) {
                console.error(
                    `Failed to add sounds to playlist ${playlist.name}:`,
                    err,
                );
            }
        }
    }

    /**
     * Removes all playlists that were created by this importer.
     */
    async removeImportedPlaylists() {
        const playlists = game.playlists.filter(
            (p) => p.getFlag(MODULE_NAME, "imported") === true,
        );

        if (playlists.length === 0) {
            ui.notifications.info("Mini Player: No imported playlists to remove.");
            return;
        }

        const confirmed = await confirmationDialog(
            `Are you sure you want to delete ${playlists.length} imported playlist(s)? This action cannot be undone.`,
        );

        if (!confirmed) return;

        ui.notifications.info(
            `Mini Player: Removing ${playlists.length} imported playlist(s)...`,
        );

        const deleteIds = playlists.map((p) => p.id);
        await Playlist.deleteDocuments(deleteIds);

        ui.notifications.info("Mini Player: All imported playlists have been removed.");
    }
}