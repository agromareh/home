/* ==========================================================================
   Zero-Dependency ISO/IEC 18004 QR Code Encoder (Byte Mode, EC Level M)
   Supports Versions 1–10 (up to 213 UTF-8 bytes) with full Reed-Solomon
   error correction, mask optimization, and crisp SVG/Canvas rendering.
   ========================================================================== */

(() => {
  // GF(256) tables with primitive polynomial 0x11d
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const rem = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ rem[0];
      rem.copyWithin(0, 1);
      rem[ecCount - 1] = 0;
      if (factor !== 0) {
        for (let j = 0; j < ecCount; j++) {
          rem[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return rem;
  }

  // ISO/IEC 18004 Table 9 — EC Level M (Versions 1–10)
  // [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data]
  const VERSION_M = [
    null,
    [10, 1, 16, 0, 0],  // V1  (21x21, max 14 bytes)
    [16, 1, 28, 0, 0],  // V2  (25x25, max 26 bytes)
    [26, 1, 44, 0, 0],  // V3  (29x29, max 42 bytes)
    [18, 2, 32, 0, 0],  // V4  (33x33, max 62 bytes)
    [24, 2, 43, 0, 0],  // V5  (37x37, max 84 bytes)
    [16, 4, 27, 0, 0],  // V6  (41x41, max 106 bytes)
    [18, 4, 31, 0, 0],  // V7  (45x45, max 122 bytes)
    [22, 2, 38, 2, 39], // V8  (49x49, max 152 bytes)
    [22, 3, 36, 2, 37], // V9  (53x53, max 180 bytes)
    [26, 4, 43, 1, 44], // V10 (57x57, max 213 bytes)
  ];

  // ISO/IEC 18004 Annex E — Alignment pattern center coordinates
  const ALIGNMENT_COORDS = [
    [],
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
  ];

  function encodeUtf8(str) {
    if (typeof TextEncoder !== "undefined") {
      return Array.from(new TextEncoder().encode(str));
    }
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      bytes.push(str.charCodeAt(i) & 0xff);
    }
    return bytes;
  }

  function pickVersion(byteLength) {
    for (let v = 1; v <= 10; v++) {
      const [, g1b, g1d, g2b, g2d] = VERSION_M[v];
      const totalDataBytes = g1b * g1d + g2b * g2d;
      const countBits = v <= 9 ? 8 : 16;
      const headerBits = 4 + countBits;
      const capacityBytes = Math.floor((totalDataBytes * 8 - headerBits) / 8);
      if (byteLength <= capacityBytes) return v;
    }
    throw new Error("URL is too long for QR Version 10 (max 213 bytes).");
  }

  function buildCodewords(bytes, version) {
    const [ecPerBlock, g1b, g1d, g2b, g2d] = VERSION_M[version];
    const totalDataBytes = g1b * g1d + g2b * g2d;
    const totalDataBits = totalDataBytes * 8;

    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };

    // Byte mode indicator (0100) + character count + payload
    pushBits(0b0100, 4);
    pushBits(bytes.length, version <= 9 ? 8 : 16);
    for (const b of bytes) pushBits(b, 8);

    // Terminator (up to 4 zero bits)
    const termLen = Math.min(4, totalDataBits - bits.length);
    pushBits(0, termLen);

    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Convert to bytes and add pad bytes (0xEC, 0x11)
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let val = 0;
      for (let j = 0; j < 8; j++) val = (val << 1) | bits[i + j];
      data.push(val);
    }
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (data.length < totalDataBytes) {
      data.push(padBytes[padIdx % 2]);
      padIdx++;
    }

    // Split into blocks and compute RS error correction
    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (let i = 0; i < g1b; i++) {
      const block = data.slice(offset, offset + g1d);
      offset += g1d;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecPerBlock));
    }
    for (let i = 0; i < g2b; i++) {
      const block = data.slice(offset, offset + g2d);
      offset += g2d;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecPerBlock));
    }

    // Interleave data codewords, then EC codewords
    const out = [];
    const maxDataLen = Math.max(g1d, g2d);
    for (let i = 0; i < maxDataLen; i++) {
      for (const block of dataBlocks) {
        if (i < block.length) out.push(block[i]);
      }
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (const ec of ecBlocks) {
        out.push(ec[i]);
      }
    }
    return out;
  }

  function formatInfoBits(mask) {
    // EC Level M = 00
    const data = (0b00 << 3) | mask;
    let rem = data << 10;
    const poly = 0b10100110111;
    for (let i = 14; i >= 10; i--) {
      if ((rem >>> i) & 1) rem ^= poly << (i - 10);
    }
    return ((data << 10) | rem) ^ 0b101010000010010;
  }

  function versionInfoBits(version) {
    let rem = version << 12;
    const poly = 0b1111100100101;
    for (let i = 17; i >= 12; i--) {
      if ((rem >>> i) & 1) rem ^= poly << (i - 12);
    }
    return (version << 12) | rem;
  }

  function createMatrix(version) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunction = Array.from({ length: size }, () => new Uint8Array(size));

    const setFunc = (r, c, dark) => {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      modules[r][c] = dark ? 1 : 0;
      isFunction[r][c] = 1;
    };

    // Finder patterns + separators
    const drawFinder = (top, left) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = top + dr;
          const c = left + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
          const dark = dist !== 2 && dist !== 4;
          setFunc(r, c, dark);
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }

    // Alignment patterns
    const coords = ALIGNMENT_COORDS[version];
    for (let i = 0; i < coords.length; i++) {
      for (let j = 0; j < coords.length; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === coords.length - 1) ||
          (i === coords.length - 1 && j === 0)
        ) {
          continue;
        }
        const cr = coords[i];
        const cc = coords[j];
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dist = Math.max(Math.abs(dr), Math.abs(dc));
            setFunc(cr + dr, cc + dc, dist !== 1);
          }
        }
      }
    }

    // Reserve format information areas + dark module
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        setFunc(8, i, false);
        setFunc(i, 8, false);
      }
    }
    for (let i = size - 8; i < size; i++) {
      setFunc(8, i, false);
      setFunc(i, 8, false);
    }
    setFunc(size - 8, 8, true); // Dark module

    // Version information (Versions 7+)
    if (version >= 7) {
      const vBits = versionInfoBits(version);
      for (let i = 0; i < 18; i++) {
        const bit = ((vBits >>> i) & 1) === 1;
        const a = Math.floor(i / 3);
        const b = size - 11 + (i % 3);
        setFunc(a, b, bit);
        setFunc(b, a, bit);
      }
    }

    return { size, modules, isFunction };
  }

  function placeData(matrix, codewords) {
    const { size, modules, isFunction } = matrix;
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    let upward = true;

    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let step = 0; step < size; step++) {
        const r = upward ? size - 1 - step : step;
        for (let dx = 0; dx < 2; dx++) {
          const c = right - dx;
          if (!isFunction[r][c]) {
            let dark = 0;
            if (bitIdx < totalBits) {
              dark = (codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
            }
            modules[r][c] = dark;
            bitIdx++;
          }
        }
      }
      upward = !upward;
    }
  }

  function maskCondition(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  }

  function applyFormat(modules, size, mask) {
    const bits = formatInfoBits(mask);
    // Bit 14..0 -> copy 1 (top-left) and copy 2 (bottom-left + top-right)
    const getBit = (i) => ((bits >>> i) & 1);

    // Top-left horizontal & vertical
    for (let i = 0; i <= 5; i++) modules[8][i] = getBit(14 - i);
    modules[8][7] = getBit(8);
    modules[8][8] = getBit(7);
    modules[7][8] = getBit(6);
    for (let i = 0; i <= 5; i++) modules[5 - i][8] = getBit(5 - i);

    // Bottom-left vertical (bits 14..8)
    for (let i = 0; i <= 6; i++) modules[size - 1 - i][8] = getBit(14 - i);

    // Top-right horizontal (bits 7..0)
    for (let i = 0; i <= 7; i++) modules[8][size - 8 + i] = getBit(7 - i);
  }

  function penaltyScore(modules, size) {
    let score = 0;

    // N1: 5+ consecutive same-color modules in rows & columns
    for (let r = 0; r < size; r++) {
      let runColor = modules[r][0];
      let runLen = 1;
      for (let c = 1; c < size; c++) {
        if (modules[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) score += 3 + (runLen - 5);
          runColor = modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }
    for (let c = 0; c < size; c++) {
      let runColor = modules[0][c];
      let runLen = 1;
      for (let r = 1; r < size; r++) {
        if (modules[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) score += 3 + (runLen - 5);
          runColor = modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }

    // N2: 2x2 blocks of same color
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = modules[r][c];
        if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
          score += 3;
        }
      }
    }

    // N4: dark module ratio balance
    let darkCount = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) darkCount += modules[r][c];
    }
    const percent = (darkCount * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return score;
  }

  function encode(text) {
    const bytes = encodeUtf8(text);
    const version = pickVersion(bytes.length);
    const codewords = buildCodewords(bytes, version);
    const base = createMatrix(version);
    placeData(base, codewords);

    let bestMask = 0;
    let bestScore = Infinity;
    let bestModules = null;

    for (let mask = 0; mask < 8; mask++) {
      const candidate = base.modules.map((row) => new Uint8Array(row));
      for (let r = 0; r < base.size; r++) {
        for (let c = 0; c < base.size; c++) {
          if (!base.isFunction[r][c] && maskCondition(mask, r, c)) {
            candidate[r][c] ^= 1;
          }
        }
      }
      applyFormat(candidate, base.size, mask);
      const score = penaltyScore(candidate, base.size);
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
        bestModules = candidate;
      }
    }

    return { version, mask: bestMask, size: base.size, modules: bestModules };
  }

  function toSvg(qr, options = {}) {
    const quietZone = options.quietZone ?? 4;
    const darkColor = options.darkColor || "#102d22";
    const lightColor = options.lightColor || "#ffffff";
    const total = qr.size + quietZone * 2;

    const paths = [];
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          paths.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
        }
      }
    }

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
      `role="img" aria-label="${(options.label || "QR code").replace(/"/g, "&quot;")}" shape-rendering="crispEdges">` +
      `<rect width="100%" height="100%" fill="${lightColor}"/>` +
      `<path d="${paths.join("")}" fill="${darkColor}"/>` +
      `</svg>`
    );
  }

  function drawToCanvas(qr, canvas, options = {}) {
    const quietZone = options.quietZone ?? 4;
    const darkColor = options.darkColor || "#102d22";
    const lightColor = options.lightColor || "#ffffff";
    const pixelSize = options.pixelSize || 1024;
    const total = qr.size + quietZone * 2;
    const scale = Math.floor(pixelSize / total);
    const dim = total * scale;

    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = darkColor;

    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          ctx.fillRect((c + quietZone) * scale, (r + quietZone) * scale, scale, scale);
        }
      }
    }
    return canvas;
  }

  const api = { encode, toSvg, drawToCanvas };
  if (typeof window !== "undefined") {
    window.AgroMarehQR = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
