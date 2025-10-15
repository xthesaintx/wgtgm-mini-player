import miniplayerSettings, { MODULE_NAME } from "./settings.js";
import {
    handleMPClick,
    localize,
    addplaylistDirectoryUI,
    openwgtngmMiniPlayerSheet,
    format
} from "./helper.js";

import { wgtngmMiniPlayerSheet } from "./mp-player.js";

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

Hooks.on("updatePlaylist", (playlist, changes, options, userId) => {
    if (game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance?.rendered) {
        game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.syncState();
    }
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



