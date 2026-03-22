import {
    jsPDF
} from "https://esm.sh/jspdf@2.5.1";
import {
    svg2pdf
} from "https://esm.sh/svg2pdf.js";
import HanziWriter from "https://esm.sh/hanzi-writer";
import {
    pinyin
} from "https://esm.sh/pinyin-pro";

jsPDF.API.svg = function(el, opt) {
    return svg2pdf(el, this, opt);
};

const textarea = document.querySelector("textarea");
const preview = document.querySelector("#pdf-preview");
const modeSelect = document.querySelector("#mode");
const gridInputs = document.querySelectorAll("input[name='grid']");
const pinyinCheckbox = document.querySelector("#pinyin");
const message = document.getElementById("message");

// ================= UTIL =================
function extractChinese(text) {
    return text.match(/[\u4e00-\u9fff]/g) || [];
}

function getFinalChars() {
    const chars = extractChinese(textarea.value);
    if (chars.length) return chars;

    const placeholder = textarea.placeholder || "";
    const match = placeholder.match(/\((?:e\.g\.|eg\.?)\s*(.*?)\)/i);
    const example = match ? match[1] : "你好学习";

    return extractChinese(example);
}

function getGridType() {
    return document.querySelector("input[name='grid']:checked")?.value || "tian";
}

function getMode() {
    return modeSelect?.value || "trace";
}

function getShowPinyin() {
    return pinyinCheckbox?.checked;
}

// ================= GRID =================
function drawGrid(size, type) {
    let lines = "";

    if (type === "tian") {
        lines += `<line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}" stroke="#ddd"/>`;
        lines += `<line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}" stroke="#ddd"/>`;
    }

    if (type === "mi") {
        lines += `<line x1="0" y1="0" x2="${size}" y2="${size}" stroke="#ddd"/>`;
        lines += `<line x1="${size}" y1="0" x2="0" y2="${size}" stroke="#ddd"/>`;
        lines += `<line x1="${size / 2}" y1="0" x2="${size / 2}" y2="${size}" stroke="#ddd"/>`;
        lines += `<line x1="0" y1="${size / 2}" x2="${size}" y2="${size / 2}" stroke="#ddd"/>`;
    }

    return `<rect width="${size}" height="${size}" fill="none" stroke="#ddd"/>${lines}`;
}

// ================= LAYOUT =================
function getLayout() {
    const pageWidth = 800;
    const pageHeight = 1100;
    const marginX = 70;
    const marginTop = 90;
    const marginBottom = 40;
    const gap = 16;
    const cols = 8;

    const usableWidth = pageWidth - marginX * 2;
    const cellSize = Math.floor((usableWidth - gap * (cols - 1)) / cols);
    const totalWidth = cols * cellSize + (cols - 1) * gap;
    const offsetX = (pageWidth - totalWidth) / 2;

    const rowsPerPage = Math.floor(
        (pageHeight - marginTop - marginBottom + gap) / (cellSize + gap)
    );

    return {
        pageWidth,
        pageHeight,
        marginTop,
        gap,
        cols,
        cellSize,
        offsetX,
        rowsPerPage
    };
}

// ================= PRELOAD =================
async function preload(chars) {
    const map = {};
    await Promise.all(
        [...new Set(chars)].map(async c => {
            try {
                map[c] = await HanziWriter.loadCharacterData(c);
            } catch (e) {
                console.warn("Unsupported character:", c);
                map[c] = null;
            }
        })
    );
    return map;
}

// ================= PAGE BUILD =================
function buildPagesNormal(chars, rowsPerPage) {
    if (chars.length <= rowsPerPage) {
        return [Array.from({
            length: rowsPerPage
        }, (_, i) => chars[i % chars.length])];
    }
    const pages = [];
    for (let i = 0; i < chars.length; i += rowsPerPage) {
        pages.push(chars.slice(i, i + rowsPerPage));
    }
    return pages;
}

function getProgressiveHeight(strokes, cols) {
    const first = cols - 1;
    const remaining = Math.max(0, strokes - first);
    return 1 + Math.ceil(remaining / cols) + 1;
}

function buildPagesProgressive(chars, dataMap, rowsPerPage, cols) {
    const pages = [];
    let index = 0;

    while (index < chars.length) {
        let used = 0;
        const page = [];

        while (index < chars.length) {
            const char = chars[index];
            const data = dataMap[char];

            if (!data) {
                const h = 1;
                if (used + h > rowsPerPage) break;
                page.push(char);
                used += h;
                index++;
                continue;
            }

            const h = getProgressiveHeight(data.strokes.length, cols);
            if (used + h > rowsPerPage) break;

            page.push(char);
            used += h;
            index++;
        }

        if (!page.length) {
            page.push(chars[index]);
            index++;
        }

        pages.push(page);
    }

    return pages;
}

// ================= NORMAL =================
function buildNormalPage(rows, dataMap, layout) {
    const {
        pageWidth,
        pageHeight,
        marginTop,
        gap,
        cols,
        cellSize,
        offsetX
    } = layout;
    const gridType = getGridType();
    const mode = getMode();
    const showPinyin = getShowPinyin();

    let content = "";

    rows.forEach((char, row) => {
        const data = dataMap[char];
        const transform = data ?
            HanziWriter.getScalingTransform(cellSize, cellSize, 8) :
            null;

        const py = showPinyin ?
            pinyin(char, {
                toneType: "num",
                type: "array"
            })[0].toLowerCase() :
            "";

        for (let col = 0; col < cols; col++) {
            const x = offsetX + col * (cellSize + gap);
            const y = marginTop + row * (cellSize + gap);

            let glyph = "";
            if (data) {
                glyph = data.strokes.map(d => {
                    let fill = "#444";
                    if (mode === "trace") fill = "#bbb";
                    if (mode === "initial") fill = col === 0 ? "#bbb" : "none";
                    return `<path d="${d}" fill="${fill}"/>`;
                }).join("");
            }

            const fallbackText = (!data && col === 0) ?
                `<text x="${cellSize/2}" y="${cellSize*0.6}" text-anchor="middle"
            font-size="${cellSize*0.5}" fill="#bbb"
            font-family="Arial, Noto Sans, sans-serif">?</text>` :
                "";

            const pinyinText = (showPinyin && col === 0) ?
                `<text x="${cellSize/2}" y="${cellSize*0.95}" text-anchor="middle"
            font-size="${cellSize*0.18}" fill="#bbb"
            font-family="Arial, Noto Sans, sans-serif">${py}</text>` :
                "";

            content += `<g transform="translate(${x},${y})">
        ${drawGrid(cellSize, gridType)}
        ${fallbackText}
        ${pinyinText}
        ${data ? `<g transform="${transform.transform}">${glyph}</g>` : ""}
      </g>`;
        }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}">${content}</svg>`;
}

// ================= PROGRESSIVE =================
function buildProgressivePage(chars, dataMap, layout) {
    const {
        pageWidth,
        pageHeight,
        marginTop,
        gap,
        cols,
        cellSize,
        offsetX
    } = layout;
    const gridType = getGridType();
    const showPinyin = getShowPinyin();

    let content = "";
    let row = 0;

    chars.forEach(char => {
        const data = dataMap[char];

        if (!data) {
            const py = showPinyin ?
                pinyin(char, {
                    toneType: "num",
                    type: "array"
                })[0].toLowerCase() :
                "";

            for (let col = 0; col < cols; col++) {
                const x = offsetX + col * (cellSize + gap);
                const y = marginTop + row * (cellSize + gap);

                const fallbackText = col === 0 ?
                    `<text x="${cellSize/2}" y="${cellSize*0.6}" text-anchor="middle"
            font-size="${cellSize*0.5}" fill="#bbb"
            font-family="Arial, Noto Sans, sans-serif">?</text>` :
                    "";

                const pinyinText = (showPinyin && col === 0) ?
                    `<text x="${cellSize/2}" y="${cellSize*0.95}" text-anchor="middle"
              font-size="${cellSize*0.18}" fill="#bbb"
              font-family="Arial, Noto Sans, sans-serif">${py}</text>` :
                    "";

                content += `<g transform="translate(${x},${y})">
          ${drawGrid(cellSize, gridType)}
          ${fallbackText}
          ${pinyinText}
        </g>`;
            }

            row++;
            return;
        }

        const strokes = data.strokes;
        const transform = HanziWriter.getScalingTransform(cellSize, cellSize, 8);

        const py = showPinyin ?
            pinyin(char, {
                toneType: "num",
                type: "array"
            })[0].toLowerCase() :
            "";

        let i = 0;
        let first = true;

        while (i < strokes.length) {
            for (let col = 0; col < cols; col++) {
                const x = offsetX + col * (cellSize + gap);
                const y = marginTop + row * (cellSize + gap);

                let glyph = "";

                if (first && col === 0) {
                    glyph = strokes.map(d => `<path d="${d}" fill="#000"/>`).join("");
                } else if (i < strokes.length) {
                    glyph = strokes.map((d, idx) => {
                        if (idx > i) return "";
                        return `<path d="${d}" fill="#000" opacity="${idx === i ? 1 : 0.2}"/>`;
                    }).join("");
                    i++;
                }

                const pinyinText = (showPinyin && first && col === 0) ?
                    `<text x="${cellSize/2}" y="${cellSize*0.95}" text-anchor="middle"
              font-size="${cellSize*0.18}" fill="#bbb"
              font-family="Arial, Noto Sans, sans-serif">${py}</text>` :
                    "";

                content += `<g transform="translate(${x},${y})">
          ${drawGrid(cellSize, gridType)}
          ${pinyinText}
          <g transform="${transform.transform}">${glyph}</g>
        </g>`;
            }

            row++;
            first = false;
        }

        for (let col = 0; col < cols; col++) {
            const x = offsetX + col * (cellSize + gap);
            const y = marginTop + row * (cellSize + gap);
            content += `<g transform="translate(${x},${y})">${drawGrid(cellSize, gridType)}</g>`;
        }

        row++;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}">${content}</svg>`;
}

// ================= PDF =================
let currentPreviewUrl = null;

async function generate(chars) {
    const layout = getLayout();
    const dataMap = await preload(chars);
    const mode = getMode();

    const unsupported = [...new Set(chars.filter(c => !dataMap[c]))];
    const raw = textarea.value.trim();
    const rawChars = extractChinese(raw);

    if (raw.length && !rawChars.length) {
        message.textContent = "未检测到汉字";
    } else if (unsupported.length) {
        message.textContent = `不支持：${unsupported.join(" ")}`;
    } else {
        message.textContent = "";
    }

    const pages = mode === "progressive" ?
        buildPagesProgressive(chars, dataMap, layout.rowsPerPage, layout.cols) :
        buildPagesNormal(chars, layout.rowsPerPage);

    const doc = new jsPDF({
        unit: "px",
        format: [layout.pageWidth, layout.pageHeight]
    });

    for (let i = 0; i < pages.length; i++) {
        if (i) doc.addPage();

        const svg = mode === "progressive" ?
            buildProgressivePage(pages[i], dataMap, layout) :
            buildNormalPage(pages[i], dataMap, layout);

        const el = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

        await doc.svg(el, {
            x: 0,
            y: 0,
            width: layout.pageWidth,
            height: layout.pageHeight,
        });
    }

    if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
    }

    currentPreviewUrl = URL.createObjectURL(doc.output("blob"));
    preview.src = currentPreviewUrl + "#zoom=page-fit&toolbar=0";
}

async function generatePdfBlob(chars) {
    const layout = getLayout();
    const dataMap = await preload(chars);
    const mode = getMode();

    const pages = mode === "progressive" ?
        buildPagesProgressive(chars, dataMap, layout.rowsPerPage, layout.cols) :
        buildPagesNormal(chars, layout.rowsPerPage);

    const doc = new jsPDF({
        unit: "px",
        format: [layout.pageWidth, layout.pageHeight]
    });

    for (let i = 0; i < pages.length; i++) {
        if (i) doc.addPage();

        const svg = mode === "progressive" ?
            buildProgressivePage(pages[i], dataMap, layout) :
            buildNormalPage(pages[i], dataMap, layout);

        const el = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

        await doc.svg(el, {
            x: 0,
            y: 0,
            width: layout.pageWidth,
            height: layout.pageHeight,
        });
    }

    return doc.output("blob");
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ================= EVENTS =================
let t;

document.getElementById("share-btn")?.addEventListener("click", async () => {
    const chars = getFinalChars();
    const blob = await generatePdfBlob(chars);

    const file = new File([blob], "worksheet.pdf", {
        type: "application/pdf"
    });

    if (navigator.share && navigator.canShare?.({
            files: [file]
        })) {
        try {
            await navigator.share({
                title: "Chinese Worksheet",
                files: [file]
            });
        } catch (e) {
            console.error(e);
        }
    } else {
        downloadBlob(blob, "worksheet.pdf");
    }
});

document.getElementById("print-btn")?.addEventListener("click", async () => {
    await generate(getFinalChars());
    setTimeout(() => {
        preview.contentWindow?.focus();
        preview.contentWindow?.print();
    }, 200);
});

function update() {
    clearTimeout(t);

    t = setTimeout(() => {
        generate(getFinalChars());
    }, 200);
}

textarea.addEventListener("input", update);
modeSelect.addEventListener("change", update);
gridInputs.forEach(el => el.addEventListener("change", update));
pinyinCheckbox?.addEventListener("change", update);

update();