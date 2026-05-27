# Contributing to Mermaid Flow

First off, thank you for considering contributing to Mermaid Flow! It's people like you who make the Obsidian community great.

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/THANSHEER/mermaid-flow.git
   cd mermaid-flow
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development mode:**
   ```bash
   npm run dev
   ```
   This will watch for changes and compile `main.js`.

4. **Add to Obsidian:**
   - Copy the folder to your vault's `.obsidian/plugins/` directory.
   - Or use a tool like `obsidian-plugin-hot-reload`.

## Coding Guidelines

- **TypeScript:** The project is written in TypeScript. Maintain strict typing.
- **Surgical Changes:** Keep PRs focused. If fixing a bug, try to add a reproduction case if possible.
- **Styling:** Use `styles.css` for plugin-specific styles. Ensure they match the Obsidian theme (use CSS variables like `--text-normal`).

## Submitting a Pull Request

1. Fork the repo and create your branch from `main`.
2. Ensure the project builds successfully (`npm run build`).
3. Update documentation if you are adding a new feature.
4. Submit the PR with a clear description of the changes.

## Bug Reports
Please use the GitHub Issue tracker and include:
- Obsidian version.
- Steps to reproduce.
- Sample Mermaid code that caused the issue.
