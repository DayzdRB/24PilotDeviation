'use strict';

const zlib = require('zlib');

let cached;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makeImage() {
  const width = 1200;
  const height = 630;
  const pixels = Buffer.alloc(width * height * 3);

  function setPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
  }

  function rect(x, y, w, h, color) {
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx++) setPixel(xx, yy, color);
    }
  }

  function outlineRect(x, y, w, h, color, thickness) {
    rect(x, y, w, thickness, color);
    rect(x, y + h - thickness, w, thickness, color);
    rect(x, y, thickness, h, color);
    rect(x + w - thickness, y, thickness, h, color);
  }

  function circle(cx, cy, r, color) {
    const rr = r * r;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= rr) setPixel(x, y, color);
      }
    }
  }

  function ring(cx, cy, r, color, thickness) {
    const outer = r * r;
    const inner = (r - thickness) * (r - thickness);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy, d = dx * dx + dy * dy;
        if (d <= outer && d >= inner) setPixel(x, y, color);
      }
    }
  }

  function line(x1, y1, x2, y2, color, thickness) {
    const dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
    const dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      circle(x1, y1, Math.max(1, Math.floor(thickness / 2)), color);
      if (x1 === x2 && y1 === y2) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x1 += sx; }
      if (e2 <= dx) { err += dx; y1 += sy; }
    }
  }

  const bgA = [7, 16, 24], bgB = [11, 25, 37];
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const c = bgA.map((v, i) => Math.round(v + (bgB[i] - v) * t));
    rect(0, y, width, 1, c);
  }

  const blue = [82, 185, 232];
  const blue2 = [136, 216, 251];
  const panel = [8, 18, 28];
  const panel2 = [14, 25, 36];
  const lineColor = [39, 65, 84];
  const muted = [94, 122, 143];
  const white = [242, 247, 251];
  const green = [85, 214, 158];

  // Left-side 24PD identity and simplified instructional lines.
  rect(64, 52, 56, 56, [15, 32, 44]);
  outlineRect(64, 52, 56, 56, blue, 2);
  // Stylized “24”.
  line(77, 68, 96, 68, blue2, 4); line(96, 68, 96, 80, blue2, 4); line(96, 80, 77, 96, blue2, 4); line(77, 96, 98, 96, blue2, 4);
  line(104, 68, 104, 83, blue2, 4); line(104, 83, 116, 83, blue2, 4); line(116, 68, 116, 98, blue2, 4);

  rect(143, 57, 230, 10, white);
  rect(143, 79, 165, 6, muted);
  rect(64, 165, 130, 7, blue2);
  rect(64, 205, 430, 18, white);
  rect(64, 235, 365, 18, white);
  rect(64, 284, 455, 8, muted);
  rect(64, 305, 400, 8, muted);
  rect(64, 326, 430, 8, muted);

  // Three visual instruction rows.
  for (let i = 0; i < 3; i++) {
    circle(76, 418 + i * 48, 14, [17, 37, 51]);
    ring(76, 418 + i * 48, 14, blue, 2);
    rect(108, 411 + i * 48, 315 - i * 24, 8, [152, 178, 195]);
    rect(108, 427 + i * 48, 205 + i * 15, 5, muted);
  }

  // Phone/dialer card.
  rect(690, 72, 430, 500, panel);
  outlineRect(690, 72, 430, 500, lineColor, 2);
  rect(727, 108, 122, 7, blue2);
  rect(727, 137, 356, 70, [10, 27, 40]);
  outlineRect(727, 137, 356, 70, [42, 71, 92], 2);
  // Number-like bars in display.
  const bars = [52, 30, 30, 12, 52, 30, 30, 12, 52, 30, 30, 30];
  let bx = 752;
  for (const bw of bars) { rect(bx, 166, bw, 10, white); bx += bw + 7; if (bx > 1040) break; }

  const keyXs = [775, 905, 1035];
  const keyYs = [253, 334, 415, 496];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      circle(keyXs[c], keyYs[r], 31, panel2);
      ring(keyXs[c], keyYs[r], 31, [45, 66, 84], 2);
      if (r < 3) {
        // Small geometric numeral mark.
        const n = r * 3 + c + 1;
        rect(keyXs[c] - 8, keyYs[r] - 10, 16, 4, white);
        if (n % 2 === 0) rect(keyXs[c] + 4, keyYs[r] - 6, 4, 16, white);
        else rect(keyXs[c] - 4, keyYs[r] - 6, 4, 16, white);
        rect(keyXs[c] - 8, keyYs[r] + 8, 16, 4, white);
      } else if (c === 0) {
        line(keyXs[c]-8,keyYs[r],keyXs[c]+8,keyYs[r],white,3);
        line(keyXs[c],keyYs[r]-8,keyXs[c],keyYs[r]+8,white,3);
        line(keyXs[c]-6,keyYs[r]-6,keyXs[c]+6,keyYs[r]+6,white,3);
        line(keyXs[c]+6,keyYs[r]-6,keyXs[c]-6,keyYs[r]+6,white,3);
      } else if (c === 1) {
        ring(keyXs[c], keyYs[r], 10, white, 3);
      } else {
        line(keyXs[c]-8,keyYs[r]-6,keyXs[c]-8,keyYs[r]+6,white,3);
        line(keyXs[c]+8,keyYs[r]-6,keyXs[c]+8,keyYs[r]+6,white,3);
        line(keyXs[c]-13,keyYs[r]-2,keyXs[c]+13,keyYs[r]-2,white,3);
        line(keyXs[c]-13,keyYs[r]+5,keyXs[c]+13,keyYs[r]+5,white,3);
      }
    }
  }

  // Green response/call button with simplified handset.
  circle(905, 543, 31, green);
  line(892, 533, 899, 540, [4, 16, 24], 5);
  line(899, 540, 914, 548, [4, 16, 24], 5);
  line(914, 548, 921, 541, [4, 16, 24], 5);

  // Footer line.
  rect(64, 592, 420, 4, [56, 78, 95]);

  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 3, (y + 1) * width * 3);
  }

  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

module.exports = function handler(req, res) {
  if (!cached) cached = makeImage();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.status(200).send(cached);
};
