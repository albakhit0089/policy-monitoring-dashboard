// PILOT. Minimal .docx writer for the government decision note, English (left to right) or Arabic
// (right to left). No dependencies: a stored (uncompressed) zip holding the WordprocessingML parts.
// Kept separate from the dashboard's docx.js, whose layout is an FAO technical report.

const CRC = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
const crc32 = (bytes) => { let crc = 0xffffffff; for (let i = 0; i < bytes.length; i += 1) crc = CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
function zip(files) {
  const encoder = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  files.forEach(({ name, content }) => {
    const data = encoder.encode(content), fileName = encoder.encode(name), crc = crc32(data);
    const header = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5c21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(fileName.length), ...u16(0)];
    parts.push(new Uint8Array(header), fileName, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5c21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(fileName.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), fileName);
    offset += header.length + fileName.length + data.length;
  });
  const size = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0; all.forEach((part) => { out.set(part, at); at += part.length; });
  return out;
}
const xml = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

// note: one language version of tracker.decisionNote, plus sources [{label, url}].
export function buildDecisionDocx(note, sources = []) {
  const rtl = note.dir === "rtl";
  const links = [];
  const run = (text, { bold = false, italic = false, size = 22, color = "263B4A" } = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${bold ? "<w:b/><w:bCs/>" : ""}${italic ? "<w:i/><w:iCs/>" : ""}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${rtl ? "<w:rtl/>" : ""}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
  const para = (content, { after = 120, keepNext = false } = {}) => `<w:p><w:pPr>${rtl ? "<w:bidi/>" : ""}${keepNext ? "<w:keepNext/>" : ""}<w:spacing w:after="${after}"/></w:pPr>${content}</w:p>`;
  const heading = (text) => para(run(text, { bold: true, size: 28, color: "153F59" }), { after: 100, keepNext: true });
  const link = (url, text) => { if (!/^https?:\/\//i.test(url || "")) return run(text, { size: 18 }); links.push(url); return `<w:hyperlink r:id="rIdL${links.length}" w:history="1">${run(text, { size: 18, color: "0F5F99" })}</w:hyperlink>`; };
  const widths = [2300, 2500, 1700, 1000, 1500];
  const cell = (content, width, fill = "") => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ""}</w:tcPr>${para(content, { after: 0 })}</w:tc>`;
  const table = `<w:tbl><w:tblPr>${rtl ? "<w:bidiVisual/>" : ""}<w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((side) => `<w:${side} w:val="single" w:sz="4" w:color="C9D6DE"/>`).join("")}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>
    <w:tr><w:trPr><w:tblHeader/></w:trPr>${note.headings.columns.map((text, i) => cell(run(text, { bold: true, size: 18 }), widths[i], "E8EFF4")).join("")}</w:tr>
    ${note.decisions.map((d) => `<w:tr>${[d.issue, d.decision, [d.lead, ...d.also].join(rtl ? "؛ " : "; "), d.timeframe, d.indicator].map((text, i) => cell(run(text, { size: 18, bold: i === 1 }), widths[i])).join("")}</w:tr>`).join("")}</w:tbl>`;
  const body = [
    para(run(note.title, { bold: true, size: 40, color: "153F59" }), { after: 60 }),
    para(run(note.subtitle, { size: 22, color: "5B707D" }), { after: 240 }),
    heading(note.headings.situation),
    ...note.situation.map((text) => para(run(text))),
    heading(note.headings.decisions),
    table,
    para(run(note.leadNote, { italic: true, size: 18, color: "5B707D" }), { after: 200 }),
    heading(note.headings.commitments),
    para(run(note.commitments)),
    heading(note.headings.support),
    ...note.support.map((text) => para(run(`•  ${text}`), { after: 60 })),
    para(run(note.supportNote, { italic: true, size: 20 }), { after: 200 }),
    ...sources.map((source) => para(link(source.url, source.label), { after: 20 })),
    para(run(note.disclaimer, { italic: true, size: 18, color: "5B707D" }), { after: 0 }),
  ];
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body.join("")}<w:sectPr>${rtl ? "<w:bidi/>" : ""}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1300" w:bottom="1200" w:left="1300" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${ns}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB" w:bidi="ar-AE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${links.map((url, i) => `<Relationship Id="rIdL${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(url)}" TargetMode="External"/>`).join("")}</Relationships>`;
  return zip([
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: "word/document.xml", content: documentXml },
    { name: "word/styles.xml", content: styles },
    { name: "word/_rels/document.xml.rels", content: rels },
  ]);
}
