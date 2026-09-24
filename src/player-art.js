// Source atlases are preserved. Pack their hand-drawn poses into uniform runtime
// frames so floor position, physics body and mirror pivot never depend on a pose.
export const PLAYER_ART_SOURCES = [
  { key: 'bii-idle', file: 'idle.png', columns: 4 },
  { key: 'bii-walk', file: 'walk.png', columns: 8 },
  { key: 'bii-punch', file: 'punch.png', columns: 4 },
  { key: 'bii-combat', file: 'combat-atlas.png',
    columns: [0, 330, 641, 959, 1254], rows: [0, 360, 650, 946, 1254],
    rowColumns: { 1: [0, 330, 638, 925, 1254], 3: [0, 330, 641, 945, 1254] }, reference: 3 },
  { key: 'bii-reactions', file: 'reactions-atlas.png',
    columns: [0, 326, 641, 932, 1254], rows: [0, 357, 649, 946, 1254], reference: 3 },
];

export function sourceCells(source, width, height) {
  const xs = Array.isArray(source.columns) ? source.columns.map(n => n / 1254 * width)
    : Array.from({ length: source.columns + 1 }, (_, i) => i * width / source.columns);
  const ys = source.rows ? source.rows.map(n => n / 1254 * height) : [0, height];
  return ys.slice(0, -1).flatMap((y, row) => {
    const rowXs = source.rowColumns?.[row]?.map(n => n / 1254 * width) ?? xs;
    return rowXs.slice(0, -1).map((x, col) => ({
      x: Math.round(x), y: Math.round(y),
      width: Math.round(rowXs[col + 1]) - Math.round(x),
      height: Math.round(ys[row + 1]) - Math.round(y),
    }));
  });
}

export function packPlayerSource(image, source, makeCanvas) {
  const input = makeCanvas(image.width, image.height);
  const context = input.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const bounds = sourceCells(source, image.width, image.height).map(cell => {
    let left = cell.x + cell.width, top = cell.y + cell.height, right = cell.x, bottom = cell.y;
    for (let y = cell.y; y < cell.y + cell.height; y += 1) {
      for (let x = cell.x; x < cell.x + cell.width; x += 1) {
        if (pixels[(y * image.width + x) * 4 + 3] < 128) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    return { x: left, y: top, width: Math.max(1, right - left + 1), height: Math.max(1, bottom - top + 1) };
  });
  // A single scale per sheet preserves crouches, falls and attack extensions.
  const reference = bounds[source.reference ?? 0];
  const scale = Math.min(208 / reference.height, ...bounds.map(b => 246 / Math.max(b.width, b.height)));
  const output = makeCanvas(256 * bounds.length, 256);
  const out = output.getContext('2d');
  bounds.forEach((b, i) => {
    const w = b.width * scale, h = b.height * scale;
    out.drawImage(image, b.x, b.y, b.width, b.height, i * 256 + 128 - w / 2, 244 - h, w, h);
  });
  return output;
}

export function preparePlayerTextures(scene) {
  for (const source of PLAYER_ART_SOURCES) {
    if (scene.textures.exists(source.key) || !scene.textures.exists(`${source.key}-source`)) continue;
    const image = scene.textures.get(`${source.key}-source`).getSourceImage();
    const canvas = packPlayerSource(image, source, (width, height) => {
      const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
    });
    scene.textures.addSpriteSheet(source.key, canvas, { frameWidth: 256, frameHeight: 256 });
  }
}
