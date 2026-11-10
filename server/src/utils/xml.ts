import type { AnyNode } from "domhandler";

// Ký tự điều khiển không hợp lệ trong XML 1.0
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(INVALID_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

const VALID_NAME = /^[A-Za-z_][\w.-]*$/;

/**
 * Serialize cây DOM thành XHTML hợp lệ (thẻ rỗng tự đóng, escape đúng),
 * giữ nguyên ký tự Unicode thay vì biến thành &#x...; như dom-serializer.
 */
export function serializeXhtml(nodes: AnyNode[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out += escapeXml(node.data);
        break;
      case "tag":
      case "script":
      case "style": {
        const name = node.name.toLowerCase();
        if (!VALID_NAME.test(name)) {
          out += serializeXhtml(node.children);
          break;
        }
        let attrs = "";
        for (const [key, val] of Object.entries(node.attribs)) {
          if (VALID_NAME.test(key)) attrs += ` ${key}="${escapeXml(val)}"`;
        }
        if (VOID_ELEMENTS.has(name)) {
          out += `<${name}${attrs}/>`;
        } else {
          out += `<${name}${attrs}>${serializeXhtml(node.children)}</${name}>`;
        }
        break;
      }
      case "cdata":
        out += serializeXhtml(node.children);
        break;
      default:
        // comment, directive: bỏ
        break;
    }
  }
  return out;
}
