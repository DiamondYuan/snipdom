import { T } from "./tokens";

export function isSnipdomElement(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (cur.id && cur.id.startsWith("__snipdom")) return true;
    if (
      cur.className &&
      typeof cur.className === "string" &&
      cur.className.indexOf("__snipdom") !== -1
    )
      return true;
    cur = cur.parentElement;
  }
  return false;
}

export function kbdHint(text: string): string {
  return (
    '<kbd style="font-family:' +
    T.mono +
    ';font-size:11px;padding:2px 6px;border-radius:4px;line-height:1.3;display:inline-block;background:rgba(250,250,249,0.1);border:1px solid rgba(250,250,249,0.12);color:rgba(250,250,249,0.6)">' +
    text +
    "</kbd>"
  );
}
