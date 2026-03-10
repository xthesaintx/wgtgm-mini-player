import miniplayerSettings, { MODULE_NAME } from "./settings.js";
import { TagManager } from "./tags.js"; 
import {
    handleMPClick,
    localize,
    addplaylistDirectoryUI,
    openwgtngmMiniPlayerSheet,
    openwgtngmSoundboardSheet,
    format,
    checkAndRender,
    openIfOpened
} from "./helper.js";
import { PlaylistImporter } from "./importer.js";
import { wgtngmMiniPlayerSheet } from "./mp-player.js";
import { wgtngmSoundboardSheet } from "./sb-player.js";
import { ttrpgIntegration } from "./ttrpg.js";
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
    game.wgtngmTags = new TagManager();
    game.wgtngmMiniPlayer = new wgtngmMiniPlayerSheet();
    game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance = null;
    game.wgtngmSoundboard = new wgtngmSoundboardSheet();
    game.wgtngmMiniPlayer.importer = new PlaylistImporter();
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
    await ttrpgIntegration.init();
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

Hooks.on("updatePlaylistSound", (playlist, changes, options, userId) => {
    checkAndRender(playlist,changes);
});

Hooks.on("deletePlaylistSound", (playlist, changes, options, userId) => {
    checkAndRender(playlist,changes);
});

Hooks.on("createPlaylistSound", (playlist, changes, options, userId) => {
    checkAndRender(playlist,changes);
});

Hooks.on("updatePlaylist", (playlist, changes, options, userId) => {
    checkAndRender(playlist,changes);
 });

Hooks.on("deletePlaylist", (playlist, changes, options, userId) => {
    checkAndRender(playlist,changes);
 });

Hooks.on("renderSceneControls", (app, html, data, s) => {
    if (!s.parts.includes("layers")) return;
    const soundsControl = html.querySelector('[data-control="sounds"]');
    if (!soundsControl) return;

    soundsControl.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openwgtngmMiniPlayerSheet();
    });
});

Hooks.on("getSceneControlButtons", (controls) => {
    const soundsControl = Array.isArray(controls)
        ? controls.find((control) => control?.name === "sounds")
        : controls?.sounds;
    if (!soundsControl?.tools) return;

    const tools = soundsControl.tools;
    const toolKeys = Array.isArray(tools) ? tools.map((tool) => tool.name) : Object.keys(tools);
    const maxOrder = Array.isArray(tools)
        ? Math.max(0, ...tools.map((tool) => Number(tool.order) || 0))
        : Math.max(0, ...Object.values(tools).map((tool) => Number(tool.order) || 0));

    const miniPlayerTool = {
        name: "wgtngm-mini-player",
        title: "Mini Player",
        icon: "fas fa-music",
        button: true,
        visible: true,
        order: maxOrder + 1,
        onChange: () => openwgtngmMiniPlayerSheet()
    };

    const soundboardTool = {
        name: "wgtngm-soundboard",
        title: "Soundboard",
        icon: "fas fa-border-all",
        button: true,
        visible: true,
        order: maxOrder + 2,
        onChange: () => openwgtngmSoundboardSheet()
    };

    if (Array.isArray(tools)) {
        if (!toolKeys.includes("wgtngm-mini-player")) tools.push(miniPlayerTool);
        if (!toolKeys.includes("wgtngm-soundboard")) tools.push(soundboardTool);
    } else {
        if (!tools["wgtngm-mini-player"]) tools["wgtngm-mini-player"] = miniPlayerTool;
        if (!tools["wgtngm-soundboard"]) tools["wgtngm-soundboard"] = soundboardTool;
    }
});
