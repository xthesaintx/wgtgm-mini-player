import { MODULE_NAME } from "./settings.js";
/**
 * localization.
 * @type {string}
 */
import { wgtngmMiniPlayerSheet } from "./mp-player.js";
import { wgtngmSoundboardSheet } from "./sb-player.js";
import { TagEditor, TagPlaylistGenerator } from "./tags.js"; 
export const localize = (key) => game.i18n.localize(`${MODULE_NAME}.${key}`);

export const format = (key, data) =>
    game.i18n.format(`${MODULE_NAME}.${key}`, data);

export const renderTemplate = foundry.applications.handlebars.renderTemplate;

export function formatTimestamp(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    seconds = Math.round(seconds);
    const minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    return `${minutes.paddedString(2)}:${seconds.paddedString(2)}`;
}

export const getButtonGrouphead = () => `
    <div class="mp-miniplayer-panel-buttons" >
        <button class="mp-miniplayer-open" type="button" title="open the miniplayer" data-action="openMP" >
            <i class="fas fa-music"></i> Mini Player
        </button>
        <button class="mp-soundboard-open" type="button" title=" Soundboard" data-action="openSB" >
            <i class="fas fa-border-all"></i> Soundboard
        </button>
    <button class="mp-update-playlists" type="button" title=" Add Playlists" data-action="updatePlaylists" >
            <i class="fas fa-list"></i> Add Playlists
        </button>
    <button class="mp-remove-playlists" type="button" title=" Remove Playlists" data-action="removePlaylists" >
            <i class="fas fa-trash"></i> Remove Playlists
        </button>
    <button class="mp-edit-tags" type="button" title="Edit Track Tags">
        <i class="fas fa-tags"></i> Edit Tags
    </button>
    <button class="mp-create-tag-playlist" type="button" title="Create Playlist from Tags">
        <i class="fas fa-filter"></i> Tag Playlist
    </button>
    </div>
`;

export async function confirmationDialog(message = "Are you sure?") {
    const proceed = await foundry.applications.api.DialogV2.confirm({
        content: message,
        rejectClose: false,
        modal: true,
    });
    return proceed;
}

export function handleMPClick(event) {
    const target = event.currentTarget;
    const handler = target.dataset.wgtngm;

    if (!handler) return;

    event.preventDefault();

    const parts = handler.split("|");
    const module = parts[0];
    const action = parts[1];
    const args = parts.slice(2);
    if (module !== MODULE_NAME) {
        return;
    }
    // console.log(module);
    switch (action) {
        case "openMenu":
            if (args[0]) {
                game.settings.sheet.render(true, { tab: args[0] });
            }
            break;
        case "openWindow":
            if (args[0]) {
                window.open(args[0], "_blank");
            }
            break;
        default:
            break;
    }
}

export async function removePlaylists(){
    const proceed = await confirmationDialog("Are you sure you want to remove all the imported playlists?");
    if (proceed){
    };
  }

export function addplaylistDirectoryUI(html) {
    const nativeHtml = html instanceof jQuery ? html[0] : html;
    if (!game.user.isGM) return;

    const directoryHeader = nativeHtml.querySelector(".directory-header");
    if (directoryHeader) {
        directoryHeader.insertAdjacentHTML("beforeend", getButtonGrouphead());
    }

    nativeHtml
        .querySelector(".mp-miniplayer-open")
        ?.addEventListener("click", async () => {
            openwgtngmMiniPlayerSheet();
        });

    nativeHtml
        .querySelector(".mp-update-playlists")
        ?.addEventListener("click", async () => {
            game.wgtngmMiniPlayer.importer.importFromDirectory();
        });

    nativeHtml
        .querySelector(".mp-remove-playlists")
        ?.addEventListener("click", async () => {
            game.wgtngmMiniPlayer.importer.removeImportedPlaylists();
        });


    nativeHtml
        .querySelector(".mp-soundboard-open")
        ?.addEventListener("click", async () => {
            openwgtngmSoundboardSheet();
        });

nativeHtml.querySelector(".mp-edit-tags")?.addEventListener("click", () => {
        new TagEditor().render(true);
    });

    nativeHtml.querySelector(".mp-create-tag-playlist")?.addEventListener("click", () => {
        new TagPlaylistGenerator().render(true);
    });



}
export function openIfOpened (){
    const rememberState = game.settings.get("wgtgm-mini-player", "remember-open-state"); 
    const playerStates = game.settings.get("wgtgm-mini-player", "mpSbOpened"); 
    if (rememberState && playerStates?.mp){openwgtngmMiniPlayerSheet();}
    if (rememberState && playerStates?.sb){openwgtngmSoundboardSheet();}
}


export function openwgtngmMiniPlayerSheet() {
    if (
        game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance &&
        game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.rendered
    ) {
        game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.close();
        return;
    }

    let savedDimensions = game.settings.get(
        "wgtgm-mini-player",
        "mpSheetDimensions",
    );
    game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance = new wgtngmMiniPlayerSheet({
        position: {
            width: savedDimensions?.width ?? 240,
            height: savedDimensions?.height ?? 190,
            left: savedDimensions?.left ?? 40,
            top: savedDimensions?.top ?? 40
        },
    });
    game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.render(true);
}


export function openwgtngmSoundboardSheet() {
    if (game.wgtngmSoundboard.wgtngmSoundboardInstance && game.wgtngmSoundboard.wgtngmSoundboardInstance.rendered) {
      game.wgtngmSoundboard.wgtngmSoundboardInstance.close();
      return;
    }

    let savedDimensions = game.settings.get("wgtgm-mini-player", "sbSheetDimensions");
    game.wgtngmSoundboard.wgtngmSoundboardInstance = new wgtngmSoundboardSheet({ 
        position: { 
            width: savedDimensions?.width ?? 240,
            height: savedDimensions?.height ?? 320,
            left: savedDimensions?.left ?? 40,
            top: savedDimensions?.top ?? 40
        } 
    });
    game.wgtngmSoundboard.wgtngmSoundboardInstance.render(true);
}

export function checkAndRender(playlist){
    if (game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance?.dontUpdate) return;
    debouncedRender(playlist);
}

const debouncedRender = foundry.utils.debounce((playlist) => {
    if (game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance?.rendered && playlist.mode !== CONST.PLAYLIST_MODES.DISABLED) {
        game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.render();
    }
    if (game.wgtngmSoundboard.wgtngmSoundboardInstance?.rendered && playlist.mode === CONST.PLAYLIST_MODES.DISABLED) {
        game.wgtngmSoundboard.wgtngmSoundboardInstance.render();
    }
}, 100);



