// Runs in the chrome-privileged browser window.
(function () {
  const assistantToggle = document.getElementById("assistant-button");
  const assistantSidebar = document.getElementById("assistant-sidebar");
  const assistantSplitter = document.getElementById("assistant-splitter");

  function toggle() {
    const collapsed = assistantSidebar.getAttribute("collapsed") === "true";
    assistantSidebar.setAttribute("collapsed", !collapsed);
    assistantSplitter.setAttribute("collapsed", !collapsed);
  }

  if (assistantToggle) {
    assistantToggle.addEventListener("click", toggle);
  }
})();
