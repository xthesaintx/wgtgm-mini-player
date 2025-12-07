import {
    localize,
    format,
    openwgtngmMiniPlayerSheet,
    openwgtngmSoundboardSheet
} from "./helper.js";
export const MODULE_NAME = "wgtgm-mini-player";

export default async function miniplayerSettings() {
    
    const localize = (key) => game.i18n.localize(`MINI_PLAYER.settings.${key}`);
    game.settings.register("wgtgm-mini-player", "tagSelectionState", {
        scope: "client",
        config: false,
        type: Array, 
        default: []
    });
    game.settings.register("wgtgm-mini-player", "ttrpgSourceEnabled", {
        scope: "client",
        config: false,
        type: Boolean,
        default: false 
    });
    game.settings.register("wgtgm-mini-player", "lastTagMode", {
        scope: "client",
        config: false,
        type: Boolean,
        default: false
    });
    game.settings.register("wgtgm-mini-player", "runonlyonce", {
        name: "Welcome message",
        hint: "Disable to see the Welcome Message",
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
    });
    
    game.settings.register("wgtgm-mini-player", "trackTags", {
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register("wgtgm-mini-player", "mpSheetDimensions", {
        scope: "client",
        config: false,  
        type: Object,
        default: { width: 400, height: 200, top:40 , left:40} 
    });
    game.settings.register("wgtgm-mini-player", "sbSheetDimensions", {
        scope: "client",
        config: false,  
        type: Object,
        default: { width: 400, height: 200,top:40 , left:40 } 
    });

    game.settings.register("wgtgm-mini-player", "remember-open-state", {
        name: "Remember the player and soundboard state.",
        hint: "Opens the Player and Soundboard on load if they were open when Foundry was closed.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("wgtgm-mini-player", "enable-crossfade", {
        name: "Enable crossfade",
        hint: "If enabled crossfade will be applied to music playlists",
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register("wgtgm-mini-player", "enable-sb-crossfade", {
        name: "Enable crossfade on Soundboard",
        hint: "If enabled crossfade will be applied to soundboard playlists",
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register("wgtgm-mini-player", "crossfade",{
        name: "Crossfade duration (seconds)",
        hint: "Set the length of crossfade between tracks in seconds",
        scope: "world",
        config: true,
        requiresReload: false,
        type: new foundry.data.fields.NumberField({nullable: false, min: 0.5, max: 10, step: 0.5}),
        default: 2,
    });

    game.settings.register("wgtgm-mini-player", "maxTrackCount", {
        name: "Maximum number of tracks in a Tag Playlist",
        hint: "Limits the number of tracks in the tag playlist created dynamically in the Mini Player",
        scope: "world",
        config: true,
        requiresReload: true,
        type: new foundry.data.fields.NumberField({nullable: false, min: 10, max: 30, step: 1}),
        default: 20,
    });

    game.settings.register("wgtgm-mini-player", "music-folder", {
        name: "Base music folder",
        hint: "Folder where playlists are created from, folders with [sfx] will be added as Soundboard Only",
        scope: "world",
        config: true,
        type: String,
        default: "",
        filePicker: "folder",
    });
 
    game.settings.register("wgtgm-mini-player", "set-to-loop", {
        name: "Set Soundboard Playlist tracks to loop",
        hint: "Imported tracks in Soundboard Only playlists will be set to loop",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("wgtgm-mini-player", "set-to-environment", {
        name: "Set Soundboard Playlist channel to Environment",
        hint: "Imported Soundboard Only playlists will be set to the Environment channel",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });
 
    game.settings.register("wgtgm-mini-player", "set-music-to-loop", {
        name: "Set Music Playlist tracks to loop",
        hint: "Imported tracks in Music playlists will be set to loop",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("wgtgm-mini-player", "play-on-select", {
        name: "Play on Track Select",
        hint: "Automatically play a track when it is selected from the dropdown list.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true, 
    });

    game.settings.register("wgtgm-mini-player", "mpDrawerOpen", {
        scope: "client",
        config: false,  
        type: Boolean,
        default: false
    });

    game.settings.register("wgtgm-mini-player", "mpSbOpened", {
        scope: "client",
        config: false,  
        type: Object,
        default: { mp: false, sb: false } 
    });

    game.settings.register("wgtgm-mini-player", "stop-on-new-soundboard", {
        name: "Stop on new Sound",
        hint: "Stop playback of the soundboard track when a new Soundboad sound is played.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register("wgtgm-mini-player", "stop-on-new-playlist", {
        name: "Stop on New Playlist",
        hint: "Stop playback of the current track when a track from a new playlist is selected.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });
    
    game.settings.register("wgtgm-mini-player", "lastPlayedTrack", {
        scope: "client",
        config: false,
        type: Object,
        default: null
    });

    game.settings.register("wgtgm-mini-player", "linkTTRPG", {
        name: "Link with TTRPG Music (Patreon)",
        hint: "Enable integration with the Tabletop RPG Music module. Requires the module to be installed and active.",
        scope: "client", 
        config: true,
        type: Boolean,
        requiresReload: true,
        default: false,
    });

    game.keybindings.register("wgtgm-mini-player", "MiniPlayer", {
      name: "Open the Mini Music Player",
      editable: [
        {key: "KeyM", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL]}
      ],
      onDown: () => {openwgtngmMiniPlayerSheet();}
    });

    game.keybindings.register("wgtgm-mini-player", "MiniBoard", {
      name: "Open the Mini Soundboard",
      editable: [
        {key: "KeyM", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL, foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.ALT]}
      ],
      onDown: () => {openwgtngmSoundboardSheet();}
    });

}