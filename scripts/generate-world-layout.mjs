import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to generate the world layout.");
}

const client = new OpenAI({ apiKey });
const outputDir = path.resolve("src/client/assets/generated");
const layoutJsonPath = path.resolve("src/shared/generated/world-layout.json");
const previewPath = path.join(outputDir, "world-layout-preview.png");
const masterplanPath = path.join(outputDir, "world-masterplan.png");
const manifestPath = path.join(outputDir, "manifest.json");

const WORLD_WIDTH = 1000;
const WORLD_HEIGHT = 1000;

const MacroBiome = {
  Plains: 0,
  Forest: 1,
  Mountain: 2,
  Water: 3
};

const Semantic = {
  Plains: 0,
  Forest: 1,
  Mountain: 2,
  Water: 3,
  Village: 4,
  Field: 5,
  Road: 6,
  Plaza: 7
};

const palette = [
  { id: Semantic.Plains, name: "plains", rgb: [120, 181, 87] },
  { id: Semantic.Forest, name: "forest", rgb: [63, 107, 54] },
  { id: Semantic.Mountain, name: "mountain", rgb: [143, 148, 152] },
  { id: Semantic.Water, name: "water", rgb: [66, 121, 181] },
  { id: Semantic.Village, name: "village", rgb: [182, 132, 77] },
  { id: Semantic.Field, name: "field", rgb: [192, 139, 82] },
  { id: Semantic.Road, name: "road", rgb: [214, 178, 122] },
  { id: Semantic.Plaza, name: "plaza", rgb: [230, 213, 162] }
];

const villageNames = [
  "Mossfen",
  "Dawnrest",
  "Cobblefork",
  "Lantern",
  "Pinewake",
  "Stonecross",
  "Brineford",
  "Southmill",
  "Ashfield",
  "Redgate",
  "Willowmere",
  "Briar Hollow",
  "Foxmere",
  "Oakrest",
  "Rillwatch",
  "Thornstead"
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hash(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function hash2d(seed, x, y) {
  return hash(seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263));
}

function indexOf(x, y, width = WORLD_WIDTH) {
  return y * width + x;
}

function inBounds(x, y, width = WORLD_WIDTH, height = WORLD_HEIGHT) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function nearestSemantic(r, g, b) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of palette) {
    const dr = r - entry.rgb[0];
    const dg = g - entry.rgb[1];
    const db = b - entry.rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best.id;
}

function neighbors4(x, y) {
  return [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y]
  ];
}

function applyMajorityFilter(grid, width, height) {
  const next = grid.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const counts = new Uint16Array(palette.length);
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const value = grid[indexOf(x + ox, y + oy, width)];
          counts[value] += 1;
        }
      }
      let winner = grid[indexOf(x, y, width)];
      let winnerCount = 0;
      for (let id = 0; id < counts.length; id += 1) {
        if (counts[id] > winnerCount) {
          winner = id;
          winnerCount = counts[id];
        }
      }
      next[indexOf(x, y, width)] = winner;
    }
  }
  return next;
}

function removeSpeckles(grid, width, height) {
  const next = grid.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const current = grid[indexOf(x, y, width)];
      let same = 0;
      const counts = new Uint16Array(palette.length);
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) {
            continue;
          }
          const value = grid[indexOf(x + ox, y + oy, width)];
          counts[value] += 1;
          if (value === current) {
            same += 1;
          }
        }
      }
      if (same >= 2) {
        continue;
      }
      let winner = current;
      let winnerCount = 0;
      for (let id = 0; id < counts.length; id += 1) {
        if (counts[id] > winnerCount) {
          winner = id;
          winnerCount = counts[id];
        }
      }
      next[indexOf(x, y, width)] = winner;
    }
  }
  return next;
}

function markDisk(mask, centerX, centerY, radius) {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (!inBounds(x, y)) {
        continue;
      }
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radius * radius) {
        mask[indexOf(x, y)] = 1;
      }
    }
  }
}

function markRect(mask, startX, startY, width, height) {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      if (inBounds(x, y)) {
        mask[indexOf(x, y)] = 1;
      }
    }
  }
}

function clearDisk(mask, centerX, centerY, radius) {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (!inBounds(x, y)) {
        continue;
      }
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radius * radius) {
        mask[indexOf(x, y)] = 0;
      }
    }
  }
}

function drawLine(mask, fromX, fromY, toX, toY) {
  let x = fromX;
  let y = fromY;
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  const stepX = fromX < toX ? 1 : -1;
  const stepY = fromY < toY ? 1 : -1;
  let error = dx - dy;

  while (true) {
    if (inBounds(x, y)) {
      mask[indexOf(x, y)] = 1;
    }
    if (x === toX && y === toY) {
      break;
    }
    const twice = error * 2;
    if (twice > -dy) {
      error -= dy;
      x += stepX;
    }
    if (twice < dx) {
      error += dx;
      y += stepY;
    }
  }
}

function drawOrganicRoad(mask, fromX, fromY, toX, toY, seed) {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  if (distance < 90) {
    drawLine(mask, fromX, fromY, toX, toY);
    return;
  }

  const midX = Math.round((fromX + toX) / 2 + ((hash2d(seed, fromX, toX) % 61) - 30));
  const midY = Math.round((fromY + toY) / 2 + ((hash2d(seed, fromY, toY) % 61) - 30));
  drawLine(mask, fromX, fromY, midX, midY);
  drawLine(mask, midX, midY, toX, toY);
}

function encodeRle(source) {
  const output = [];
  let current = source[0];
  let count = 1;

  for (let index = 1; index < source.length; index += 1) {
    const value = source[index];
    if (value === current && count < 65535) {
      count += 1;
      continue;
    }
    output.push(count, current);
    current = value;
    count = 1;
  }
  output.push(count, current);
  return output;
}

async function generateMasterplanImage() {
  const prompt = [
    "Create a top-down pixel-art MMO world planning map.",
    "One pixel represents one world tile.",
    "The map must show coherent villages, towns, fields, forests, mountains, a coast sea, lakes, and one main river.",
    "Village districts must be clustered, roads must visibly connect settlements, and the land should feel hand-authored rather than random.",
    "Use only these exact flat colors with no anti-aliasing, no gradients, no text, no icons, no outlines, and no shading:",
    "plains #78B557, forest #3F6B36, mountain #8F9498, water #4279B5, village #B6844D, field #C08B52, road #D6B27A, plaza #E6D5A2.",
    "Think like a beautiful retro RPG overworld seen from directly above."
  ].join(" ");

  const result = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
    prompt,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
    background: "opaque"
  });

  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) {
    throw new Error("World layout generation returned no image data.");
  }
  return Buffer.from(encoded, "base64");
}

async function classifyMasterplan(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(WORLD_WIDTH, WORLD_HEIGHT, { fit: "fill", kernel: sharp.kernel.nearest })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let semantic = new Uint8Array(info.width * info.height);
  for (let index = 0; index < semantic.length; index += 1) {
    const offset = index * info.channels;
    semantic[index] = nearestSemantic(data[offset], data[offset + 1], data[offset + 2]);
  }

  semantic = applyMajorityFilter(semantic, info.width, info.height);
  semantic = removeSpeckles(semantic, info.width, info.height);
  semantic = applyMajorityFilter(semantic, info.width, info.height);
  return semantic;
}

function findSemanticComponents(grid, allowed) {
  const visited = new Uint8Array(grid.length);
  const components = [];

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const startIndex = indexOf(x, y);
      if (visited[startIndex] || !allowed.has(grid[startIndex])) {
        continue;
      }

      const queueX = [x];
      const queueY = [y];
      let readIndex = 0;
      visited[startIndex] = 1;
      let size = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (readIndex < queueX.length) {
        const cx = queueX[readIndex];
        const cy = queueY[readIndex];
        readIndex += 1;
        size += 1;
        sumX += cx;
        sumY += cy;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);

        for (const [nx, ny] of neighbors4(cx, cy)) {
          if (!inBounds(nx, ny)) {
            continue;
          }
          const nextIndex = indexOf(nx, ny);
          if (visited[nextIndex] || !allowed.has(grid[nextIndex])) {
            continue;
          }
          visited[nextIndex] = 1;
          queueX.push(nx);
          queueY.push(ny);
        }
      }

      components.push({
        size,
        x: Math.round(sumX / size),
        y: Math.round(sumY / size),
        minX,
        minY,
        maxX,
        maxY
      });
    }
  }

  components.sort((a, b) => b.size - a.size);
  return components;
}

function pickFallbackCenters(terrain, count) {
  const centers = [];
  const sectorsX = 4;
  const sectorsY = 3;

  for (let sy = 0; sy < sectorsY; sy += 1) {
    for (let sx = 0; sx < sectorsX; sx += 1) {
      const originX = Math.floor((sx + 0.5) * (WORLD_WIDTH / sectorsX));
      const originY = Math.floor((sy + 0.5) * (WORLD_HEIGHT / sectorsY));

      for (let radius = 0; radius < 120; radius += 4) {
        let found = false;
        for (let y = originY - radius; y <= originY + radius && !found; y += 4) {
          for (let x = originX - radius; x <= originX + radius; x += 4) {
            if (!inBounds(x, y)) {
              continue;
            }
            const tile = terrain[indexOf(x, y)];
            if (tile === MacroBiome.Water || tile === MacroBiome.Mountain) {
              continue;
            }
            centers.push({
              tileX: x,
              tileY: y,
              radius: 22
            });
            found = true;
            break;
          }
        }
        if (found || centers.length >= count) {
          break;
        }
      }
      if (centers.length >= count) {
        return centers;
      }
    }
  }

  return centers;
}

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function buildVillageCenters(semantic, terrain) {
  const components = findSemanticComponents(semantic, new Set([Semantic.Village, Semantic.Plaza]));
  const centers = [];

  for (const component of components) {
    if (component.size < 120) {
      continue;
    }
    const nearExisting = centers.some((center) => distanceSquared(center.tileX, center.tileY, component.x, component.y) < 120 * 120);
    if (nearExisting) {
      continue;
    }
    centers.push({
      tileX: component.x,
      tileY: component.y,
      radius: clamp(Math.round(Math.sqrt(component.size) / 2.2), 20, 34)
    });
    if (centers.length >= 12) {
      break;
    }
  }

  if (centers.length < 8) {
    for (const fallback of pickFallbackCenters(terrain, 10 - centers.length)) {
      const nearExisting = centers.some((center) => distanceSquared(center.tileX, center.tileY, fallback.tileX, fallback.tileY) < 140 * 140);
      if (!nearExisting) {
        centers.push(fallback);
      }
      if (centers.length >= 10) {
        break;
      }
    }
  }

  return centers.map((center, id) => ({
    id,
    name: villageNames[id % villageNames.length],
    radius: center.radius,
    tileX: center.tileX,
    tileY: center.tileY
  }));
}

function buildRoadEdges(centers) {
  if (centers.length <= 1) {
    return [];
  }

  const connected = new Set([0]);
  const edges = [];

  while (connected.size < centers.length) {
    let best = null;
    for (const from of connected) {
      for (let to = 0; to < centers.length; to += 1) {
        if (connected.has(to)) {
          continue;
        }
        const distance = distanceSquared(centers[from].tileX, centers[from].tileY, centers[to].tileX, centers[to].tileY);
        if (!best || distance < best.distance) {
          best = { from, to, distance };
        }
      }
    }
    if (!best) {
      break;
    }
    connected.add(best.to);
    edges.push([best.from, best.to]);
  }

  for (let index = 0; index < centers.length; index += 1) {
    const nearest = centers
      .map((center, other) => ({
        other,
        distance: other === index ? Number.POSITIVE_INFINITY : distanceSquared(centers[index].tileX, centers[index].tileY, center.tileX, center.tileY)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);

    for (const entry of nearest) {
      if (entry.distance > 260 * 260) {
        continue;
      }
      const already = edges.some(([from, to]) => (from === index && to === entry.other) || (from === entry.other && to === index));
      if (!already) {
        edges.push([index, entry.other]);
      }
    }
  }

  return edges;
}

function buildStructuredWorld(semantic) {
  const terrain = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const villageMask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const plazaMask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const housingMask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const fieldMask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const roadMask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const bridgeMask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);

  for (let index = 0; index < semantic.length; index += 1) {
    const value = semantic[index];
    if (value === Semantic.Water) {
      terrain[index] = MacroBiome.Water;
    } else if (value === Semantic.Forest) {
      terrain[index] = MacroBiome.Forest;
    } else if (value === Semantic.Mountain) {
      terrain[index] = MacroBiome.Mountain;
    } else {
      terrain[index] = MacroBiome.Plains;
    }

    if (value === Semantic.Field) {
      fieldMask[index] = 1;
    }
    if (value === Semantic.Road) {
      roadMask[index] = 1;
    }
    if (value === Semantic.Plaza) {
      plazaMask[index] = 1;
    }
  }

  const centers = buildVillageCenters(semantic, terrain);
  const edges = buildRoadEdges(centers);

  for (const center of centers) {
    markDisk(villageMask, center.tileX, center.tileY, center.radius);
    markDisk(plazaMask, center.tileX, center.tileY, 6);

    const seed = hash2d(1701, center.tileX, center.tileY);
    const blocks = [
      [center.tileX - 16, center.tileY - 20, 10, 7],
      [center.tileX + 6, center.tileY - 18, 11, 6],
      [center.tileX - 17, center.tileY + 12, 12, 7],
      [center.tileX + 5, center.tileY + 14, 10, 6]
    ];

    for (let index = 0; index < blocks.length; index += 1) {
      const [x, y, width, height] = blocks[index];
      const offsetX = (hash2d(seed + index, x, y) % 5) - 2;
      const offsetY = (hash2d(seed + index + 91, y, x) % 5) - 2;
      markRect(housingMask, x + offsetX, y + offsetY, width, height);
    }

    const farmPatches = [
      [center.tileX - 44, center.tileY - 38, 20, 14],
      [center.tileX + 20, center.tileY - 36, 20, 14],
      [center.tileX - 42, center.tileY + 24, 22, 14],
      [center.tileX + 18, center.tileY + 22, 20, 14]
    ];
    for (const [x, y, width, height] of farmPatches) {
      markRect(fieldMask, x, y, width, height);
    }

    drawOrganicRoad(roadMask, center.tileX - center.radius, center.tileY, center.tileX + center.radius, center.tileY, seed);
    drawOrganicRoad(roadMask, center.tileX, center.tileY - center.radius, center.tileX, center.tileY + center.radius, seed + 1);
    drawOrganicRoad(roadMask, center.tileX - 20, center.tileY - 12, center.tileX + 20, center.tileY - 12, seed + 2);
    drawOrganicRoad(roadMask, center.tileX - 20, center.tileY + 12, center.tileX + 20, center.tileY + 12, seed + 3);
  }

  for (const [fromId, toId] of edges) {
    const from = centers[fromId];
    const to = centers[toId];
    drawOrganicRoad(roadMask, from.tileX, from.tileY, to.tileX, to.tileY, hash2d(2701, from.tileX + to.tileX, from.tileY + to.tileY));
  }

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const cellIndex = indexOf(x, y);
      if (!roadMask[cellIndex] || terrain[cellIndex] !== MacroBiome.Water) {
        continue;
      }
      bridgeMask[cellIndex] = 1;
    }
  }

  for (const center of centers) {
    clearDisk(fieldMask, center.tileX, center.tileY, 12);
    clearDisk(housingMask, center.tileX, center.tileY, 8);
    clearDisk(roadMask, center.tileX, center.tileY, 1);
  }

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const cellIndex = indexOf(x, y);
      const water = terrain[cellIndex] === MacroBiome.Water;
      if (villageMask[cellIndex] || housingMask[cellIndex] || plazaMask[cellIndex] || fieldMask[cellIndex]) {
        terrain[cellIndex] = MacroBiome.Plains;
      }
      if (water) {
        villageMask[cellIndex] = 0;
        housingMask[cellIndex] = 0;
        plazaMask[cellIndex] = 0;
        fieldMask[cellIndex] = 0;
        if (!bridgeMask[cellIndex]) {
          roadMask[cellIndex] = 0;
        }
      }
      if (roadMask[cellIndex] || bridgeMask[cellIndex]) {
        fieldMask[cellIndex] = 0;
      }
      if (villageMask[cellIndex] || housingMask[cellIndex] || plazaMask[cellIndex] || fieldMask[cellIndex] || roadMask[cellIndex]) {
        if (terrain[cellIndex] === MacroBiome.Mountain) {
          terrain[cellIndex] = MacroBiome.Plains;
        }
      }
    }
  }

  return {
    terrain,
    villageMask,
    plazaMask,
    housingMask,
    fieldMask,
    roadMask,
    bridgeMask,
    villageCenters: centers.map((center) => ({
      ...center,
      macroX: Math.floor(center.tileX / 10),
      macroY: Math.floor(center.tileY / 10)
    }))
  };
}

async function writePreview(structured) {
  const preview = Buffer.alloc(WORLD_WIDTH * WORLD_HEIGHT * 3);
  for (let index = 0; index < structured.terrain.length; index += 1) {
    let rgb = palette[Semantic.Plains].rgb;
    const terrain = structured.terrain[index];
    if (terrain === MacroBiome.Forest) {
      rgb = palette[Semantic.Forest].rgb;
    } else if (terrain === MacroBiome.Mountain) {
      rgb = palette[Semantic.Mountain].rgb;
    } else if (terrain === MacroBiome.Water) {
      rgb = palette[Semantic.Water].rgb;
    }

    if (structured.fieldMask[index]) {
      rgb = palette[Semantic.Field].rgb;
    }
    if (structured.villageMask[index]) {
      rgb = palette[Semantic.Village].rgb;
    }
    if (structured.housingMask[index]) {
      rgb = [168, 121, 72];
    }
    if (structured.plazaMask[index]) {
      rgb = palette[Semantic.Plaza].rgb;
    }
    if (structured.roadMask[index]) {
      rgb = palette[Semantic.Road].rgb;
    }
    if (structured.bridgeMask[index]) {
      rgb = [170, 122, 71];
    }

    preview[index * 3] = rgb[0];
    preview[index * 3 + 1] = rgb[1];
    preview[index * 3 + 2] = rgb[2];
  }

  await sharp(preview, {
    raw: {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      channels: 3
    }
  })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(previewPath);
}

async function run() {
  await mkdir(outputDir, { recursive: true });

  const rawMasterplan = await generateMasterplanImage();
  const semantic = await classifyMasterplan(rawMasterplan);
  const structured = buildStructuredWorld(semantic);

  await sharp(rawMasterplan)
    .resize(WORLD_WIDTH, WORLD_HEIGHT, { fit: "fill", kernel: sharp.kernel.nearest })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(masterplanPath);

  await writePreview(structured);

  await writeFile(
    layoutJsonPath,
    `${JSON.stringify(
      {
        version: 2,
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        terrainRle: encodeRle(structured.terrain),
        villageRle: encodeRle(structured.villageMask),
        plazaRle: encodeRle(structured.plazaMask),
        housingRle: encodeRle(structured.housingMask),
        fieldRle: encodeRle(structured.fieldMask),
        roadRle: encodeRle(structured.roadMask),
        bridgeRle: encodeRle(structured.bridgeMask),
        villageCenters: structured.villageCenters
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  let manifest = { tiles: {}, objects: {}, players: {} };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    manifest = { tiles: {}, objects: {}, players: {} };
  }
  manifest.worldMasterplan = "world-masterplan.png";
  manifest.worldLayoutPreview = "world-layout-preview.png";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`generated AI world masterplan ${WORLD_WIDTH}x${WORLD_HEIGHT}`);
  console.log(`villages=${structured.villageCenters.length}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
