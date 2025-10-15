import { MODULE_NAME } from "./settings.js";
/**
 * localization.
 * @type {string}
 */
import { wgtngmMiniPlayerSheet } from "./mp-player.js";

export const localize = (key) => game.i18n.localize(`wgtngmMiniPlayer.${key}`);

export const format = (key, data) => game.i18n.format(`wgtngmMiniPlayer.${key}`, data);

export const renderTemplate = foundry.applications.handlebars.renderTemplate;

export function formatTimestamp(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";
    seconds = Math.round(seconds);
    const minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    return `${minutes.paddedString(2)}:${seconds.paddedString(2)}`;
}


export const getButtonGrouphead = () => `
    <div class="mp-miniplayer-button" >
        <button class="mp-miniplayer-open" type="button" title="open the miniplayer" data-action="openMP" >
            <i class="fas fa-music"></i> Open the Mini Player
        </button>
    </div>
`;


export async function confirmationDialog(message = "Are you sure?"){
    const proceed = await foundry.applications.api.DialogV2.confirm({
        content: message,
        rejectClose: false,
        modal: true
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
    console.log(module);
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
}

export function openwgtngmMiniPlayerSheet() {
    if (game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance && game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.rendered) {
      return;
    }

    let savedDimensions = game.settings.get("wgtgm-mini-player", "mpSheetDimensions");
    const height = savedDimensions?.height || 190;
    game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance = new wgtngmMiniPlayerSheet({ 
        position: { 
            width: savedDimensions?.width || 320,
            height: height,
            left: savedDimensions?.left || 20,
            top: savedDimensions?.top || window.innerHeight - height - 20
        } 
    });
    game.wgtngmMiniPlayer.wgtngmMiniPlayerInstance.render(true);
  }

