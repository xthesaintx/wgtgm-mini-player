export class TTRPGIntegration {
    constructor() {
        this.tracks = [];
        this.tags = new Set();
        this.isAvailable = false;
    }

    get active() {
        const module = game.modules.get('tabletop-rpg-music-patreon');
        const settingEnabled = game.settings.get("wgtgm-mini-player", "linkTTRPG");
        return module?.active && settingEnabled;
    }

    async init() {
        if (!this.active) return;
        
        try {
            const response = await fetch("modules/tabletop-rpg-music-patreon/data/tracks.json");
            if (!response.ok) throw new Error("Failed to fetch TTRPG tracks");
            
            const data = await response.json();
            await this._processTracks(data);
            this.isAvailable = true;
            console.log("Mini Player | TTRPG Music Loaded:", this.tracks.length, "tracks");
        } catch (e) {
            console.warn("Mini Player | Failed to load TTRPG Music data:", e);
            this.isAvailable = false;
        }
    }
    async _processTracks(data) {
        return new Promise((resolve) => {
            this.tracks = [];
            this.tags.clear();

            data.forEach(track => {
                const flatTags = [];
                
                if (track.trackType) {
                    flatTags.push(track.trackType);
                }

                if (track.tags) {
                    Object.values(track.tags).forEach(list => {
                        if (Array.isArray(list)) flatTags.push(...list);
                    });
                }
                
                const normalizedTitle = track.title.replace(/[\s'-]/g, "");
                
                this.tracks.push({
                    name: track.title,
                    _ttrpgData: {
                        title: normalizedTitle,
                        type: track.trackType
                    },
                    tags: flatTags.map(t => t.toLowerCase()),
                    isTTRPG: true
                });

                flatTags.forEach(t => this.tags.add(t.toLowerCase()));
            });
            
            resolve();
        });
    }

    /**
     * Generates the full URL for a track
     * @param {Object} track - The internal track object
     * @param {boolean} loop - Whether to use the looping version
     */
    getPath(track, loop = false) {
        if (!track._ttrpgData) return "";
        
        const { title, type } = track._ttrpgData;
        let base = "https://storage.googleapis.com/tabletop-rpg-music-patreon/music";
        
        let folder = "standardtracks";
        if (type === "bonus") folder = "bonustracks";
        else if (type === "alternate") folder = "alternatetracks";

        if (loop) folder += "loop";

        return `${base}/${folder}/${title}.ogg`;
    }
}

export const ttrpgIntegration = new TTRPGIntegration();