import {
    localize,
    format,
    openwgtngmMiniPlayerSheet,
    openwgtngmSoundboardSheet
} from "./helper.js";
export const MODULE_NAME = "wgtgm-mini-player";

export default async function miniplayerSettings() {
    
    const localize = (key) => game.i18n.localize(`MINI_PLAYER.settings.${key}`);
    
    game.settings.register("wgtgm-mini-player", "runonlyonce", {
        name: "Welcome message",
        hint: "Disable to see the Welcome Message",
        scope: "world",
        config: true,
        requiresReload: true,
        type: Boolean,
        default: false,
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