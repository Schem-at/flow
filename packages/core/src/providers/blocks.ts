/** Reusable operations for authored graphs. There is no tool-id dispatcher. */
import type { RuntimeProvider } from './types.js';
import { loadedNucleationModule } from '../utils/schematic.js';
import { PixelMapper, imageBlocks, StatueBuilder, expandLegacy } from '../tools/pixels.js';
import { resolvePalette, paletteColorSource } from '../tools/palette.js';
import { assetBytes, browserImage, type PixelImage } from '../tools/assets.js';

import { BLOCKS_DTS } from './blocks-dts.js';
export { BLOCKS_DTS } from './blocks-dts.js';

export const blocksProvider: RuntimeProvider = {
  name: 'blocks', version: '1.0.0',
  endowmentKeys: () => ['Blocks'], declarations: () => BLOCKS_DTS,
  async create(env, context = {}) {
    // Nucleation initializes before this provider, outside the SES compartment.
    const native = loadedNucleationModule() as any;
    const Schematic = context.Schematic as any;
    const wrap = (value: any) => { const s = Object.create(Schematic.prototype); s.native = value; return s; };
    const raw = (s: any) => s.native ?? s;
    const decode = env.decodeImage ?? browserImage;
    function place(blocks: Record<string, number[][]>, name: string) {
      const s = native.Schematic.create(name);
      for (const [block, positions] of Object.entries(blocks)) s.setBlocks(positions.flat(), block);
      return wrap(s);
    }
    const Blocks = {
      palette: (choice = {}) => resolvePalette(native, choice),
      image: async (file: unknown, width?: number) => decode(assetBytes(file), width),
      async skin(username: string) {
        if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) throw new Error('Enter a Minecraft username.');
        const base = env.schemati?.baseUrl ?? (env.kind === 'node' ? (globalThis as any).process?.env?.SCHEMATI_URL : '') ?? '';
        let profile = env.skinProfiles?.[username.toLowerCase()];
        if (!profile) {
        const response = await fetch(`${base.replace(/\/$/, '')}/api/tools/assets/skins/${encodeURIComponent(username)}`, {
          credentials: env.kind === 'browser' ? 'include' : undefined,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(response.status === 404 ? 'No Minecraft account with that username.' : 'Could not fetch that skin. Try again shortly.');
        profile = await response.json() as { skin: string; name: string; slim: boolean };
        }
        let image = await decode(assetBytes({ base64: profile.skin }));
        if (image.width !== 64 || ![32, 64].includes(image.height)) throw new Error('Unsupported skin dimensions.');
        if (image.height === 32) image = expandLegacy(image);
        return { ...profile, image };
      },
      pixelArt(image: PixelImage, palette: any, orientation = 'wall', dither = false) {
        const mapper = new PixelMapper(paletteColorSource(palette.palette, dither), palette.replace);
        return place(imageBlocks(image, orientation === 'wall', mapper) as Record<string, number[][]>, 'image');
      },
      statue(skin: any, palette: any, scale = 1, overlay = 'flat', parts?: string[]) {
        const mapper = new PixelMapper(paletteColorSource(palette.palette), palette.replace);
        const builder = new StatueBuilder(skin.image, { scale, overlay, slim: skin.slim,
          overlayParts: StatueBuilder.partsFromList(parts ?? Object.keys(StatueBuilder.OVERLAY_PARTS)) } as any, mapper);
        return place(builder.blocks(), `${skin.name} statue`);
      },
      measure(schematic: any) {
        const s = raw(schematic), d = s.tightDimensions();
        const blocks = JSON.parse(s.countBlocksJson());
        return { dimensions: [d.x, d.y, d.z], block_count: s.blockCount(), blocks_used: blocks,
          palette_size: Object.keys(blocks).length, placed: s.blockCount() };
      },
      export(schematic: any, format = 'schem') {
        if (!['schem', 'litematic'].includes(format)) throw new Error('Unsupported output format.');
        return { base64: format === 'litematic' ? raw(schematic).toLitematicB64() : raw(schematic).toSchematicB64(), format };
      },
    };
    return { Blocks };
  },
};
