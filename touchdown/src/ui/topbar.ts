import type { Locale } from "../i18n";
import type { Tab } from "../state";
import type { Ui } from "./context";
import { h, icon } from "./dom";

/** Top strip: name, the two tabs, guide, assistant, language. */
export function createTopBar(ui: Ui): HTMLElement {
  const { t, actions } = ui;
  const tabs = (["explorer", "data"] as Tab[]).map((tab) => {
    const b = h(
      "button",
      { class: "tab", type: "button", role: "tab", "data-tab": tab },
      icon(tab === "explorer" ? "globe" : "table"),
      h("span", { text: tab === "explorer" ? t.tabExplorer : t.tabData }),
    );
    b.addEventListener("click", () => actions.setTab(tab));
    return { tab, b };
  });
  const guide = h("button", { class: "button button-quiet", type: "button", "aria-label": t.help }, icon("help"), h("span", { text: t.help }));
  const assistant = h("button", { class: "button button-quiet", type: "button", "aria-label": t.assistant }, icon("chat"), h("span", { text: t.assistant }));
  const share = h("button", { class: "button button-quiet", type: "button", "aria-label": t.share, title: t.shareHelp }, icon("link"), h("span", { text: t.share }));
  share.addEventListener("click", () => actions.share());
  guide.addEventListener("click", () => actions.setGuide(!ui.store.get().guideOpen));
  assistant.addEventListener("click", () => actions.setAssistant(!ui.store.get().assistantOpen));
  const languages = (["fr", "en"] as Locale[]).map((locale) => {
    const b = h("button", { class: "segment", type: "button", text: locale.toUpperCase(), "aria-label": `${t.language}: ${locale.toUpperCase()}` });
    b.addEventListener("click", () => actions.setLocale(locale));
    return { locale, b };
  });

  const bar = h(
    "header",
    { class: "topbar" },
    h("div", { class: "brand" }, h("span", { class: "brand-mark", "aria-hidden": "true" }), h("div", null, h("b", { text: t.brand }), h("small", { text: t.tagline }))),
    h("nav", { class: "tabs", role: "tablist" }, ...tabs.map((x) => x.b)),
    h("div", { class: "topbar-right" }, share, guide, assistant, h("div", { class: "segments" }, ...languages.map((x) => x.b))),
  );

  ui.watch(
    (s) => [s.tab, s.locale, s.assistantOpen, s.guideOpen],
    (s) => {
      for (const x of tabs) {
        x.b.classList.toggle("is-on", x.tab === s.tab);
        x.b.setAttribute("aria-selected", String(x.tab === s.tab));
      }
      for (const x of languages) x.b.classList.toggle("is-on", x.locale === s.locale);
      assistant.classList.toggle("is-on", s.assistantOpen);
      guide.classList.toggle("is-on", s.guideOpen);
    },
  );
  return bar;
}
