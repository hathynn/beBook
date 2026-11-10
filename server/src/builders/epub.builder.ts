import JSZip from "jszip";
import { randomUUID } from "crypto";

import { NovelInfo } from "../types/novel";
import { escapeXml } from "../utils/xml";

export interface EpubImage {
  id: string;
  /** Đường dẫn trong OEBPS, ví dụ "images/img-0001.jpg" */
  href: string;
  mediaType: string;
  data: Buffer;
}

export interface EpubChapter {
  title: string;
  /** Fragment XHTML hợp lệ (ảnh đã trỏ tới images/...) */
  html: string;
}

export interface EpubInput {
  info: NovelInfo;
  chapters: EpubChapter[];
  images: EpubImage[];
  cover?: EpubImage | null;
}

const CSS = `body { font-family: serif; line-height: 1.7; margin: 0 4%; }
h1.chapter-title { font-size: 1.4em; text-align: center; margin: 1em 0 1.2em; }
p { margin: 0 0 0.8em; text-align: justify; }
img { max-width: 100%; height: auto; display: block; margin: 0.5em auto; }
figure { margin: 0.5em 0; }
.notice { font-style: italic; text-align: center; color: #666; border: 1px dashed #aaa; padding: 1em; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-height: 100%; }
.titlepage { text-align: center; margin-top: 30%; }
.titlepage .author { font-style: italic; margin-top: 1em; }
.summary p { text-indent: 0; }
`;

function xhtmlPage(title: string, body: string, bodyClass = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head>
<meta charset="UTF-8"/>
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
${body}
</body>
</html>`;
}

const chapterFile = (i: number) => `chapter-${String(i + 1).padStart(4, "0")}.xhtml`;

export class EpubBuilder {
  /** Tạo EPUB mới hoàn toàn mỗi lần gọi (không dùng chung state giữa các request). */
  async build({ info, chapters, images, cover }: EpubInput): Promise<Buffer> {
    const zip = new JSZip();
    const uid = `urn:uuid:${randomUUID()}`;
    const title = info.title || "Untitled";

    // mimetype phải là file đầu tiên và KHÔNG nén
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    const oebps = zip.folder("OEBPS")!;
    oebps.file("style.css", CSS);

    // ----- Trang bìa + trang tiêu đề -----
    const frontMatter: { id: string; file: string; title: string }[] = [];

    if (cover) {
      oebps.file(cover.href, cover.data);
      oebps.file(
        "cover.xhtml",
        xhtmlPage(title, `<div class="cover"><img src="${escapeXml(cover.href)}" alt="${escapeXml(title)}"/></div>`, "cover")
      );
      frontMatter.push({ id: "cover-page", file: "cover.xhtml", title: "Cover" });
    }

    const meta: string[] = [];
    if (info.author) meta.push(`<p class="author">${escapeXml(info.author)}</p>`);
    if (info.genres?.length) meta.push(`<p>${escapeXml(info.genres.join(", "))}</p>`);
    if (info.url) meta.push(`<p><small>${escapeXml(info.url)}</small></p>`);
    const summary = (info.summary ?? "")
      .split(/\n+/)
      .filter(Boolean)
      .map((l) => `<p>${escapeXml(l)}</p>`)
      .join("\n");
    oebps.file(
      "title.xhtml",
      xhtmlPage(
        title,
        `<div class="titlepage"><h1>${escapeXml(title)}</h1>${meta.join("\n")}</div>${
          summary ? `<div class="summary">\n${summary}\n</div>` : ""
        }`
      )
    );
    frontMatter.push({ id: "title-page", file: "title.xhtml", title });

    // ----- Chương -----
    chapters.forEach((ch, i) => {
      oebps.file(
        chapterFile(i),
        xhtmlPage(ch.title, `<h1 class="chapter-title">${escapeXml(ch.title)}</h1>\n${ch.html}`)
      );
    });

    // ----- Ảnh (nén DEFLATE không lợi gì cho jpg/png → STORE cho nhanh) -----
    for (const img of images) {
      oebps.file(img.href, img.data, { compression: "STORE" });
    }

    // ----- nav.xhtml (EPUB 3) -----
    const navItems = chapters
      .map((ch, i) => `<li><a href="${chapterFile(i)}">${escapeXml(ch.title)}</a></li>`)
      .join("\n");
    oebps.file(
      "nav.xhtml",
      xhtmlPage(
        title,
        `<nav epub:type="toc" id="toc"><h1>Mục lục</h1><ol>\n${navItems}\n</ol></nav>`
      )
    );

    // ----- toc.ncx (EPUB 2 / máy đọc cũ) -----
    const navPoints = [
      ...frontMatter.filter((f) => f.id === "title-page"),
      ...chapters.map((ch, i) => ({ file: chapterFile(i), title: ch.title })),
    ]
      .map(
        (p, i) => `<navPoint id="np-${i + 1}" playOrder="${i + 1}">
  <navLabel><text>${escapeXml(p.title)}</text></navLabel>
  <content src="${p.file}"/>
</navPoint>`
      )
      .join("\n");
    oebps.file(
      "toc.ncx",
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
<meta name="dtb:uid" content="${uid}"/>
<meta name="dtb:depth" content="1"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${escapeXml(title)}</text></docTitle>
<navMap>
${navPoints}
</navMap>
</ncx>`
    );

    // ----- content.opf -----
    const manifest = [
      `<item id="css" href="style.css" media-type="text/css"/>`,
      `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      ...(cover
        ? [`<item id="${cover.id}" href="${escapeXml(cover.href)}" media-type="${cover.mediaType}" properties="cover-image"/>`]
        : []),
      ...frontMatter.map((f) => `<item id="${f.id}" href="${f.file}" media-type="application/xhtml+xml"/>`),
      ...chapters.map(
        (_, i) => `<item id="ch${i + 1}" href="${chapterFile(i)}" media-type="application/xhtml+xml"/>`
      ),
      ...images.map(
        (img) => `<item id="${img.id}" href="${escapeXml(img.href)}" media-type="${img.mediaType}"/>`
      ),
    ].join("\n    ");

    const spine = [
      ...frontMatter.map((f) => `<itemref idref="${f.id}"${f.id === "cover-page" ? ` linear="no"` : ""}/>`),
      ...chapters.map((_, i) => `<itemref idref="ch${i + 1}"/>`),
    ].join("\n    ");

    const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");

    oebps.file(
      "content.opf",
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="vi">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${uid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>vi</dc:language>
    ${info.author ? `<dc:creator>${escapeXml(info.author)}</dc:creator>` : ""}
    ${info.summary ? `<dc:description>${escapeXml(info.summary)}</dc:description>` : ""}
    ${(info.genres ?? []).map((g) => `<dc:subject>${escapeXml(g)}</dc:subject>`).join("\n    ")}
    ${info.url ? `<dc:source>${escapeXml(info.url)}</dc:source>` : ""}
    <meta property="dcterms:modified">${modified}</meta>
    ${cover ? `<meta name="cover" content="${cover.id}"/>` : ""}
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine toc="ncx">
    ${spine}
  </spine>
</package>`
    );

    return zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      mimeType: "application/epub+zip",
    });
  }
}
