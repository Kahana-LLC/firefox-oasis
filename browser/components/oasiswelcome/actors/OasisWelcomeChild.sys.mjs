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
    Cu.exportFunction(this.queryParent.bind(this), window, {
      defineAs: "RPMQueryAsync",
    });
  }

  sendToParent(type, data) {
    this.sendAsyncMessage(type, data);
  }

  wrapPromise(promise) {
    return new this.contentWindow.Promise((resolve, reject) =>
      promise.then(resolve, reject)
    );
  }

  queryParent(type, data) {
    return this.wrapPromise(
      new Promise((resolve, reject) => {
        super
          .sendQuery(type, data)
          .then(
            result => resolve(Cu.cloneInto(result, this.contentWindow)),
            reject
          );
      })
    );
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
