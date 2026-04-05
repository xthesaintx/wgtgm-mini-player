export class TrackTagStore {
    static SOURCE = "data";
    static ROOT_DIRECTORY = "asset-librarian/track-tags";
    static SHARD_DIRECTORY = "asset-librarian/track-tags/shards";
    static INDEX_FILENAME = "index.json";
    static SHARD_HEX_LENGTH = 2;
    static VERSION = 1;

    static _cache = {};
    static _loadedShards = new Set();
    static _shardCache = new Map();
    static _shardLoadPromises = new Map();
    static _shardFiles = null;
    static _shardFilePaths = new Map();
    static _shardFileSetPromise = null;

    static _loadPromise = null;
    static _writePromise = Promise.resolve();

    static _normalizeTags(rawTags) {
        if (!Array.isArray(rawTags)) return [];
        const normalized = rawTags
            .map((tag) => String(tag || "").trim().toLowerCase())
            .filter(Boolean);
        return Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }

    static normalizeMap(rawMap) {
        if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) return {};
        const normalized = {};
        for (const [rawPath, rawTags] of Object.entries(rawMap)) {
            const path = String(rawPath || "").trim();
            if (!path) continue;
            const tags = this._normalizeTags(rawTags);
            if (!tags.length) continue;
            normalized[path] = tags;
        }
        return normalized;
    }

    static _hashString(value) {
        let hash = 2166136261;
        const input = String(value ?? "");
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
    }

    static _getShardIdForKey(key) {
        const hashed = this._hashString(String(key || ""));
        return hashed.slice(0, this.SHARD_HEX_LENGTH);
    }

    static _normalizeShardId(rawId) {
        const id = String(rawId || "").trim().toLowerCase();
        const expectedLength = this.SHARD_HEX_LENGTH;
        if (!/^[0-9a-f]+$/.test(id) || id.length !== expectedLength) {
            throw new Error(`Invalid track tag shard id: ${rawId}`);
        }
        return id;
    }

    static _getShardFilename(shardId) {
        return `${shardId}.json`;
    }

    static _extractFilename(path) {
        const clean = String(path || "").trim();
        if (!clean) return "";
        const parts = clean.split("/");
        return parts[parts.length - 1] || "";
    }

    static getCached() {
        return this._cache && typeof this._cache === "object" ? this._cache : {};
    }

    static _resetCaches() {
        this._cache = {};
        this._loadedShards = new Set();
        this._shardCache.clear();
        this._shardLoadPromises.clear();
        this._shardFiles = null;
        this._shardFilePaths = new Map();
        this._shardFileSetPromise = null;
    }

    static async _ensureDirectoryExists(source, folderPath) {
        const fp = foundry.applications.apps.FilePicker.implementation;
        try {
            await fp.browse(source, folderPath);
            return true;
        } catch (_err) {
            const parts = folderPath.split("/").filter(Boolean);
            let currentPath = "";
            for (const part of parts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                try {
                    await fp.browse(source, currentPath);
                } catch (_browseErr) {
                    try {
                        await fp.createDirectory(source, currentPath);
                    } catch (_createErr) {
                        return false;
                    }
                }
            }
            return true;
        }
    }

    static async _readJsonFromDirectory(directory, filename) {
        const fp = foundry.applications.apps.FilePicker.implementation;
        try {
            const listing = await fp.browse(this.SOURCE, directory);
            const filePath = (listing?.files || []).find((f) => this._extractFilename(f) === filename);
            if (!filePath) return null;
            return await fetch(filePath).then((r) => r.json());
        } catch (_err) {
            return null;
        }
    }

    static async _ensureShardFileSet({ force = false } = {}) {
        if (!force && this._shardFiles instanceof Set) return this._shardFiles;
        if (!force && this._shardFileSetPromise) return this._shardFileSetPromise;

        this._shardFileSetPromise = (async () => {
            const files = new Set();
            const paths = new Map();
            const fp = foundry.applications.apps.FilePicker.implementation;
            try {
                const listing = await fp.browse(this.SOURCE, this.SHARD_DIRECTORY);
                for (const filePath of listing?.files || []) {
                    const filename = this._extractFilename(filePath);
                    if (!/^[0-9a-f]{2}\.json$/.test(filename)) continue;
                    files.add(filename);
                    paths.set(filename, filePath);
                }
            } catch (_err) {
                // Directory may not exist yet.
            }
            this._shardFiles = files;
            this._shardFilePaths = paths;
            return this._shardFiles;
        })().finally(() => {
            this._shardFileSetPromise = null;
        });

        return this._shardFileSetPromise;
    }

    static _applyShardToCaches(shardId, shardMap) {
        const id = this._normalizeShardId(shardId);
        const normalized = this.normalizeMap(shardMap);
        const previous = this._shardCache.get(id) || {};

        for (const key of Object.keys(previous)) {
            if (!normalized[key]) delete this._cache[key];
        }
        for (const [key, entry] of Object.entries(normalized)) {
            this._cache[key] = entry;
        }

        this._shardCache.set(id, normalized);
        this._loadedShards.add(id);
        return normalized;
    }

    static async _loadShard(shardId) {
        const id = this._normalizeShardId(shardId);
        if (this._loadedShards.has(id)) return this._shardCache.get(id) || {};
        if (this._shardLoadPromises.has(id)) return this._shardLoadPromises.get(id);

        const promise = (async () => {
            await this._ensureShardFileSet();
            const filename = this._getShardFilename(id);
            if (!this._shardFiles?.has(filename)) {
                return this._applyShardToCaches(id, {});
            }

            const explicitPath = this._shardFilePaths.get(filename);
            let raw = null;
            if (explicitPath) {
                try {
                    raw = await fetch(explicitPath).then((r) => r.json());
                } catch (_err) {
                    raw = null;
                }
            }
            if (!raw) {
                raw = await this._readJsonFromDirectory(this.SHARD_DIRECTORY, filename);
            }
            const rawMap = raw?.tags && typeof raw.tags === "object" ? raw.tags : raw;
            return this._applyShardToCaches(id, rawMap || {});
        })().finally(() => {
            this._shardLoadPromises.delete(id);
        });

        this._shardLoadPromises.set(id, promise);
        return promise;
    }

    static async _writeIndex() {
        const payload = {
            version: this.VERSION,
            updatedAt: Date.now(),
            shardPrefixLength: this.SHARD_HEX_LENGTH,
            shardFiles: this._shardFiles ? this._shardFiles.size : 0,
        };
        const file = new File([JSON.stringify(payload)], this.INDEX_FILENAME, { type: "application/json" });
        const ok = await this._ensureDirectoryExists(this.SOURCE, this.ROOT_DIRECTORY);
        if (!ok) throw new Error("Unable to create track tag root directory.");
        const fp = foundry.applications.apps.FilePicker.implementation;
        await fp.upload(this.SOURCE, this.ROOT_DIRECTORY, file, {}, { notify: false });
    }

    static async _writeShard(shardId, shardMap, { touchIndex = true } = {}) {
        const id = this._normalizeShardId(shardId);
        const filename = this._getShardFilename(id);
        const normalized = this.normalizeMap(shardMap);
        const file = new File([JSON.stringify(normalized)], filename, { type: "application/json" });
        const ok = await this._ensureDirectoryExists(this.SOURCE, this.SHARD_DIRECTORY);
        if (!ok) throw new Error("Unable to create track tag shard directory.");

        const fp = foundry.applications.apps.FilePicker.implementation;
        await fp.upload(this.SOURCE, this.SHARD_DIRECTORY, file, {}, { notify: false });

        this._shardFiles ||= new Set();
        this._shardFiles.add(filename);
        if (!this._shardFilePaths.has(filename)) {
            this._shardFilePaths.set(filename, `${this.SHARD_DIRECTORY}/${filename}`);
        }
        this._applyShardToCaches(id, normalized);

        if (touchIndex) await this._writeIndex();
        return normalized;
    }

    static _groupEntriesByShard(entriesMap) {
        const grouped = new Map();
        for (const [path, value] of Object.entries(entriesMap || {})) {
            const key = String(path || "").trim();
            if (!key) continue;
            const shardId = this._getShardIdForKey(key);
            if (!grouped.has(shardId)) grouped.set(shardId, {});
            grouped.get(shardId)[key] = value;
        }
        return grouped;
    }

    static async load({ force = false } = {}) {
        if (force) this._resetCaches();
        if (!force && this._loadPromise) return this._loadPromise;
        if (!force && (this._shardFiles instanceof Set || Object.keys(this._cache || {}).length)) return this._cache;

        this._loadPromise = (async () => {
            const canWriteStore = game.user?.isGM === true;
            if (canWriteStore) {
                await this._ensureDirectoryExists(this.SOURCE, this.ROOT_DIRECTORY);
                await this._ensureDirectoryExists(this.SOURCE, this.SHARD_DIRECTORY);
            }
            await this._ensureShardFileSet({ force });
            if (canWriteStore) {
                try {
                    await this._writeIndex();
                } catch (_err) {
                    // Non-fatal: reading existing tags can still continue.
                }
            }
            return this._cache;
        })().finally(() => {
            this._loadPromise = null;
        });

        return this._loadPromise;
    }

    static async getEntry(path) {
        const key = String(path || "").trim();
        if (!key) return [];
        const entries = await this.getEntries([key]);
        return entries[key] ? foundry.utils.deepClone(entries[key]) : [];
    }

    static async getEntries(paths) {
        await this.load();
        const uniqueKeys = Array.from(
            new Set((Array.isArray(paths) ? paths : []).map((p) => String(p || "").trim()).filter(Boolean)),
        );
        if (!uniqueKeys.length) return {};

        const shardIds = Array.from(new Set(uniqueKeys.map((path) => this._getShardIdForKey(path))));
        await Promise.all(shardIds.map((id) => this._loadShard(id)));

        const result = {};
        for (const key of uniqueKeys) {
            if (this._cache[key]) result[key] = this._cache[key];
        }
        return foundry.utils.deepClone(result);
    }

    static async getAllEntries() {
        await this.load();
        await this._ensureShardFileSet();
        const shardIds = Array.from(this._shardFiles || [])
            .map((filename) => filename.replace(/\.json$/i, ""))
            .filter((id) => /^[0-9a-f]{2}$/.test(id));
        await Promise.all(shardIds.map((id) => this._loadShard(id)));
        return foundry.utils.deepClone(this._cache);
    }

    static async save(map) {
        const normalizedMap = this.normalizeMap(map);
        this._writePromise = this._writePromise.then(async () => {
            await this.load();
            await this._ensureShardFileSet();

            const grouped = this._groupEntriesByShard(normalizedMap);
            const existingShardIds = new Set(
                Array.from(this._shardFiles || [])
                    .map((filename) => filename.replace(/\.json$/i, ""))
                    .filter((id) => /^[0-9a-f]{2}$/.test(id)),
            );

            const allShardIds = new Set([...existingShardIds, ...grouped.keys()]);
            for (const shardId of allShardIds) {
                const nextEntries = grouped.get(shardId) || {};
                await this._writeShard(shardId, nextEntries, { touchIndex: false });
            }
            await this._writeIndex();
            return this.getCached();
        });
        return this._writePromise;
    }

    static async updateEntry(path, tags) {
        const key = String(path || "").trim();
        if (!key) return this.getCached();
        return this.updateEntries({ [key]: tags });
    }

    static async updateEntries(updates) {
        const entries = updates && typeof updates === "object" ? updates : {};
        const keys = Object.keys(entries).map((k) => String(k || "").trim()).filter(Boolean);
        if (!keys.length) return this.getCached();

        this._writePromise = this._writePromise.then(async () => {
            await this.load();
            const groupedKeys = new Map();
            for (const key of keys) {
                const shardId = this._getShardIdForKey(key);
                if (!groupedKeys.has(shardId)) groupedKeys.set(shardId, []);
                groupedKeys.get(shardId).push(key);
            }

            let touched = false;
            for (const [shardId, shardKeys] of groupedKeys.entries()) {
                const currentShard = foundry.utils.deepClone(await this._loadShard(shardId));
                let changed = false;
                for (const key of shardKeys) {
                    const normalizedTags = this._normalizeTags(entries[key]);
                    const currentTags = this._normalizeTags(currentShard[key]);
                    const isSame = JSON.stringify(currentTags) === JSON.stringify(normalizedTags);
                    if (isSame) continue;

                    if (!normalizedTags.length) delete currentShard[key];
                    else currentShard[key] = normalizedTags;
                    changed = true;
                }
                if (!changed) continue;
                touched = true;
                await this._writeShard(shardId, currentShard, { touchIndex: false });
            }

            if (touched) await this._writeIndex();
            return this.getCached();
        });

        return this._writePromise;
    }
}
