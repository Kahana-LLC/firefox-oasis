/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** JSWindowActor child for Oasis onboarding pages; exports RPMSendAsyncMessage. */
export class OasisWelcomeChild extends JSWindowActorChild {
  actorCreated() {
    this.scheduleExportFunctions();
  }

  scheduleExportFunctions() {
    this.exportFunctions();
    let win;
    try {
      win = this.document?.defaultView ?? this.contentWindow;
    } catch {
      return;
    }
    if (win?.document?.readyState === "loading") {
      win.addEventListener("DOMContentLoaded", () => this.exportFunctions(), {
        once: true,
      });
    }
  }

  exportFunctions() {
    let win;
    try {
      win = this.document?.defaultView ?? this.contentWindow;
    } catch {
      return;
    }
    if (!win) {
      return;
    }
    Cu.exportFunction(this.sendToParent.bind(this), win, {
      defineAs: "RPMSendAsyncMessage",
    });
  }

  sendToParent(type, data) {
    this.sendAsyncMessage(type, data);
  }

  receiveMessage(message) {
    const { name, data } = message;

    switch (name) {
      case "OasisWelcome:UpdateContent":
        this.handleContentUpdate(data);
        break;
    }
  }

  handleContentUpdate(data) {
    const window = this.contentWindow;
    if (window && window.OasisWelcome) {
      window.OasisWelcome.updateContent(data);
    }
  }
}
