import { openwgtngmMiniPlayerSheet, openwgtngmSoundboardSheet } from "./helper.js";
export const MODULE_NAME = "wgtgm-mini-player";

export default async function miniplayerSettings() {
    const L = (key) => game.i18n.localize(`${MODULE_NAME}.settings.${key}`);
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
    game.settings.register("wgtgm-mini-player", "tagEditorOnlyUntagged", {
        scope: "client",
        config: false,
        type: Boolean,
        default: false
    });
    game.settings.register("wgtgm-mini-player", "runonlyonce", {
        name: L("runonlyonce.name"),
        hint: L("runonlyonce.hint"),
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
    game.settings.register("wgtgm-mini-player", "sbLastPlaylistId", {
        scope: "client",
        config: false,
        type: String,
        default: ""
    });
    game.settings.register("wgtgm-mini-player", "sbDockMode", {
        scope: "client",
        config: false,
        type: Boolean,
        default: false
    });
    game.settings.register("wgtgm-mini-player", "sbDockCollapsed", {
        scope: "client",
        config: false,
        type: Boolean,
        default: false
    });
    game.settings.register("wgtgm-mini-player", "sbDockTop", {
        scope: "client",
        config: false,
        type: Number,
        default: 96
    });
    game.settings.register("wgtgm-mini-player", "sbResizeAuto", {
        scope: "client",
        config: false,
        type: Boolean,
        default: true
    });
    game.settings.register("wgtgm-mini-player", "sbAutoMaxSingleRow", {
        name: "Auto-size max width to one row",
        hint: "If enabled, Auto Size will not exceed the width needed to fit all sounds in a single row.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("wgtgm-mini-player", "remember-open-state", {
        name: L("rememberOpenState.name"),
        hint: L("rememberOpenState.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register("wgtgm-mini-player", "enable-crossfade", {
        name: L("enableCrossfade.name"),
        hint: L("enableCrossfade.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register("wgtgm-mini-player", "enable-sb-crossfade", {
        name: L("enableSoundboardCrossfade.name"),
        hint: L("enableSoundboardCrossfade.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register("wgtgm-mini-player", "crossfade",{
        name: L("crossfadeDuration.name"),
        hint: L("crossfadeDuration.hint"),
        scope: "world",
        config: true,
        requiresReload: false,
        type: new foundry.data.fields.NumberField({nullable: false, min: 0.5, max: 10, step: 0.5}),
        default: 2,
    });

    game.settings.register("wgtgm-mini-player", "maxTrackCount", {
        name: L("maxTrackCount.name"),
        hint: L("maxTrackCount.hint"),
        scope: "world",
        config: true,
        requiresReload: true,
        type: new foundry.data.fields.NumberField({nullable: false, min: 10, max: 30, step: 1}),
        default: 20,
    });

    game.settings.register("wgtgm-mini-player", "music-folder", {
        name: L("musicFolder.name"),
        hint: L("musicFolder.hint"),
        scope: "world",
        config: true,
        type: String,
        default: "",
        filePicker: "folder",
        onChange: async () => {
            await game.settings.set("wgtgm-mini-player", "trackScanCache", {});
            if (game.wgtngmTags) game.wgtngmTags.allTracks = [];
        }
    });

    game.settings.register("wgtgm-mini-player", "trackScanCache", {
        scope: "client",
        config: false,
        type: Object,
        default: {}
    });
 
    game.settings.register("wgtgm-mini-player", "set-to-loop", {
        name: L("setToLoop.name"),
        hint: L("setToLoop.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("wgtgm-mini-player", "set-to-environment", {
        name: L("setToEnvironment.name"),
        hint: L("setToEnvironment.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });
 
    game.settings.register("wgtgm-mini-player", "set-music-to-loop", {
        name: L("setMusicToLoop.name"),
        hint: L("setMusicToLoop.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });

    game.settings.register("wgtgm-mini-player", "play-on-select", {
        name: L("playOnSelect.name"),
        hint: L("playOnSelect.hint"),
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
        name: L("stopOnNewSoundboard.name"),
        hint: L("stopOnNewSoundboard.hint"),
        scope: "client",
        config: true,
        type: Boolean,
        default: false
    });

    game.settings.register("wgtgm-mini-player", "stop-on-new-playlist", {
        name: L("stopOnNewPlaylist.name"),
        hint: L("stopOnNewPlaylist.hint"),
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
        name: L("linkTTRPG.name"),
        hint: L("linkTTRPG.hint"),
        scope: "client", 
        config: true,
        type: Boolean,
        requiresReload: true,
        default: false,
    });

    game.settings.register("wgtgm-mini-player", "dockSidebar", {
    name: L("dockSidebar.name"),
    hint: L("dockSidebar.hint"),
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
        onChange: () => {
             if (game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance?.rendered) {
                 game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.render(true);
             }
        }
    });

    game.keybindings.register("wgtgm-mini-player", "MiniPlayer", {
      name: L("keybindMiniPlayer.name"),
      editable: [
        {key: "KeyM", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL]}
      ],
      onDown: () => {openwgtngmMiniPlayerSheet();}
    });

    game.keybindings.register("wgtgm-mini-player", "MiniBoard", {
      name: L("keybindMiniBoard.name"),
      editable: [
        {key: "KeyM", modifiers: [foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.CONTROL, foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS.ALT]}
      ],
      onDown: () => {openwgtngmSoundboardSheet();}
    });

}
