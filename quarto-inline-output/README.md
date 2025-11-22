# Quarto Inline Output

Display R code chunk outputs inline in Quarto documents with Jupyter-style execution.

## Features

- **Notebook View**: Open `.qmd` files as interactive notebooks with inline outputs
- **Terminal Integration**: Code runs in visible R terminal for interaction
- **Output Display**: Text output appears directly below code cells
- **View Switching**: Toggle between text editor and notebook view
- **Clean Files**: Outputs not saved to `.qmd` files

## Current Status (v0.2.0 - Notebook API)

This extension uses VSCode's Notebook API to provide true inline output display.

**What works:**
- ✅ Open `.qmd` files as notebooks
- ✅ Execute R code cells with inline text output
- ✅ Persistent R terminal session
- ✅ Switch between notebook and text views
- ✅ Round-trip preservation of `.qmd` format
- ✅ Chunk options preserved in cell metadata

**Known Limitations:**
- Plot output not yet supported (text only)
- Python support not yet implemented
- Chunk options editable only in text view

## Usage

1. Open a `.qmd` file in VSCode
2. Run command: "Quarto: Open as Notebook"
3. Click "Run" button on code cells or press `Cmd/Ctrl+Enter`
4. View output inline below cells
5. Switch to terminal to interact with R session
6. To edit as text, run: "Quarto: Open as Text"

## Commands

- `Quarto: Open as Notebook` - Open `.qmd` as interactive notebook
- `Quarto: Open as Text` - Return to text editor view

## Requirements

- VSCode 1.85.0 or higher
- R installed and in PATH
- Quarto extension (optional)

## Installation

### Development

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile:
   ```bash
   npm run compile
   ```
4. Press `F5` in VSCode to launch Extension Development Host

## Architecture

See [ARCHITECTURE.md](../docs/ARCHITECTURE.md) for design details.

Previous hover-based prototype: branch `inline-with-hover`

## Contributing

- [Implementation Plan](../docs/plans/2025-11-22-notebook-api-implementation.md)
- [Testing Notes](../docs/testing-notes.md)

## License

MIT
