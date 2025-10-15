import {
    localize,
    format,
    openwgtngmMiniPlayerSheet
} from "./helper.js";
export const MODULE_NAME = "wgtngmMiniPlayer";

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
        default: { width: 400, height: 200 } 
    });

    game.settings.register("wgtgm-mini-player", "lastPlayedTrack", {
        scope: "client",
        config: false,
        type: Object,
        default: null
    });

        game.keybindings.register("wgtgm-mini-player", "active", {
            name: "Open the Mini Music Player",
            editable: [
                {
                    key: "KeyM",
                    modifiers: [
                        foundry.helpers.interaction.KeyboardManager
                            .MODIFIER_KEYS.CONTROL,
                    ],
                },
            ],
            restricted: false,
            onDown: () => {
                    openwgtngmMiniPlayerSheet();
        }
        });
}