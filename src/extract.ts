export function rgbToHex(rgb: string): string {
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return rgb;
  return (
    "#" +
    ((1 << 24) + (+m[1] << 16) + (+m[2] << 8) + +m[3]).toString(16).slice(1)
  );
}

export function cleanValue(v: string): string {
  return v.replace(/(\d+\.\d+)px/g, (_, n: string) => Math.round(+n) + "px");
}

export function getSelector(el: Element): string {
  if (el.id) return "#" + el.id;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const node: Element = cur;
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift("#" + node.id);
      break;
    }
    if (node.className && typeof node.className === "string") {
      const cls = node.className
        .trim()
        .split(/\s+/)
        .filter((c) => c && !c.startsWith("__snipdom"))
        .slice(0, 3);
      if (cls.length) part += "." + cls.join(".");
    }
    const parent = node.parentElement;
    if (parent) {
      const sibs = Array.from(parent.children).filter(
        (s) => s.tagName === node.tagName,
      );
      if (sibs.length > 1)
        part += ":nth-of-type(" + (sibs.indexOf(node) + 1) + ")";
    }
    parts.unshift(part);
    cur = node.parentElement;
  }
  return parts.join(" > ");
}

export function getAncestry(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el.parentElement;
  let d = 0;
  while (cur && cur !== document.body && d < 3) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) part += "#" + cur.id;
    else if (cur.className && typeof cur.className === "string") {
      const cls = cur.className
        .trim()
        .split(/\s+/)
        .filter((c) => c && !c.startsWith("__snipdom"))
        .slice(0, 2);
      if (cls.length) part += "." + cls.join(".");
    }
    parts.unshift(part);
    cur = cur.parentElement;
    d++;
  }
  parts.push("[this]");
  return parts.join(" > ");
}

type StyleTest = (v: string) => boolean;

export function getKeyStyles(el: Element): Record<string, string> {
  const computed = window.getComputedStyle(el);
  const styles: Record<string, string> = {};
  const body = window.getComputedStyle(document.body);
  const pairs: Array<[string, StyleTest]> = [
    [
      "background-color",
      (v) => v !== "rgba(0, 0, 0, 0)" && v !== "transparent",
    ],
    ["color", (v) => v !== body.color],
    ["font-size", (v) => v !== body.fontSize && v !== "16px"],
    ["font-weight", (v) => v !== "400" && v !== "normal"],
    ["padding", (v) => v !== "0px"],
    ["border-radius", (v) => v !== "0px"],
    ["display", (v) => v !== "block" && v !== "inline"],
    ["position", (v) => v !== "static"],
    ["gap", (v) => v !== "normal" && v !== "0px"],
    ["opacity", (v) => v !== "1"],
  ];
  for (const [prop, test] of pairs) {
    let v = computed.getPropertyValue(prop);
    if (v && test(v)) {
      v = cleanValue(v);
      if (prop === "background-color" || prop === "color") v = rgbToHex(v);
      styles[prop] = v;
    }
  }
  return styles;
}
