/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class OasisWelcomeChild extends JSWindowActorChild {
  actorCreated() {
    this.exportFunctions();
  }

  exportFunctions() {
    const window = this.contentWindow;

    Cu.exportFunction(this.sendToParent.bind(this), window, {
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
