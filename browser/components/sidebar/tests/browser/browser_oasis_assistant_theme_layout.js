/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const OASIS_THEME_PREF = "browser.oasis.assistant.theme";
const OASIS_COMMAND = "viewOasisAssistantSidebar";

async function showOasisAssistant(win) {
  await win.SidebarController.promiseInitialized;
  await win.SidebarController.show(OASIS_COMMAND);
  await BrowserTestUtils.waitForCondition(() => {
    const doc = win.SidebarController.browser?.contentDocument;
    return doc?.getElementById("assistant-preact-root");
  }, "Oasis assistant UI loaded");
}

function getVisibleOasisAssistantDocument(win) {
  const overlayActive = win.document.documentElement.hasAttribute(
    "oasis-assistant-overlay"
  );
  const browser = overlayActive
    ? win.document.getElementById("oasis-assistant-overlay-browser")
    : win.SidebarController.browser;
  return browser?.contentDocument;
}

function themeAttr(doc) {
  return doc?.documentElement.getAttribute("data-oasis-theme");
}

add_task(async function test_reapply_theme_after_stale_dom() {
  await SpecialPowers.pushPrefEnv({
    set: [[OASIS_THEME_PREF, "forest-dark"]],
  });
  const win = await BrowserTestUtils.openNewBrowserWindow();
  await showOasisAssistant(win);
  const doc = getVisibleOasisAssistantDocument(win);
  doc.documentElement.setAttribute("data-oasis-theme", "slate-dark");
  is(themeAttr(doc), "slate-dark", "stale theme set on document");
  win.SidebarController._reapplyOasisAssistantThemeAfterLayout();
  is(
    themeAttr(doc),
    "forest-dark",
    "theme reapplied from pref after stale DOM"
  );
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_theme_persists_across_layout_toggle() {
  await SpecialPowers.pushPrefEnv({
    set: [[OASIS_THEME_PREF, "violet-dark"]],
  });
  const win = await BrowserTestUtils.openNewBrowserWindow();
  await showOasisAssistant(win);

  const sc = win.SidebarController;
  const overlayBrowser = win.document.getElementById(
    "oasis-assistant-overlay-browser"
  );
  ok(overlayBrowser, "overlay browser element exists");

  let doc = getVisibleOasisAssistantDocument(win);
  doc.documentElement.setAttribute("data-oasis-theme", "forest-dark");
  is(
    Services.prefs.getStringPref(OASIS_THEME_PREF),
    "violet-dark",
    "pref holds selected theme"
  );

  const toggled = sc._switchOasisAssistantLayout();
  ok(toggled, "layout toggle handled");
  doc = getVisibleOasisAssistantDocument(win);
  is(
    themeAttr(doc),
    "violet-dark",
    "visible document theme matches pref after toggle to overlay"
  );

  sc._switchOasisAssistantLayout();
  doc = getVisibleOasisAssistantDocument(win);
  is(
    themeAttr(doc),
    "violet-dark",
    "visible document theme matches pref after toggle back to docked"
  );

  await BrowserTestUtils.closeWindow(win);
});
