# Curio

### Capture. Organize. Discover.

Curio is a local-first research library for saving, organizing, and rediscovering useful resources.

Instead of letting useful links disappear across browser bookmarks, tabs, notes, and different platforms, Curio gives them one place where they can be organized with boards, tags, search, and quick actions.

Curio is designed around a simple idea:

> **Your research should stay yours.**

---

## ✨ Current Features

### 📥 Capture Resources

Add resources to your personal research library.

Curio currently supports different resource types, including:

- Web pages
- GitHub repositories
- YouTube videos
- Notes

Each resource can contain useful metadata such as:

- Title
- URL
- Description
- Source type
- Board
- Tags
- Favorite status
- Timestamp

---

### 🗂️ Organize with Boards

Create boards to organize resources around different:

- Projects
- Topics
- Areas of research
- Interests

Resources can be assigned to boards and moved between them.

---

### 🏷️ Tags

Add custom tags to resources to provide another layer of organization.

Tags can be used alongside boards to make larger research libraries easier to navigate.

---

### 🔎 Fast Search

Search through your saved resources to quickly find something you've previously captured.

Curio also includes a keyboard-first command palette that can be opened with:

`⌘K` on macOS  
`Ctrl+K` on Windows/Linux

---

### ⭐ Favorites

Mark important resources as favorites so they can be accessed quickly.

---

### 🗄️ Archive

Move resources out of your active library without permanently deleting them.

Archived resources can be viewed separately from the main library.

---

### 🎯 Filters

Filter your resource library using available resource metadata such as:

- Boards
- Tags
- Resource type
- Other available filters

---

### ⌨️ Keyboard-First Workflow

Curio is designed to reduce unnecessary mouse interaction.

The command palette and keyboard shortcuts provide quick access to common actions and navigation.

---

### 🌗 Dark & Light Themes

Curio supports both:

- Dark mode
- Light mode

The interface adapts its surfaces, borders, text, inputs, and interactive states to remain readable in both themes.

---

### 💾 Local-First Storage

Curio is designed as a local-first application.

Research data is stored locally in the browser using:

- IndexedDB
- LocalStorage

There is currently no backend or user account required for the core application.

---

### 🔐 No Account Required

Curio currently does not require users to create an account to use the application.

Your research library belongs to the browser/device where it is stored.

---

### 🌐 Browser Capture Concept

Curio is designed around quickly bringing useful resources from the web into your research library.

The landing page demonstrates this workflow through the Capture → Organize → Discover experience.

> **Note:** Browser-extension capture is part of the product direction, while the current V0 application focuses on the core research-library experience.

---

## 🧠 Core Workflow

Curio is built around three simple actions:

### 01 — Capture

Save something worth keeping.

### 02 — Organize

Give it context with boards and tags.

### 03 — Discover

Find it again when you need it.

**Capture → Organize → Discover**

---

## 🛠️ Tech Stack

- React
- Vite
- JavaScript
- CSS
- IndexedDB
- LocalStorage
- Browser History API

---

## 📁 Project Structure

```text
curio/
├── public/
├── src/
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── vercel.json
├── netlify.toml
└── README.md