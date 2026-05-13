/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
});

const WIDGET_ID = "oasis-navbar-pill";
const PLACEMENT_PREF = "browser.oasis.navbarPill.placedNextToVpn";

export const OasisNavBarPill = {
  /**
   * Move the navbar Oasis pill after the IP Protection (VPN) button once that
   * widget exists. Retries briefly if VPN is registered late.
   *
   * @param {Window} window
   */
  schedulePlacement(window) {
    if (Services.prefs.getBoolPref(PLACEMENT_PREF, false)) {
      return;
    }
    let attempts = 0;
    const tick = () => {
      if (Services.prefs.getBoolPref(PLACEMENT_PREF, false)) {
        return;
      }
      const CUI = lazy.CustomizableUI;
      attempts++;
      if (!CUI.getWidget(WIDGET_ID)) {
        if (attempts < 40) {
          window.setTimeout(tick, 250);
        }
        return;
      }
      const ipp = CUI.getPlacementOfWidget("ipprotection-button");
      if (ipp) {
        CUI.addWidgetToArea(WIDGET_ID, CUI.AREA_NAVBAR, ipp.position + 1);
        Services.prefs.setBoolPref(PLACEMENT_PREF, true);
        return;
      }
      if (attempts < 40) {
        window.setTimeout(tick, 250);
        return;
      }
      const dl = CUI.getPlacementOfWidget("downloads-button");
      let pos = dl ? dl.position + 1 : null;
      CUI.addWidgetToArea(WIDGET_ID, CUI.AREA_NAVBAR, pos);
      Services.prefs.setBoolPref(PLACEMENT_PREF, true);
    };
    window.requestIdleCallback(() => tick(), { timeout: 3000 });
  },
};
