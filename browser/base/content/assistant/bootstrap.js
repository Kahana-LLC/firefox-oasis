// Runs in the chrome-privileged browser window.
// Wires up the assistant button to toggle the assistant sidebar via command
(function () {
  window.addEventListener("load", function() {
    const assistantToggle = document.getElementById("assistant-button");

    if (assistantToggle) {
      // Use the command system to toggle the sidebar
      assistantToggle.setAttribute("command", "viewOasisAssistantSidebar");

      // Also handle direct clicks as fallback
      assistantToggle.addEventListener("click", function(event) {
        // If the command attribute doesn't work, manually execute the command
        const command = "viewOasisAssistantSidebar";
        const commandElement = document.getElementById(command);

        if (commandElement && typeof commandElement.doCommand === "function") {
          commandElement.doCommand();
        } else {
          // Fallback: try to access SidebarController directly
          try {
            if (typeof SidebarController !== "undefined" && SidebarController.show) {
              SidebarController.show(command);
            }
          } catch (e) {
            console.error("Failed to open assistant sidebar:", e);
          }
        }
      });
    }

    // Register the kahana:// protocol handler for secure OAuth callbacks
    registerKahanaProtocolHandler();
  }, { once: true });
})();

// Register the kahana:// protocol handler for secure OAuth callbacks
function registerKahanaProtocolHandler() {
  try {
    // Import the assistant UI module to access handleKahanaProtocol
    const assistantUI = window.docShell ? window.docShell.chromeEventHandler.ownerGlobal : window;
    if (!assistantUI.handleKahanaProtocol) {
      console.warn("handleKahanaProtocol function not found, protocol handler not registered");
      return;
    }

    // Create a protocol handler that delegates to the existing handleKahanaProtocol function
    const kahanaProtocolHandler = {
      scheme: "kahana",
      defaultPort: -1,
      protocolFlags: Ci.nsIProtocolHandler.URI_NORELATIVE |
                     Ci.nsIProtocolHandler.URI_NOAUTH |
                     Ci.nsIProtocolHandler.ALLOWS_PROXY |
                     Ci.nsIProtocolHandler.URI_LOADABLE_BY_SUBSUMERS,

      allowPort: function(port, scheme) {
        return false; // No specific ports allowed
      },

      newChannel: function(uri, loadInfo) {
        // Extract the URL from the URI and call the handler
        const url = uri.spec;
        assistantUI.handleKahanaProtocol(url);

        // Return a dummy channel that does nothing - the handler processes the OAuth
        const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        return ioService.newChannelFromURI(uri, loadInfo);
      },

      QueryInterface: ChromeUtils.generateQI([Ci.nsIProtocolHandler])
    };

    // Register the protocol handler
    const compMgr = Components.manager;
    compMgr.registerFactory(
      Components.ID("{12345678-1234-1234-1234-123456789abc}"), // Random CID
      "Kahana Protocol Handler",
      "@mozilla.org/network/protocol;1?name=kahana",
      kahanaProtocolHandler
    );

    console.log("Kahana protocol handler registered successfully");
  } catch (e) {
    console.error("Failed to register kahana protocol handler:", e);
  }
}
