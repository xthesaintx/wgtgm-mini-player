import miniplayerSettings, { MODULE_NAME } from "./settings.js";
import {
    handleMPClick,
    localize,
    addplaylistDirectoryUI,
    openwgtngmMiniPlayerSheet,
    format,
    checkAndRender,
    openIfOpened
} from "./helper.js";

import { wgtngmMiniPlayerSheet } from "./mp-player.js";
import { wgtngmSoundboardSheet } from "./sb-player.js";
Hooks.once("init", async function () {
    console.log("wgtngmMiniPlayer | Initializing");
    const templatePaths = [
    ];
    foundry.applications.handlebars.loadTemplates(templatePaths);
});

Hooks.once("i18nInit", async function () {
    await miniplayerSettings();
 });


Hooks.once("ready", async function () {
    game.wgtngmMiniPlayer = new wgtngmMiniPlayerSheet();
    game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance = null;
    game.wgtngmSoundboard = new wgtngmSoundboardSheet();
    game.wgtngmSoundboard.wgtngmSoundboardInstance = null;    
    if (game.user.isGM) {
        if (game.settings.get("wgtgm-mini-player", "runonlyonce") === false) {
            await ChatMessage.create(
                {
                    user: game.user.id,
                    speaker: ChatMessage.getSpeaker(),
                    content: localize("welcomePageHTML"),
                },
                {},
            );
            await game.settings.set("wgtgm-mini-player", "runonlyonce", true);
        }
    }
    openIfOpened();
});


Hooks.on("renderPlaylistDirectory", (app, html, data) => {
    addplaylistDirectoryUI(html);
});


Hooks.on("renderChatMessageHTML", (app, html, data) => {
    const handlers = html.querySelectorAll(`[data-wgtngm^="${MODULE_NAME}|"]`);
    handlers.forEach((element) => {
        element.addEventListener("click", handleMPClick);
    });
});

Hooks.on("deletePlaylistSound", (playlist, changes, options, userId) => {
    checkAndRender(playlist);
});

Hooks.on("createPlaylistSound", (playlist, changes, options, userId) => {
    checkAndRender(playlist);
});
Hooks.on("updatePlaylist", (playlist, changes, options, userId) => {
    checkAndRender(playlist);
 });

Hooks.on("deletePlaylist", (playlist, changes, options, userId) => {
    checkAndRender(playlist);
 });

Hooks.on("renderSceneControls", (app , html , data , s) => {
    if (!s.parts.includes("layers")) return;
    const a = html.querySelector('[data-control="sounds"]');
    if (a) {
        a.addEventListener("contextmenu", (app) => {
        app.preventDefault();
        openwgtngmMiniPlayerSheet();
        });
    }
});



