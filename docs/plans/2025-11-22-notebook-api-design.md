# Quarto Inline Output - Notebook API Design

**Date:** 2025-11-22
**Status:** Approved for implementation
**Approach:** VSCode Notebook API with terminal-based execution

## Overview

This design replaces the Decorations API approach (which cannot display multi-line inline content) with VSCode's Notebook API to provide true Jupyter-style inline output display for Quarto documents.

## Design Decisions

### 1. File Opening Behavior
- **Choice:** Default to text, opt-in to notebook
- `.qmd` files always open as regular text editor by default
- User runs command "Open as Notebook" to switch to notebook view
- Preserves normal editing workflows, allows opt-in when needed

### 2. Markdown Preservation
- **Choice:** Minimal splitting
- One markdown cell per "gap" between code chunks
- YAML frontmatter included in first markdown cell
- Preserves document structure for clean round-tripping

### 3. Terminal Integration
- **Choice:** Terminal-only execution
- All cell executions go to visible R terminal
- Users can interact directly with terminal between executions
- Matches existing implementation philosophy

### 4. Output Persistence
- **Choice:** Save on document save
- Outputs kept in memory during session
- Written to `.qmd` only when user saves (Cmd/S)
- Actually: outputs are **discarded** on save (not written to `.qmd`)
- Keeps files clean and diff-friendly

## Architecture

### Core Components

**1. QuartoNotebookSerializer**
- Converts between `.qmd` text and VSCode `NotebookData`
- `deserializeNotebook()`: Parses `.qmd` → notebook cells
- `serializeNotebook()`: Converts notebook cells → `.qmd` text

**2. QuartoNotebookController**
- Handles cell execution
- Manages R terminal session (reuses TerminalManager)
- Executes code cells using RExecutor
- Updates cell outputs in notebook UI

**3. View Switching Commands**
- `quarto-inline-output.openAsNotebook` - Switch to notebook view
- `quarto-inline-output.openAsText` - Switch back to text editor

### Component Reuse

This design leverages existing infrastructure:
- `parseChunks()` - Identify code chunks in `.qmd`
- `TerminalManager` - Create and manage R terminal sessions
- `RExecutor` - Execute code with output capture
- `withVisible()` instrumentation - Capture R expression results

Only new code: thin adapter layer to convert `ExecutionResult` → `NotebookCellOutput`

## Serialization Details

### Deserialization (`.qmd` → Notebook)

When opening as notebook:

1. Parse chunks using existing `parseChunks()`
2. Create cells with minimal splitting:
   - Everything before first code chunk → one markdown cell
   - Each code chunk → one code cell (with language metadata)
   - Text between chunks → markdown cells
   - YAML frontmatter preserved in first markdown cell
3. Parse chunk options from `{r option=value}` syntax
4. All cells start with empty outputs (not executed yet)

**Example:**

```markdown
---
title: "Analysis"
---

# Introduction
Text here.

```{r}
head(mtcars)
```

More text.

```{r}
summary(mtcars)
```

# Conclusion
Final thoughts.
```

**Becomes:**

- Markdown Cell 1: YAML + intro text
- Code Cell 1: `head(mtcars)`
- Markdown Cell 2: "More text."
- Code Cell 2: `summary(mtcars)`
- Markdown Cell 3: Conclusion section

### Serialization (Notebook → `.qmd`)

When saving (Cmd/S):

1. Reconstruct `.qmd` format:
   - Markdown cells → written as-is
   - Code cells → wrapped in ` ```{r}\n...\n``` `
   - Chunk options preserved in fence syntax
2. **Outputs are discarded** - not written to file
   - Keeps `.qmd` files clean
   - Diff-friendly in version control
   - Outputs regenerate on next execution

**Preservation:**
- Exact text formatting (whitespace, blank lines) preserved
- No reformatting or normalization
- Clean round-tripping

## Execution Flow

### Code Execution Steps

1. User clicks "Run" or presses `Cmd/Ctrl+Enter` in code cell
2. `QuartoNotebookController.execute()` called
3. Controller:
   - Gets or creates R terminal session (via TerminalManager)
   - Creates RExecutor instance
   - Calls `executor.executeChunk()` with cell code
   - Terminal shows and executes instrumented code
   - Captures output from temp file (existing mechanism)
4. Updates cell output using `NotebookCellOutput` API:
   - Text output → `NotebookCellOutputItem.text()`
   - Plots (future) → `NotebookCellOutputItem.image()`
5. Disposes executor to clean up temp files

### Terminal Visibility

- R terminal automatically appears when execution starts
- Users can type commands directly in terminal
- State persists across cell executions
- Bidirectional flow: cells → terminal ↔ user

## Error Handling

### Execution Errors

- R errors captured via existing `tryCatch()` mechanism
- Displayed as cell output with error styling
- Cell marked with error indicator
- Other cells continue to execute normally

### Edge Cases

1. **User edits markdown cells**
   - Changes stay in memory
   - Written to `.qmd` on save

2. **User adds new cells**
   - Serializer converts to `.qmd` format on save
   - New code cells → new chunk blocks
   - New markdown cells → text sections

3. **Switch between text/notebook views**
   - VSCode handles reopening
   - Unsaved changes prompt user to save

4. **Terminal closed by user**
   - Next execution creates new terminal automatically

5. **Multiple `.qmd` files**
   - Each gets own terminal session (existing behavior)

## MVP Scope

### Included

- ✅ Notebook serialization (`.qmd` ↔ cells)
- ✅ Code execution with terminal integration
- ✅ Text output display
- ✅ Error handling and display
- ✅ View switching commands
- ✅ R language support

### Deferred

- ❌ Plot support (text output only initially)
- ❌ Chunk option UI (edit in cell metadata or text view)
- ❌ Python support (R only for MVP)
- ❌ Custom notebook renderers

## Technical Notes

### VSCode API Usage

- `vscode.workspace.registerNotebookSerializer()` - Register for `.qmd` files
- `vscode.notebooks.createNotebookController()` - Handle execution
- `NotebookData` - In-memory notebook representation
- `NotebookCellOutput` / `NotebookCellOutputItem` - Cell outputs

### File Association

Extension registers as notebook provider for `.qmd` files but doesn't override default text editor. Users must explicitly run command to open as notebook.

### State Management

- Notebook cells = in-memory representation
- File on disk = source of truth
- Save operation: serialize cells → write `.qmd`
- No intermediate state files

## Benefits of This Approach

1. **True inline output** - No Decorations API limitations
2. **Reuses existing code** - Minimal new implementation
3. **Clean files** - Outputs not persisted to `.qmd`
4. **Terminal visibility** - Users can see and interact with R
5. **Familiar UX** - Standard notebook interface
6. **Extensible** - Easy to add plots, Python, etc.

## Next Steps

1. Write detailed implementation plan
2. Implement QuartoNotebookSerializer
3. Implement QuartoNotebookController
4. Add view switching commands
5. Test with existing test documents
6. Verify round-tripping preserves `.qmd` format
