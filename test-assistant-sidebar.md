# Testing Assistant Sidebar

## Quick Test Commands

Open the Browser Console (F12 or Ctrl+Shift+K) and run these commands:

### 1. Check if SidebarController is available:
```javascript
typeof SidebarController
```

### 2. Check if assistant sidebar is registered:
```javascript
SidebarController.sidebars.has("viewOasisAssistantSidebar")
```

### 3. Check preference value:
```javascript
Services.prefs.getBoolPref("browser.sidebar.oasis_assistant.enabled", false)
```

### 4. Manually open the sidebar:
```javascript
SidebarController.show("viewOasisAssistantSidebar")
```

### 5. Check if menu item exists:
```javascript
document.getElementById("menu_oasisAssistantSidebar")
```

### 6. Check if toolbar button exists:
```javascript
document.getElementById("assistant-button")
```

### 7. Force show the sidebar (if registered):
```javascript
if (SidebarController.sidebars.has("viewOasisAssistantSidebar")) {
  SidebarController.show("viewOasisAssistantSidebar");
}
```

