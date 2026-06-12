// Runs in the chrome-privileged browser window.
// Wires up the assistant button to toggle the assistant sidebar via command
(function () {
  window.addEventListener(
    "load",
    function () {
      window.oasisSetOverlayOAuthCallbackBaseUrl = function (url) {
        try {
          if (
            window.SidebarController
              ?.setOasisAssistantOverlayOAuthCallbackBaseUrl
          ) {
            return window.SidebarController.setOasisAssistantOverlayOAuthCallbackBaseUrl(
              url
            );
          }
        } catch (e) {
          console.error("Failed to set overlay OAuth callback base URL:", e);
        }
        return "https://kahana.io";
      };

      window.oasisGetOverlayOAuthCallbackBaseUrl = function () {
        try {
          if (
            window.SidebarController
              ?.getOasisAssistantOverlayOAuthCallbackBaseUrl
          ) {
            return window.SidebarController.getOasisAssistantOverlayOAuthCallbackBaseUrl();
          }
        } catch (e) {
          console.error("Failed to get overlay OAuth callback base URL:", e);
        }
        return "https://kahana.io";
      };

      const assistantToggle = document.getElementById("assistant-button");

      if (assistantToggle) {
        // Use the command system to toggle the sidebar
        assistantToggle.setAttribute("command", "viewOasisAssistantSidebar");

        // Also handle direct clicks as fallback
        assistantToggle.addEventListener("click", function () {
          // If the command attribute doesn't work, manually execute the command
          const command = "viewOasisAssistantSidebar";
          const commandElement = document.getElementById(command);

          if (
            commandElement &&
            typeof commandElement.doCommand === "function"
          ) {
            commandElement.doCommand();
          } else {
            // Fallback: try to access SidebarController directly
            try {
              if (window.SidebarController?.show) {
                window.SidebarController.show(command);
              }
            } catch (e) {
              console.error("Failed to open assistant sidebar:", e);
            }
          }
        });
      }
    },
    { once: true }
  );
})();
