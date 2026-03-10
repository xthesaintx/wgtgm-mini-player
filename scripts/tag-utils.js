export function splitTagSelection(tagSelection) {
    const included = [];
    const excluded = [];

    for (const [tag, state] of tagSelection.entries()) {
        if (state === 1) included.push(tag);
        else if (state === -1) excluded.push(tag);
    }
    return { included, excluded };
}

export function matchesTagSelection(trackTags, included, excluded, matchMode = "AND") {
    if (excluded.some((tag) => trackTags.includes(tag))) return false;
    if (included.length === 0) return true;
    if (matchMode === "OR") return included.some((tag) => trackTags.includes(tag));
    return included.every((tag) => trackTags.includes(tag));
}

export function filterTracksBySelection(tracks, tagSelection, getTags, matchMode = "AND") {
    const { included, excluded } = splitTagSelection(tagSelection);
    if (included.length === 0 && excluded.length === 0) return tracks;

    return tracks.filter((track) => {
        const trackTags = getTags(track);
        return matchesTagSelection(trackTags, included, excluded, matchMode);
    });
}

export function sanitizeImportedTagData(importedData) {
    const sanitized = {};
    let skipped = 0;
    let validPaths = 0;

    if (!importedData || typeof importedData !== "object" || Array.isArray(importedData)) {
        return { sanitized, skipped: 1, validPaths: 0 };
    }

    for (const [path, tags] of Object.entries(importedData)) {
        if (!Array.isArray(tags) || typeof path !== "string") {
            skipped++;
            continue;
        }

        const cleanTags = tags
            .filter((tag) => typeof tag === "string" && tag.trim().length > 0)
            .map((tag) => tag.trim().toLowerCase());

        if (cleanTags.length === 0) {
            skipped++;
            continue;
        }

        sanitized[path] = [...new Set(cleanTags)];
        validPaths++;
    }

    return { sanitized, skipped, validPaths };
}
