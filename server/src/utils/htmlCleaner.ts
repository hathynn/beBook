import * as cheerio from "cheerio";

export function cleanHtml(html: string): string {
  const $ = cheerio.load(html);

  // Xóa các thẻ không cần
  $("script").remove();
  $("style").remove();
  $("iframe").remove();
  $("noscript").remove();

  // Xóa các block của WordPress
  $(".sharedaddy").remove();
  $(".jp-relatedposts").remove();
  $(".sd-sharing").remove();
  $(".sharedaddy.sd-sharing-enabled").remove();

  // Xóa attribute không cần
  $("*").each((_, el) => {
    $(el).removeAttr("style");
    $(el).removeAttr("class");
    $(el).removeAttr("id");
  });

  // Bỏ span nhưng giữ nội dung
  $("span").each((_, el) => {
    $(el).replaceWith($(el).html() ?? "");
  });

  // Làm sạch ảnh
  $("img").each((_, el) => {
    $(el).removeAttr("width");
    $(el).removeAttr("height");
    $(el).removeAttr("srcset");
    $(el).removeAttr("sizes");
    $(el).removeAttr("loading");
    $(el).removeAttr("decoding");
  });

  // Xóa p rỗng
  $("p").each((_, el) => {
    const hasText = $(el).text().trim().length > 0;
    const hasImage = $(el).find("img").length > 0;

    if (!hasText && !hasImage) {
      $(el).remove();
    }
  });

  let result = $("body").html() ?? "";

  // ===========================
  // Chuyển HTML Entity -> XML
  // ===========================

  result = result
    .replace(/&nbsp;/g, "&#160;")
    .replace(/&copy;/g, "©")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’");

  return result;
}