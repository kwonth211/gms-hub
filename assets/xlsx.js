// A small .xlsx writer shared by the build (Node) and the browser, with no dependencies. Each sheet gets a title line, a
// short note, a bold header row that stays frozen with a filter on it, sized columns, number formats (thousands, signed
// percent in green/red) and links back to the site. Files are zipped without compression ("stored"), which Excel,
// Numbers and Google Sheets all open; the data is small.
//
// sheet = { name, title, note, cols: [{ h, t }], rows: [[...]] }
//   t: 'text' (default) | 'wrap' (long text) | 'int' (#,##0) | 'num' (0.0) | 'pct' (signed %, value 12.5 = 12.5%)
//      | 'rate' (plain %, value 2.5 = 2.5%) | 'link' (cell = { text, url }) | 'check' (empty box to tick)
const enc = new TextEncoder();
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

// Style ids (cellXfs order in styles.xml below).
const S = { text: 0, head: 1, int: 2, num: 3, pct: 4, wrap: 5, title: 6, note: 7, link: 8, rate: 9, check: 10 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="0.0"/><numFmt numFmtId="166" formatCode="[Color10]+0.0%;[Red]-0.0%;0.0%"/><numFmt numFmtId="167" formatCode="0.00%"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Malgun Gothic"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Malgun Gothic"/><family val="2"/></font><font><b/><sz val="15"/><name val="Malgun Gothic"/><family val="2"/></font><font><sz val="10"/><color rgb="FF6B6B6B"/><name val="Malgun Gothic"/><family val="2"/></font><font><u/><sz val="11"/><color rgb="FF1F5FBF"/><name val="Malgun Gothic"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC2570C"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFE3D5C3"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="top"/></xf>
<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Display width of a value: Hangul and other wide characters count double.
const width = (s) => [...String(s ?? '')].reduce((n, ch) => n + (/[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1), 0);

function cellXml(ref, v, t) {
  if (v == null || v === '') return t === 'check' ? `<c r="${ref}" s="${S.check}" t="inlineStr"><is><t>☐</t></is></c>` : '';
  if (t === 'link' && typeof v === 'object') {
    const f = `HYPERLINK("${String(v.url).replace(/"/g, '""')}","${String(v.text).replace(/"/g, '""')}")`;
    return `<c r="${ref}" s="${S.link}" t="str"><f>${xmlEsc(f)}</f><v>${xmlEsc(v.text)}</v></c>`;
  }
  if ((t === 'int' || t === 'num' || t === 'pct' || t === 'rate') && typeof v === 'number' && Number.isFinite(v)) {
    const val = t === 'pct' || t === 'rate' ? v / 100 : v;
    return `<c r="${ref}" s="${S[t]}"><v>${val}</v></c>`;
  }
  const style = t === 'wrap' ? S.wrap : t === 'check' ? S.check : S.text;
  const text = typeof v === 'object' && v && 'text' in v ? v.text : v;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(text)}</t></is></c>`;
}

function sheetXml(sh) {
  const cols = sh.cols, top = (sh.title ? 1 : 0) + (sh.note ? 1 : 0) + (sh.title || sh.note ? 1 : 0); // title, note, blank line
  const headRow = top + 1, last = colName(cols.length - 1);
  const widths = cols.map((c, i) => {
    if (c.w) return c.w;
    const sample = sh.rows.slice(0, 400).map((r) => { const v = r[i]; return typeof v === 'object' && v ? v.text : typeof v === 'number' ? v.toLocaleString('en-US') + (c.t === 'pct' ? '+%' : '') : v; });
    const w = Math.max(width(c.h) + 2, ...sample.map((s) => width(s) + 2));
    return Math.min(c.t === 'wrap' ? 60 : 44, Math.max(c.t === 'check' ? 6 : 8, w));
  });
  const out = [];
  let r = 0;
  if (sh.title) out.push(`<row r="${++r}" ht="24" customHeight="1"><c r="A${r}" s="${S.title}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(sh.title)}</t></is></c></row>`);
  if (sh.note) out.push(`<row r="${++r}"><c r="A${r}" s="${S.note}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(sh.note)}</t></is></c></row>`);
  if (sh.title || sh.note) r++;
  r++;
  out.push(`<row r="${r}" ht="22" customHeight="1">${cols.map((c, i) => `<c r="${colName(i)}${r}" s="${S.head}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.h)}</t></is></c>`).join('')}</row>`);
  for (const row of sh.rows) {
    r++;
    out.push(`<row r="${r}">${cols.map((c, i) => cellXml(`${colName(i)}${r}`, row[i], c.t)).join('')}</row>`);
  }
  const lastRow = Math.max(r, headRow);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"${sh.first ? ' tabSelected="1"' : ''}><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headRow + 1}" sqref="A${headRow + 1}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="16.5"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${out.join('')}</sheetData>
${sh.rows.length ? `<autoFilter ref="A${headRow}:${last}${lastRow}"/>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
</worksheet>`;
}

// Sheet names: at most 31 characters, none of []:*?/\ and unique.
function sheetNames(sheets) {
  const used = new Set();
  return sheets.map((s) => {
    let base = String(s.name).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet', name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

let CRC;
const crc32 = (bytes) => {
  CRC ||= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = enc.encode(text), nameB = enc.encode(name), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nameB.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? head.setUint32(o, v, true) : head.setUint16(o, v, true)));
    const cd = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nameB.length, 2],
      [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]].forEach(([o, v, n]) => (n === 4 ? cd.setUint32(o, v, true) : cd.setUint16(o, v, true)));
    parts.push(new Uint8Array(head.buffer), nameB, data);
    central.push(new Uint8Array(cd.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cdSize, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([o, v, n]) => (n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const outBytes = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { outBytes.set(p, at); at += p.length; }
  return outBytes;
}

export function xlsx({ sheets, title = 'GMS Hub' }) {
  const names = sheetNames(sheets);
  const ws = sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml({ ...s, first: i === 0 })]);
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>GMS Hub (gms-hub.com)</dc:creator></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${sheets.some((s) => s.rows.length) ? '<definedNames>' : ''}${sheets.map((s, i) => s.rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xmlEsc(names[i].replace(/'/g, "''"))}'!$A$${(s.title ? 1 : 0) + (s.note ? 1 : 0) + (s.title || s.note ? 1 : 0) + 1}:$${colName(s.cols.length - 1)}$${(s.title ? 1 : 0) + (s.note ? 1 : 0) + (s.title || s.note ? 1 : 0) + 1 + s.rows.length}</definedName>` : '').join('')}${sheets.some((s) => s.rows.length) ? '</definedNames>' : ''}</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...ws
  ]);
}
