import JSZip from "jszip";
import fs from "fs/promises";
import path from "path";

import { NovelInfo } from "../types/novel";
import { ChapterContent } from "../types/chapterContent";

export class EpubBuilder {
    private zip = new JSZip();

    async build(
        info: NovelInfo,
        chapters: ChapterContent[],
        output: string
    ) {
        this.addMimeType();

        this.addContainer();

        this.addStyle();

        this.addChapters(chapters);

        this.addContentOpf(info, chapters);

        this.addToc(info, chapters);

        // Tạm thời chưa thêm content.opf và toc.ncx

        const buffer = await this.zip.generateAsync({
            type: "nodebuffer",
        });

        await fs.mkdir(path.dirname(output), {
            recursive: true,
        });

        await fs.writeFile(output, buffer);
    }

    private addMimeType() {
        this.zip.file(
            "mimetype",
            "application/epub+zip"
        );
    }
    private addContainer() {
        const meta = this.zip.folder("META-INF");

        meta?.file(
            "container.xml",
            `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0"
xmlns="urn:oasis:names:tc:opendocument:xmlns:container">

  <rootfiles>

    <rootfile
      full-path="OEBPS/content.opf"
      media-type="application/oebps-package+xml"/>

  </rootfiles>

</container>`
        );
    }

    private addStyle() {
        const oebps = this.zip.folder("OEBPS");

        oebps?.file(
            "style.css",
            `
body{
    font-family: serif;
    line-height:1.8;
    margin:5%;
}

img{
    max-width:100%;
}
`
        );
    }

    private addChapters(chapters: ChapterContent[]) {
        const oebps = this.zip.folder("OEBPS");

        chapters.forEach((chapter, index) => {

            const filename =
                `chapter-${String(index + 1).padStart(3, "0")}.xhtml`;

            oebps?.file(
                filename,
                `<?xml version="1.0" encoding="UTF-8"?>

<html xmlns="http://www.w3.org/1999/xhtml">

<head>

<meta charset="utf-8"/>

<title>${chapter.title}</title>

<link
rel="stylesheet"
href="style.css"/>

</head>

<body>

<h1>${chapter.title}</h1>

${chapter.html}

</body>

</html>`
            );

        });

    }

    private addContentOpf(
        info: NovelInfo,
        chapters: ChapterContent[]
    ) {

        const oebps = this.zip.folder("OEBPS");

        const manifest = chapters
            .map((_, index) => {

                const file =
                    `chapter-${String(index + 1).padStart(3, "0")}.xhtml`;

                return `
<item
    id="chapter${index + 1}"
    href="${file}"
    media-type="application/xhtml+xml"/>`;

            })
            .join("\n");

        const spine = chapters
            .map((_, index) =>

                `<itemref idref="chapter${index + 1}"/>`

            )
            .join("\n");

        oebps?.file(
            "content.opf",
            `<?xml version="1.0" encoding="UTF-8"?>

<package
xmlns="http://www.idpf.org/2007/opf"
version="2.0"
unique-identifier="BookId">

<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">

<dc:title>${info.title}</dc:title>

<dc:creator>${info.author ?? ""}</dc:creator>

<dc:language>vi</dc:language>

<dc:identifier id="BookId">
${Date.now()}
</dc:identifier>

</metadata>

<manifest>

<item
id="css"
href="style.css"
media-type="text/css"/>

<item
id="ncx"
href="toc.ncx"
media-type="application/x-dtbncx+xml"/>

${manifest}

</manifest>

<spine toc="ncx">

${spine}

</spine>

</package>`
        );

    }

    private addToc(info: NovelInfo, chapters: ChapterContent[]) {

        const oebps = this.zip.folder("OEBPS");

        const navPoints = chapters
            .map((chapter, index) => {

                const file =
                    `chapter-${String(index + 1).padStart(3, "0")}.xhtml`;

                return `
<navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">

    <navLabel>

        <text>${chapter.title}</text>

    </navLabel>

    <content src="${file}"/>

</navPoint>`;

            })
            .join("\n");

        oebps?.file(
            "toc.ncx",
            `<?xml version="1.0" encoding="UTF-8"?>

<ncx
xmlns="http://www.daisy.org/z3986/2005/ncx/"
version="2005-1">

<head>

<meta
name="dtb:uid"
content="book"/>

</head>

<docTitle>

<text>${info.title}</text>

</docTitle>

<navMap>

${navPoints}

</navMap>

</ncx>`
        );

    }
}