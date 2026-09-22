/**
 * Extracts every ```mermaid fence from a Markdown document.
 *
 * Generic fenced blocks are tracked so a ```mermaid example nested inside a
 * longer ````markdown fence is ignored, and indentation is preserved so fences
 * inside list items round-trip correctly on rewrite.
 */
export function extractMermaidFences(markdown) {
    const lines = markdown.split("\n");
    const fences = [];
    let open;
    let genericFenceMarker;
    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const match = /^(\s*)(`{3,})\s*(\S*)\s*$/u.exec(line);
        if (open) {
            if (match && match[2].length >= open.fence.marker.length && !match[3]) {
                fences.push({
                    ...open.fence,
                    closeLine: idx,
                    body: open.bodyLines.join("\n"),
                });
                open = undefined;
            }
            else {
                open.bodyLines.push(line);
            }
            continue;
        }
        if (genericFenceMarker) {
            if (match && match[2].length >= genericFenceMarker.length && !match[3]) {
                genericFenceMarker = undefined;
            }
            continue;
        }
        if (match && match[3].toLowerCase() === "mermaid") {
            open = {
                fence: { openLine: idx, indent: match[1], marker: match[2] },
                bodyLines: [],
            };
        }
        else if (match && match[3]) {
            genericFenceMarker = match[2];
        }
    }
    return fences;
}
