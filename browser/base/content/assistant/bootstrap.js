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
  }, { once: true });
})();
