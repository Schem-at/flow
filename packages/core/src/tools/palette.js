/**
 * A picker choice ({preset, include[], exclude[], replace{}}) as a nucleation
 * Palette, mirroring app/Tools/Palette/PaletteResolver.php.
 *
 * The static names are copied from node_modules/nucleation/Palette.d.ts and
 * PaletteBuilder.d.ts. Two things the typings do not offer, and what is done
 * instead:
 *   - there is no "survival" preset on Palette, so it is built with
 *     PaletteBuilder exactly as PHP does. Its setters return void, so they are
 *     four statements, never a chain.
 *   - there is no way to drop a block from a Palette, so exclude reads
 *     blockIdsJson(), filters in JS, and rebuilds with Palette.fromBlockIds().
 */

const PRESET_STATICS = {
    solid: 'solid',
    materials: 'materials',
    concrete: 'concrete',
    wool: 'wool',
    terracotta: 'terracotta',
    wood: 'wood',
    grayscale: 'grayscale',
};

function decode(json) {
    const list = JSON.parse(json || '[]');

    return Array.isArray(list) ? list.map(String) : [];
}

function survivalIds(nucleation) {
    const builder = nucleation.PaletteBuilder.create();
    builder.survivalOnly();
    builder.fullBlocksOnly();
    builder.excludeFalling();
    builder.excludeTileEntities();

    return decode(builder.build().blockIdsJson());
}

/** @returns {string[]} the ids the choice asks for, before Palette.fromBlockIds */
export function resolveBlockIds(nucleation, choice = {}) {
    const preset = choice.preset || 'solid';
    const include = (choice.include || []).map(String);
    const exclude = new Set((choice.exclude || []).map(String));

    let base = [];
    if (preset === 'custom') {
        base = [];
    } else if (preset === 'survival') {
        base = survivalIds(nucleation);
    } else {
        const staticName = Object.hasOwn(PRESET_STATICS, preset) ? PRESET_STATICS[preset] : 'solid';
        base = decode(nucleation.Palette[staticName]().blockIdsJson());
    }

    const ids = [...new Set([...base, ...include])];

    return ids.filter((id) => !exclude.has(id));
}

/**
 * @returns {{palette: object, replace: Object<string,string>, ids: string[]}}
 * The replace map travels alongside the palette rather than inside it, because
 * it is applied after the colour match, never during it.
 */
export function resolvePalette(nucleation, choice = {}) {
    const ids = resolveBlockIds(nucleation, choice);
    if (ids.length === 0) throw new Error('The palette has no blocks in it.');

    return {
        palette: nucleation.Palette.fromBlockIds(JSON.stringify(ids)),
        // Filtered as PaletteChoice::fromArray does: an entry whose target is
        // not a non-empty string is dropped rather than mapping a block to
        // nothing.
        replace: Object.fromEntries(
            Object.entries(choice.replace || {}).filter(([, to]) => typeof to === 'string' && to !== ''),
        ),
        ids,
    };
}

/**
 * A ColorSource over a resolved Palette, preserving the original converter colour matching.
 * Plain lookups are memoised per colour; dithered lookups key on position too,
 * so they are not.
 */
export function paletteColorSource(palette, dither = false) {
    palette = palette.forMaterial(false);
    if (palette.len() === 0) throw new Error('This tool needs opaque blocks. Add a solid block to the palette.');
    const memo = new Map();

    return {
        closest(r, g, b, pos = null) {
            if (dither) {
                const [x, y, z] = pos || [0, 0, 0];

                return palette.closestBlockDithered(r, g, b, x, y, z);
            }

            const key = (r << 16) | (g << 8) | b;
            let hit = memo.get(key);
            if (hit === undefined) {
                hit = palette.closestBlock(r, g, b);
                memo.set(key, hit);
            }

            return hit;
        },
    };
}
