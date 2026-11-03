/**
 * The pixel geometry both runtimes share, ported from app/Tools/Pixels/.
 *
 * SkinLayout, StatueBuilder, PixelMapper and ImageMapper preserve the original
 * converter geometry. tests/fixtures/tools/expected.json is the historical
 * parity baseline, exercised by tests/js/tools/parity.test.js. Browser and
 * server graph execution now use this same implementation.
 *
 * Texels are always {width, height, data} where data is a Uint8ClampedArray of
 * RGBA rows, which is exactly what getImageData() returns.
 *
 * Alpha: GD runs 0 (opaque) to 127 (transparent) and PHP treats "alpha < 64" as
 * opaque. a_gd = 127 - (a_png >> 1), so the same test here is "a_png >= 128".
 */

const FACE_PRIORITY = ['front', 'back', 'right', 'left', 'top', 'bottom'];

/** Sheet origin of each part's base and overlay box. */
const ORIGIN = {
    head: { base: [0, 0], overlay: [32, 0] },
    body: { base: [16, 16], overlay: [16, 32] },
    right_arm: { base: [40, 16], overlay: [40, 32] },
    left_arm: { base: [32, 48], overlay: [48, 48] },
    right_leg: { base: [0, 16], overlay: [0, 32] },
    left_leg: { base: [16, 48], overlay: [0, 48] },
};

/**
 * The standard 64x64 skin layout, as one table. Each part is a box; each of its
 * six faces is a rectangle on the sheet. Coordinates are the top-left texel of
 * the face; a face is sampled with u to the right and v down.
 *
 * Box unwrap convention (Minecraft's): for a box of w x h x d at sheet origin
 * (ox, oy):
 *   top    (ox + d,       oy)        w x d
 *   bottom (ox + d + w,   oy)        w x d
 *   right  (ox,           oy + d)    d x h     (the model's right, viewer's left)
 *   front  (ox + d,       oy + d)    w x h
 *   left   (ox + d + w,   oy + d)    d x h
 *   back   (ox + 2d + w,  oy + d)    w x h
 */
export const SkinLayout = {
    PARTS: ['head', 'body', 'right_arm', 'left_arm', 'right_leg', 'left_leg'],

    FACES: ['front', 'back', 'right', 'left', 'top', 'bottom'],

    size(part, slim) {
        switch (part) {
            case 'head': return { w: 8, h: 8, d: 8 };
            case 'body': return { w: 8, h: 12, d: 4 };
            case 'right_arm':
            case 'left_arm': return { w: slim ? 3 : 4, h: 12, d: 4 };
            case 'right_leg':
            case 'left_leg': return { w: 4, h: 12, d: 4 };
            default: throw new Error(`Unknown skin part ${part}`);
        }
    },

    /**
     * Block offset of the part's min corner. The statue faces south (+z is its
     * front), stands on y=0, and is centred on x. The model's right arm is on
     * the viewer's left, so it gets the lower x.
     */
    position(part, slim) {
        const arm = slim ? 3 : 4;
        switch (part) {
            case 'head': return { x: arm, y: 24, z: 0 };
            case 'body': return { x: arm, y: 12, z: 2 };
            case 'right_arm': return { x: 0, y: 12, z: 2 };
            case 'left_arm': return { x: arm + 8, y: 12, z: 2 };
            case 'right_leg': return { x: arm, y: 0, z: 2 };
            case 'left_leg': return { x: arm + 4, y: 0, z: 2 };
            default: throw new Error(`Unknown skin part ${part}`);
        }
    },

    /** Sheet pixel for local face coordinate (u, v). */
    texel(part, face, u, v, layer, slim) {
        const [ox, oy] = ORIGIN[part][layer];
        const { w, d } = SkinLayout.size(part, slim);

        let fx;
        let fy;
        switch (face) {
            case 'top': [fx, fy] = [ox + d, oy]; break;
            case 'bottom': [fx, fy] = [ox + d + w, oy]; break;
            case 'right': [fx, fy] = [ox, oy + d]; break;
            case 'front': [fx, fy] = [ox + d, oy + d]; break;
            case 'left': [fx, fy] = [ox + d + w, oy + d]; break;
            case 'back': [fx, fy] = [ox + 2 * d + w, oy + d]; break;
            default: throw new Error(`Unknown face ${face}`);
        }

        return [fx + u, fy + v];
    },

    /** Face dimensions in texels: [across, down]. */
    faceSize(part, face, slim) {
        const { w, h, d } = SkinLayout.size(part, slim);
        switch (face) {
            case 'front':
            case 'back': return [w, h];
            case 'right':
            case 'left': return [d, h];
            case 'top':
            case 'bottom': return [w, d];
            default: throw new Error(`Unknown face ${face}`);
        }
    },
};

function texelAt(texels, x, y) {
    const i = (y * texels.width + x) * 4;
    const d = texels.data;

    return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
}

/**
 * Colour to block id through a colour source, then through the picker's replace
 * map. Replace runs after the match, so the matcher still sees the original
 * palette. Port of app/Tools/Pixels/PixelMapper.php.
 */
export class PixelMapper {
    constructor(colorSource, replace = {}) {
        this.colors = colorSource;
        this.replace = replace || {};
    }

    closest(r, g, b, pos = null) {
        const id = this.colors.closest(r, g, b, pos);

        return Object.prototype.hasOwnProperty.call(this.replace, id) ? this.replace[id] : id;
    }

    /** null when the texel is air (PNG alpha under 128, matching PHP's GD alpha 64 or more). */
    blockFor(r, g, b, a, pos = null) {
        if (a < 128) return null;

        return this.closest(r, g, b, pos);
    }
}

/**
 * 64x32 skins predate separate left limbs: mirror the right arm and leg into
 * the left slots. A horizontal flip of the whole 16x16 tile would reverse face
 * order around the box, so each face rectangle is copied to its own destination
 * slot and flipped individually, except right and left, which swap slots.
 * Port of SkinStatue::expandLegacy().
 */
export function expandLegacy(texels) {
    const out = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };

    // The whole legacy sheet first, then the mirrored faces on top.
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 64; x++) {
            const from = (y * texels.width + x) * 4;
            const to = (y * 64 + x) * 4;
            out.data[to] = texels.data[from];
            out.data[to + 1] = texels.data[from + 1];
            out.data[to + 2] = texels.data[from + 2];
            out.data[to + 3] = texels.data[from + 3];
        }
    }

    const copyFlipped = (sx, sy, dx, dy, w, h) => {
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const from = ((sy + y) * texels.width + (sx + (w - 1 - x))) * 4;
                const to = ((dy + y) * 64 + (dx + x)) * 4;
                out.data[to] = texels.data[from];
                out.data[to + 1] = texels.data[from + 1];
                out.data[to + 2] = texels.data[from + 2];
                out.data[to + 3] = texels.data[from + 3];
            }
        }
    };

    // right leg (0,16) -> left leg (16,48); right arm (40,16) -> left arm (32,48).
    for (const [sx, sy, dx, dy] of [[0, 16, 16, 48], [40, 16, 32, 48]]) {
        copyFlipped(sx + 4, sy + 4, dx + 4, dy + 4, 4, 12);   // front -> front
        copyFlipped(sx + 12, sy + 4, dx + 12, dy + 4, 4, 12); // back -> back
        copyFlipped(sx + 4, sy, dx + 4, dy, 4, 4);            // top -> top
        copyFlipped(sx + 8, sy, dx + 8, dy, 4, 4);            // bottom -> bottom
        copyFlipped(sx, sy + 4, dx + 8, dy + 4, 4, 12);       // right -> left slot
        copyFlipped(sx + 8, sy + 4, dx, dy + 4, 4, 12);       // left -> right slot
    }

    return out;
}

/**
 * Turns a 64x64 skin into block positions for a standing statue.
 * Port of app/Tools/Pixels/StatueBuilder.php, including its face priority and
 * its shell edge sampling.
 */
export class StatueBuilder {
    /** Overlay name as the option shows it => the SkinLayout part it covers. */
    static OVERLAY_PARTS = {
        hat: 'head',
        jacket: 'body',
        right_sleeve: 'right_arm',
        left_sleeve: 'left_arm',
        right_pants: 'right_leg',
        left_pants: 'left_leg',
    };

    /** @param {string[]} on the overlay names that are switched on */
    static partsFromList(on) {
        const map = {};
        for (const option of Object.keys(StatueBuilder.OVERLAY_PARTS)) map[option] = on.includes(option);

        return map;
    }

    constructor(texels, { scale = 1, overlay = 'none', overlayParts = null, slim = false } = {}, colorSource) {
        this.texels = texels;
        this.scale = scale;
        this.overlay = overlay;
        this.slim = slim;
        this.colors = colorSource;

        const parts = overlayParts || StatueBuilder.partsFromList(Object.keys(StatueBuilder.OVERLAY_PARTS));
        this.partOverlay = {};
        for (const [option, part] of Object.entries(StatueBuilder.OVERLAY_PARTS)) {
            // PHP reads `(bool) ($overlayParts[$option] ?? true)`: a missing key
            // is on, a present one is whatever it coerces to. `!== false` would
            // have kept 0, '' and null on where PHP turns them off.
            this.partOverlay[part] = option in parts ? Boolean(parts[option]) : true;
        }
    }

    /**
     * A shell only widens the statue when at least one part is grown. With every
     * part switched off the outer layer costs nothing, so the frame stays the
     * size of the base model.
     */
    grows() {
        return this.overlay === 'shell' && Object.values(this.partOverlay).some(Boolean);
    }

    /** @returns {[number, number, number]} width, height, depth in blocks */
    dimensions() {
        const grow = this.grows() ? 1 : 0;
        const arm = this.slim ? 3 : 4;
        const w = arm * 2 + 8 + 2 * grow;
        const h = 32 + grow;        // hat on top; feet stay on the ground
        const d = 8 + 2 * grow;     // shell grows both the front and the back

        return [w * this.scale, h * this.scale, d * this.scale];
    }

    /** @returns {Object<string, [number, number, number][]>} block id => positions */
    blocks() {
        const out = {};
        const seen = new Set();
        const shellShift = this.grows() ? 1 : 0;

        for (const part of SkinLayout.PARTS) {
            this.#placePart(part, 'base', 0, out, seen, shellShift);
            if (this.overlay === 'shell' && this.partOverlay[part]) {
                this.#placePart(part, 'overlay', 1, out, seen, shellShift);
            }
        }

        return out;
    }

    #placePart(part, layer, grow, out, seen, shellShift) {
        const size = SkinLayout.size(part, this.slim);
        const pos = SkinLayout.position(part, this.slim);
        const w = size.w + 2 * grow;
        let h = size.h + 2 * grow;
        const d = size.d + 2 * grow;
        const x0 = pos.x - grow + shellShift;
        let y0 = pos.y - grow;
        const z0 = pos.z - grow + shellShift;
        // Feet never sink: a grown leg keeps its sole on y=0.
        if (grow && (part === 'right_leg' || part === 'left_leg')) {
            y0 = 0;
            h -= 1;
        }
        const flat = layer === 'base' && this.overlay === 'flat' && this.partOverlay[part];

        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                for (let z = 0; z < d; z++) {
                    const onSurface = x === 0 || x === w - 1 || y === 0 || y === h - 1 || z === 0 || z === d - 1;
                    if (!onSurface) continue;

                    const face = this.#faceFor(x, y, z, w, h, d);
                    let [u, v] = this.#faceCoord(face, x, y, z, w, h, d);
                    if (grow) {
                        // A shell is a one-block layer outside the part: sample the overlay
                        // 1:1 against the base face, extending the edge texel across the
                        // ring, instead of stretching the whole face proportionally.
                        const [fw, fh] = SkinLayout.faceSize(part, face, this.slim);
                        u = Math.max(0, Math.min(fw - 1, u - 1));
                        v = Math.max(0, Math.min(fh - 1, v - 1));
                    }

                    const base = this.#texelColour(part, face, u, v, layer);
                    const over = flat ? this.#texelColour(part, face, u, v, 'overlay') : null;
                    // Flat overlay: the overlay texel wins when opaque (it paints the jacket
                    // or hat over the body, even where the body texel beneath is
                    // transparent); otherwise the base texel wins when opaque; otherwise air.
                    const colour = over !== null && over.a >= 128 ? over : (base.a >= 128 ? base : null);
                    if (colour === null) continue;

                    const block = this.colors.closest(colour.r, colour.g, colour.b, null);
                    this.#emit(out, seen, block, x0 + x, y0 + y, z0 + z);
                }
            }
        }
    }

    #texelColour(part, face, u, v, layer) {
        const [px, py] = SkinLayout.texel(part, face, u, v, layer, this.slim);

        return texelAt(this.texels, px, py);
    }

    #emit(out, seen, block, bx, by, bz) {
        const s = this.scale;
        for (let dx = 0; dx < s; dx++) {
            for (let dy = 0; dy < s; dy++) {
                for (let dz = 0; dz < s; dz++) {
                    const x = bx * s + dx;
                    const y = by * s + dy;
                    const z = bz * s + dz;
                    const key = `${x},${y},${z}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    (out[block] ||= []).push([x, y, z]);
                }
            }
        }
    }

    /** Which face a surface block belongs to, by priority. z = d-1 is the front (+z). */
    #faceFor(x, y, z, w, h, d) {
        for (const face of FACE_PRIORITY) {
            let on = false;
            switch (face) {
                case 'front': on = z === d - 1; break;
                case 'back': on = z === 0; break;
                case 'right': on = x === 0; break;   // model's right is the viewer's left
                case 'left': on = x === w - 1; break;
                case 'top': on = y === h - 1; break;
                case 'bottom': on = y === 0; break;
                default: on = false;
            }
            if (on) return face;
        }

        // Unreachable: onSurface already guarantees one of the six conditions above holds.
        throw new Error('Surface block matched no face; onSurface and faceFor are out of sync.');
    }

    /** Local face coordinate: u to the right on the sheet, v down. */
    #faceCoord(face, x, y, z, w, h, d) {
        const vDown = h - 1 - y;
        switch (face) {
            case 'front': return [x, vDown];
            case 'back': return [w - 1 - x, vDown];
            case 'right': return [z, vDown];          // sheet "right" face reads from back (z=0) to front
            case 'left': return [d - 1 - z, vDown];
            case 'top': return [x, z];                 // sheet top face: v grows towards the front
            case 'bottom': return [x, d - 1 - z];
            default: throw new Error(`Unknown face ${face}`);
        }
    }
}

/**
 * A resized image as block positions. Port of app/Tools/Pixels/ImageMapper.php.
 * Wall: the image's top row is the highest row. Floor: the top row is the far row.
 */
export function imageBlocks(texels, wall, colorSource) {
    const out = {};
    for (let y = 0; y < texels.height; y++) {
        for (let x = 0; x < texels.width; x++) {
            const c = texelAt(texels, x, y);
            if (c.a < 128) continue;
            const pos = wall ? [x, texels.height - 1 - y, 0] : [x, 0, y];
            (out[colorSource.closest(c.r, c.g, c.b, pos)] ||= []).push(pos);
        }
    }

    return out;
}

export function imageDimensions(texels, wall) {
    return wall ? [texels.width, texels.height, 1] : [texels.width, 1, texels.height];
}

/**
 * Eight fixed colours, nearest by squared distance in plain RGB, matching
 * App\Tools\Palette\FixedColorSource exactly, ties going to the first entry.
 * Test-only, but it lives here so both sides read from one table.
 */
export function stubColorSource() {
    const colors = [
        [0, 0, 0, 'minecraft:black_wool'],
        [255, 255, 255, 'minecraft:white_wool'],
        [255, 0, 0, 'minecraft:red_wool'],
        [0, 255, 0, 'minecraft:lime_wool'],
        [0, 0, 255, 'minecraft:blue_wool'],
        [255, 255, 0, 'minecraft:yellow_wool'],
        [0, 255, 255, 'minecraft:cyan_wool'],
        [255, 0, 255, 'minecraft:magenta_wool'],
    ];

    return {
        closest(r, g, b) {
            let best = null;
            let bestDistance = Infinity;
            for (const [cr, cg, cb, id] of colors) {
                const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = id;
                }
            }

            return best;
        },
    };
}
