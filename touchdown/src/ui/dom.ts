type Child = Node | string | null | undefined | false;

/** Small element builder. `class`, `text` and plain attributes only. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false) continue;
      if (key === "class") el.className = String(value);
      else if (key === "text") el.textContent = String(value);
      else el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

const ICONS: Record<string, string> = {
  nav: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  arrow: '<path d="M7 17L17 7M9 7h8v8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  earth: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.800 0 18M12 3c-3 3.200-3 14.800 0 18"/>',
  back: '<path d="M4 12a8 8 0 108-8H7M7 4L4 7l3 3"/>',
  skip: '<path d="M5 5l9 7-9 7V5zM18 5v14"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.500"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.500a2.500 2.500 0 113.500 2.300c-.7.400-1 1-1 1.700M12 17v.01"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  table: '<path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14"/>',
  link: '<path d="M5 19l14-14M9 5h10v10"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>',
  rocket: '<path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10zM9 16l-2 4 4-2M15 16l2 4-4-2"/><circle cx="12" cy="10" r="1.6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6"/>',
};

export function icon(name: keyof typeof ICONS | string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] ?? "";
  return svg;
}
