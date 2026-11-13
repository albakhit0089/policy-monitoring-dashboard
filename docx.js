// Minimal .docx writer for narrative briefs (no dependencies): a stored (uncompressed) zip holding the
// WordprocessingML parts. Layout follows an FAO technical-report pattern: cover block, numbered headings,
// bullet lists, live source links and an annex table with a source note.

// ---------- zip (store method) ----------
const CRC_TABLE = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
function crc32(bytes) { let crc = 0xffffffff; for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function zip(files) {
  const encoder = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const u16 = (value) => [value & 0xff, (value >>> 8) & 0xff];
  const u32 = (value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
  files.forEach(({ name, content }) => {
    const data = encoder.encode(content), fileName = encoder.encode(name), crc = crc32(data);
    // Fixed DOS date 2026-01-01 00:00 keeps output deterministic.
    const header = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5c21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(fileName.length), ...u16(0)];
    parts.push(new Uint8Array(header), fileName, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5c21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(fileName.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), fileName);
    offset += header.length + fileName.length + data.length;
  });
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0; all.forEach((part) => { out.set(part, at); at += part.length; });
  return out;
}

// ---------- WordprocessingML ----------
const xml = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
const run = (text, { bold = false, italic = false, size = null, color = null, style = null } = {}) => `<w:r><w:rPr>${style ? `<w:rStyle w:val="${style}"/>` : ""}${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}${size ? `<w:sz w:val="${size}"/>` : ""}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const para = (content, { style = null, numbered = false, spacingAfter = null, keepNext = false } = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${keepNext ? "<w:keepNext/>" : ""}${numbered ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ""}${spacingAfter !== null ? `<w:spacing w:after="${spacingAfter}"/>` : ""}</w:pPr>${content}</w:p>`;

export function buildDocx(report) {
  const links = [];
  const link = (url, text) => { if (!/^https?:\/\//i.test(url || "")) return run(text); links.push(url); return `<w:hyperlink r:id="rIdLink${links.length}" w:history="1">${run(text, { style: "Hyperlink" })}</w:hyperlink>`; };
  const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const country = (value) => value === "United Arab Emirates" ? "the UAE" : value;
  const partsXml = (parts) => parts.map((part) => {
    if (typeof part === "string") return run(part);
    const record = report.cited.get(part.cite);
    return `${run("“")}${link(record.source, record.title)}${run(`” (${country(record.country)}, ${shortDate(record.date)})`)}`;
  }).join("");

  const body = [];
  // Cover
  body.push(para(run("FOOD AND AGRICULTURE ORGANIZATION OF THE UNITED NATIONS", { bold: true, size: 18, color: "8A5F17" }), { spacingAfter: 600 }));
  body.push(para(run(report.title), { style: "Title" }));
  body.push(para(run(report.subtitle, { size: 30, color: "28536B" }), { spacingAfter: 480 }));
  [["Countries", report.countriesLine], ["Prepared by", report.preparedBy], ["Date", shortDate(report.date)], ["Version", report.version]].forEach(([label, value]) => body.push(para(`${run(`${label}: `, { bold: true })}${run(value)}`, { spacingAfter: 80 })));
  if (report.partial) body.push(para(run(`Partial month: data run to ${shortDate(report.through)}.`, { italic: true })));
  body.push(para('<w:r><w:br w:type="page"/></w:r>'));
  // Sections
  report.sections.forEach((section, i) => {
    body.push(para(run(`${i + 1}. ${section.title}`), { style: "Heading1", keepNext: true }));
    section.blocks.forEach((block) => {
      if (block.type === "h3") body.push(para(run(block.text), { style: "Heading2", keepNext: true }));
      else if (block.type === "list") block.items.forEach((item) => body.push(para(partsXml(item), { numbered: true })));
      else body.push(para(partsXml(block.parts)));
    });
  });
  // Annex
  body.push(para(run(`${report.sections.length + 1}. Annex: measures referenced`), { style: "Heading1", keepNext: true }));
  const cell = (content, { header = false, width }) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EFF4"/>' : ""}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${content}</w:p></w:tc>`;
  const widths = [1150, 1250, 2300, 3300, 1000];
  const head = ["Date", "Country", "Institution", "Measure", "Source"].map((text, i) => cell(run(text, { bold: true, size: 18 }), { header: true, width: widths[i] })).join("");
  const rows = report.annex.map((row) => `<w:tr>${[run(shortDate(row.date), { size: 18 }), run(row.country, { size: 18 }), run(row.institution || "Not stated", { size: 18 }), run(row.title, { size: 18 }), link(row.source, "Source")].map((content, i) => cell(content, { width: widths[i] })).join("")}</w:tr>`).join("");
  if (report.annex.length) body.push(`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((side) => `<w:${side} w:val="single" w:sz="4" w:color="C9D6DE"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${head}</w:tr>${rows}</w:tbl>`);
  body.push(para(run("Source: FAO policy monitoring record; summaries of public reporting.", { italic: true, size: 18 })));
  body.push(para(run("Data note"), { style: "Heading2" }));
  report.annexNote.forEach((note) => body.push(para(run(note), { numbered: true })));
  body.push(para(run("Policy measures are short summaries compiled for monitoring and analysis, not legal texts. Always consult the original source.", { italic: true, size: 18 })));

  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1300" w:bottom="1440" w:left="1300" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${ns}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:color w:val="263B4A"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:color w:val="153F59"/><w:sz w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="153F59"/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="28536B"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="116AAB"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${ns}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${links.map((url, i) => `<Relationship Id="rIdLink${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(url)}" TargetMode="External"/>`).join("")}</Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(`${report.title}: ${report.subtitle}`)}</dc:title><dc:creator>${xml(report.preparedBy)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${report.date}T00:00:00Z</dcterms:created></cp:coreProperties>`;
  return zip([
    { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: "word/document.xml", content: document },
    { name: "word/styles.xml", content: styles },
    { name: "word/numbering.xml", content: numbering },
    { name: "word/_rels/document.xml.rels", content: rels },
    { name: "docProps/core.xml", content: core },
  ]);
}
