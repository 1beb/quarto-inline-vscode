# Notebook API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement VSCode Notebook API for Quarto documents to display true inline outputs, replacing the Decorations API approach.

**Architecture:** Custom NotebookSerializer converts `.qmd` ↔ notebook cells using minimal splitting. NotebookController executes cells via existing TerminalManager/RExecutor infrastructure. Terminal-only execution for visibility and interaction.

**Tech Stack:** VSCode Notebook API, TypeScript, existing infrastructure (parseChunks, TerminalManager, RExecutor)

---

## Task 1: Setup Notebook Serializer Infrastructure

**Files:**
- Create: `quarto-inline-output/src/notebookSerializer.ts`
- Modify: `quarto-inline-output/src/extension.ts` (registration)
- Modify: `quarto-inline-output/package.json` (notebook contribution)

**Step 1: Write failing test for basic deserialization**

Create: `quarto-inline-output/src/test/notebookSerializer.test.ts`

```typescript
import * as assert from 'assert';
import { QuartoNotebookSerializer } from '../notebookSerializer';
import * as vscode from 'vscode';

suite('QuartoNotebookSerializer', () => {
    let serializer: QuartoNotebookSerializer;

    setup(() => {
        serializer = new QuartoNotebookSerializer();
    });

    test('deserialize simple qmd with one code chunk', async () => {
        const qmdContent = `---
title: "Test"
---

# Heading

Some text.

\`\`\`{r}
head(mtcars)
\`\`\`

More text.`;

        const data = Buffer.from(qmdContent, 'utf-8');
        const token = new vscode.CancellationTokenSource().token;

        const notebook = await serializer.deserializeNotebook(data, token);

        assert.strictEqual(notebook.cells.length, 3);
        assert.strictEqual(notebook.cells[0].kind, vscode.NotebookCellKind.Markup);
        assert.strictEqual(notebook.cells[1].kind, vscode.NotebookCellKind.Code);
        assert.strictEqual(notebook.cells[2].kind, vscode.NotebookCellKind.Markup);
        assert.ok(notebook.cells[0].value.includes('title: "Test"'));
        assert.strictEqual(notebook.cells[1].value, 'head(mtcars)');
        assert.strictEqual(notebook.cells[1].languageId, 'r');
    });
});
```

**Step 2: Run test to verify it fails**

```bash
cd quarto-inline-output
npm test -- --grep "deserialize simple qmd"
```

Expected: FAIL with "Cannot find module '../notebookSerializer'"

**Step 3: Create minimal NotebookSerializer class**

Create: `quarto-inline-output/src/notebookSerializer.ts`

```typescript
import * as vscode from 'vscode';
import { parseChunks, CodeChunk } from './chunkParser';

export class QuartoNotebookSerializer implements vscode.NotebookSerializer {
    async deserializeNotebook(
        content: Uint8Array,
        _token: vscode.CancellationToken
    ): Promise<vscode.NotebookData> {
        const text = Buffer.from(content).toString('utf-8');
        const chunks = parseChunks(text);

        const cells: vscode.NotebookCellData[] = [];
        const lines = text.split('\n');

        let currentLine = 0;

        for (const chunk of chunks) {
            // Add markdown cell before this code chunk
            if (chunk.startLine > currentLine) {
                const markdownLines = lines.slice(currentLine, chunk.startLine);
                const markdownText = markdownLines.join('\n');
                if (markdownText.trim()) {
                    cells.push(new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        markdownText,
                        'markdown'
                    ));
                }
            }

            // Add code cell
            cells.push(new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                chunk.code,
                chunk.language
            ));

            currentLine = chunk.endLine + 1;
        }

        // Add remaining markdown after last chunk
        if (currentLine < lines.length) {
            const markdownLines = lines.slice(currentLine);
            const markdownText = markdownLines.join('\n');
            if (markdownText.trim()) {
                cells.push(new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    markdownText,
                    'markdown'
                ));
            }
        }

        return new vscode.NotebookData(cells);
    }

    async serializeNotebook(
        data: vscode.NotebookData,
        _token: vscode.CancellationToken
    ): Promise<Uint8Array> {
        // Placeholder - will implement in next task
        const lines: string[] = [];

        for (const cell of data.cells) {
            if (cell.kind === vscode.NotebookCellKind.Markup) {
                lines.push(cell.value);
            } else if (cell.kind === vscode.NotebookCellKind.Code) {
                lines.push(`\`\`\`{${cell.languageId}}`);
                lines.push(cell.value);
                lines.push('```');
            }
        }

        return Buffer.from(lines.join('\n'), 'utf-8');
    }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --grep "deserialize simple qmd"
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/notebookSerializer.ts src/test/notebookSerializer.test.ts
git commit -m "feat: add basic notebook serializer with deserialization"
```

---

## Task 2: Improve Serialization Round-Tripping

**Files:**
- Modify: `quarto-inline-output/src/notebookSerializer.ts`
- Modify: `quarto-inline-output/src/test/notebookSerializer.test.ts`

**Step 1: Write test for round-trip preservation**

Add to `quarto-inline-output/src/test/notebookSerializer.test.ts`:

```typescript
test('round-trip preserves exact formatting', async () => {
    const qmdContent = `---
title: "Test"
---

# Introduction

Some text here.

\`\`\`{r}
x <- 1
y <- 2
\`\`\`

More text.

\`\`\`{r}
summary(mtcars)
\`\`\`

# Conclusion

Final thoughts.`;

    const data = Buffer.from(qmdContent, 'utf-8');
    const token = new vscode.CancellationTokenSource().token;

    const notebook = await serializer.deserializeNotebook(data, token);
    const serialized = await serializer.serializeNotebook(notebook, token);
    const result = Buffer.from(serialized).toString('utf-8');

    assert.strictEqual(result, qmdContent);
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- --grep "round-trip preserves"
```

Expected: FAIL (formatting not preserved exactly)

**Step 3: Improve serialization to preserve whitespace**

Modify `serializeNotebook()` in `quarto-inline-output/src/notebookSerializer.ts`:

```typescript
async serializeNotebook(
    data: vscode.NotebookData,
    _token: vscode.CancellationToken
): Promise<Uint8Array> {
    const parts: string[] = [];

    for (let i = 0; i < data.cells.length; i++) {
        const cell = data.cells[i];

        if (cell.kind === vscode.NotebookCellKind.Markup) {
            // Markdown cells written as-is
            parts.push(cell.value);
        } else if (cell.kind === vscode.NotebookCellKind.Code) {
            // Code cells wrapped in fences
            parts.push(`\`\`\`{${cell.languageId}}`);
            parts.push(cell.value);
            parts.push('```');
        }

        // Don't add extra newline after last cell
        if (i < data.cells.length - 1 && !parts[parts.length - 1].endsWith('\n\n')) {
            // Ensure cells are separated
            if (!parts[parts.length - 1].endsWith('\n')) {
                parts.push('\n');
            }
        }
    }

    return Buffer.from(parts.join(''), 'utf-8');
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --grep "round-trip preserves"
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/notebookSerializer.ts src/test/notebookSerializer.test.ts
git commit -m "feat: improve serialization to preserve exact formatting"
```

---

## Task 3: Register Notebook Serializer with VSCode

**Files:**
- Modify: `quarto-inline-output/src/extension.ts`
- Modify: `quarto-inline-output/package.json`

**Step 1: Update package.json to register notebook type**

Modify `quarto-inline-output/package.json`, add to `contributes`:

```json
"contributes": {
    "notebooks": [
        {
            "type": "quarto-notebook",
            "displayName": "Quarto Notebook",
            "selector": [
                {
                    "filenamePattern": "*.qmd"
                }
            ]
        }
    ],
    "commands": [
        {
            "command": "quarto-inline-output.openAsNotebook",
            "title": "Quarto: Open as Notebook"
        },
        {
            "command": "quarto-inline-output.openAsText",
            "title": "Quarto: Open as Text"
        },
        {
            "command": "quarto-inline-output.runChunk",
            "title": "Run Quarto Chunk"
        },
        {
            "command": "quarto-inline-output.refresh",
            "title": "Refresh Quarto Code Lenses"
        }
    ],
    // ... rest of existing contributes
}
```

**Step 2: Register serializer in extension.ts**

Modify `quarto-inline-output/src/extension.ts`, add imports and registration:

```typescript
import { QuartoNotebookSerializer } from './notebookSerializer';

export function activate(context: vscode.ExtensionContext) {
    console.log('Quarto Inline Output extension activated');

    // Register notebook serializer
    const notebookSerializer = new QuartoNotebookSerializer();
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer(
            'quarto-notebook',
            notebookSerializer,
            { transientOutputs: false }
        )
    );

    // ... existing code (terminal manager, code lens, etc)
}
```

**Step 3: Test registration by compiling**

```bash
npm run compile
```

Expected: SUCCESS (no compilation errors)

**Step 4: Manual verification**

Launch Extension Development Host (F5), open a `.qmd` file, right-click → "Reopen Editor With..." → should see "Quarto Notebook" option.

**Step 5: Commit**

```bash
git add src/extension.ts package.json
git commit -m "feat: register notebook serializer with VSCode"
```

---

## Task 4: Implement View Switching Commands

**Files:**
- Modify: `quarto-inline-output/src/extension.ts`

**Step 1: Implement openAsNotebook command**

Add to `quarto-inline-output/src/extension.ts` in `activate()`:

```typescript
// Command: Open as Notebook
const openAsNotebookCommand = vscode.commands.registerCommand(
    'quarto-inline-output.openAsNotebook',
    async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        if (!document.fileName.endsWith('.qmd')) {
            vscode.window.showErrorMessage('Not a Quarto document');
            return;
        }

        // Close current editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        // Reopen as notebook
        await vscode.commands.executeCommand('vscode.openWith',
            document.uri,
            'quarto-notebook'
        );
    }
);
context.subscriptions.push(openAsNotebookCommand);
```

**Step 2: Implement openAsText command**

Add to `quarto-inline-output/src/extension.ts` in `activate()`:

```typescript
// Command: Open as Text
const openAsTextCommand = vscode.commands.registerCommand(
    'quarto-inline-output.openAsText',
    async () => {
        const notebook = vscode.window.activeNotebookEditor;
        if (!notebook) {
            vscode.window.showErrorMessage('No active notebook');
            return;
        }

        const uri = notebook.notebook.uri;
        if (!uri.path.endsWith('.qmd')) {
            vscode.window.showErrorMessage('Not a Quarto notebook');
            return;
        }

        // Close notebook
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        // Reopen as text
        await vscode.commands.executeCommand('vscode.open', uri);
    }
);
context.subscriptions.push(openAsTextCommand);
```

**Step 3: Test compilation**

```bash
npm run compile
```

Expected: SUCCESS

**Step 4: Manual verification**

Launch Extension Development Host, open `.qmd` as text, run "Quarto: Open as Notebook", verify it reopens as notebook. Then run "Quarto: Open as Text", verify it reopens as text.

**Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add commands to switch between text and notebook views"
```

---

## Task 5: Implement Notebook Controller for Execution

**Files:**
- Create: `quarto-inline-output/src/notebookController.ts`
- Modify: `quarto-inline-output/src/extension.ts`

**Step 1: Create NotebookController class**

Create: `quarto-inline-output/src/notebookController.ts`

```typescript
import * as vscode from 'vscode';
import { TerminalManager } from './terminalManager';
import { RExecutor } from './executors/rExecutor';

export class QuartoNotebookController {
    private controller: vscode.NotebookController;
    private terminalManager: TerminalManager;

    constructor(terminalManager: TerminalManager) {
        this.terminalManager = terminalManager;

        this.controller = vscode.notebooks.createNotebookController(
            'quarto-notebook-controller',
            'quarto-notebook',
            'Quarto'
        );

        this.controller.supportedLanguages = ['r'];
        this.controller.supportsExecutionOrder = true;
        this.controller.executeHandler = this.executeCell.bind(this);
    }

    private async executeCell(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): Promise<void> {
        for (const cell of cells) {
            await this.executeSingleCell(cell);
        }
    }

    private async executeSingleCell(cell: vscode.NotebookCell): Promise<void> {
        const execution = this.controller.createNotebookCellExecution(cell);
        execution.start(Date.now());
        execution.clearOutput();

        try {
            // Get terminal for this language
            const terminal = this.terminalManager.getOrCreateTerminal(cell.languageId);

            // Create executor
            const executor = new RExecutor(terminal);

            try {
                // Execute code
                const result = await executor.executeChunk({
                    code: cell.document.getText(),
                    options: {}
                });

                // Update cell output
                if (result.textOutput) {
                    const output = new vscode.NotebookCellOutput([
                        vscode.NotebookCellOutputItem.text(result.textOutput)
                    ]);
                    execution.replaceOutput(output);
                }

                execution.end(true, Date.now());
            } finally {
                // Clean up executor resources
                if (executor && 'dispose' in executor) {
                    executor.dispose();
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorOutput = new vscode.NotebookCellOutput([
                vscode.NotebookCellOutputItem.error(new Error(errorMessage))
            ]);
            execution.replaceOutput(errorOutput);
            execution.end(false, Date.now());
        }
    }

    dispose(): void {
        this.controller.dispose();
    }
}
```

**Step 2: Register controller in extension.ts**

Modify `quarto-inline-output/src/extension.ts`:

```typescript
import { QuartoNotebookController } from './notebookController';

export function activate(context: vscode.ExtensionContext) {
    console.log('Quarto Inline Output extension activated');

    const terminalManager = new TerminalManager();

    // Register notebook serializer
    const notebookSerializer = new QuartoNotebookSerializer();
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer(
            'quarto-notebook',
            notebookSerializer,
            { transientOutputs: false }
        )
    );

    // Register notebook controller
    const notebookController = new QuartoNotebookController(terminalManager);
    context.subscriptions.push(notebookController);

    // ... rest of existing code
}
```

**Step 3: Test compilation**

```bash
npm run compile
```

Expected: SUCCESS

**Step 4: Manual verification**

Launch Extension Development Host, open `.qmd` as notebook, run a code cell (e.g., `head(mtcars)`), verify output appears inline.

**Step 5: Commit**

```bash
git add src/notebookController.ts src/extension.ts
git commit -m "feat: add notebook controller for cell execution"
```

---

## Task 6: Handle Chunk Options in Serialization

**Files:**
- Modify: `quarto-inline-output/src/notebookSerializer.ts`
- Modify: `quarto-inline-output/src/test/notebookSerializer.test.ts`

**Step 1: Write test for chunk options**

Add to `quarto-inline-output/src/test/notebookSerializer.test.ts`:

```typescript
test('preserves chunk options in round-trip', async () => {
    const qmdContent = `\`\`\`{r echo=FALSE, warning=FALSE}
x <- 1
\`\`\``;

    const data = Buffer.from(qmdContent, 'utf-8');
    const token = new vscode.CancellationTokenSource().token;

    const notebook = await serializer.deserializeNotebook(data, token);
    const serialized = await serializer.serializeNotebook(notebook, token);
    const result = Buffer.from(serialized).toString('utf-8');

    assert.ok(result.includes('echo=FALSE'));
    assert.ok(result.includes('warning=FALSE'));
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- --grep "preserves chunk options"
```

Expected: FAIL (chunk options lost)

**Step 3: Store chunk options in cell metadata**

Modify `deserializeNotebook()` in `quarto-inline-output/src/notebookSerializer.ts`:

```typescript
// Add code cell with metadata
const cellData = new vscode.NotebookCellData(
    vscode.NotebookCellKind.Code,
    chunk.code,
    chunk.language
);

// Store chunk options in metadata
if (chunk.options && Object.keys(chunk.options).length > 0) {
    cellData.metadata = { chunkOptions: chunk.options };
}

cells.push(cellData);
```

Modify `serializeNotebook()` to restore chunk options:

```typescript
} else if (cell.kind === vscode.NotebookCellKind.Code) {
    // Build chunk header with options
    let chunkHeader = `\`\`\`{${cell.languageId}`;

    if (cell.metadata?.chunkOptions) {
        const options = Object.entries(cell.metadata.chunkOptions)
            .map(([key, value]) => `${key}=${value}`)
            .join(', ');
        chunkHeader += ` ${options}`;
    }

    chunkHeader += '}';

    parts.push(chunkHeader);
    parts.push(cell.value);
    parts.push('```');
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --grep "preserves chunk options"
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/notebookSerializer.ts src/test/notebookSerializer.test.ts
git commit -m "feat: preserve chunk options in cell metadata"
```

---

## Task 7: Test End-to-End with Real Quarto Documents

**Files:**
- Use: `test-documents/01-basic-analysis.qmd`
- Use: `test-documents/02-visualization.qmd`
- Use: `test-documents/03-summary-stats.qmd`

**Step 1: Manual test with basic analysis document**

1. Launch Extension Development Host (F5)
2. Open `test-documents/01-basic-analysis.qmd`
3. Run command "Quarto: Open as Notebook"
4. Verify document opens in notebook view
5. Verify cells are correctly split
6. Run first code cell
7. Verify output appears inline
8. Verify terminal shows execution

**Step 2: Test round-tripping**

1. In notebook view, make a small edit to markdown cell
2. Save file (Cmd/S)
3. Run command "Quarto: Open as Text"
4. Verify markdown edit is preserved
5. Verify code chunks are intact
6. Verify no outputs are saved to file
7. Run `git diff test-documents/01-basic-analysis.qmd`
8. Verify only your markdown edit appears (no output clutter)

**Step 3: Test terminal interaction**

1. Open `test-documents/01-basic-analysis.qmd` as notebook
2. Run first cell (creates variables in R session)
3. Switch to R terminal
4. Type `ls()` to see variables
5. Verify variables from notebook cell exist
6. Create new variable in terminal: `terminal_var <- 999`
7. Add new cell in notebook: `print(terminal_var)`
8. Run new cell
9. Verify output shows `999` (bidirectional flow works)

**Step 4: Test error handling**

1. In notebook, create cell with invalid R code: `x <- )`
2. Run cell
3. Verify error appears in cell output
4. Verify cell is marked with error indicator
5. Verify other cells can still run

**Step 5: Document findings**

Create: `docs/testing-notes.md`

```markdown
# Notebook API Testing Notes

## Date: 2025-11-22

### Manual Testing Results

**Test 1: Basic Analysis Document**
- ✅ Opens as notebook correctly
- ✅ Cells split properly (markdown + code)
- ✅ Code execution works
- ✅ Output displays inline
- ✅ Terminal shows execution

**Test 2: Round-Tripping**
- ✅ Edits preserved on save
- ✅ Code chunks intact
- ✅ Outputs NOT saved to file (correct)
- ✅ Clean git diff

**Test 3: Terminal Interaction**
- ✅ Variables from cells visible in terminal
- ✅ Variables from terminal visible in cells
- ✅ Bidirectional flow confirmed

**Test 4: Error Handling**
- ✅ Errors display in cell output
- ✅ Error indicator appears
- ✅ Other cells continue to work

### Known Issues
- (List any issues found)

### Future Improvements
- Add plot support
- Add Python support
- Improve chunk options UI
```

**Step 6: Commit**

```bash
git add docs/testing-notes.md
git commit -m "docs: add manual testing notes for notebook API"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `quarto-inline-output/README.md`
- Modify: `README.md` (root)

**Step 1: Update extension README**

Modify `quarto-inline-output/README.md`:

```markdown
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

## Architecture

See [ARCHITECTURE.md](../docs/ARCHITECTURE.md) for design details.

Previous hover-based prototype: branch `inline-with-hover`
```

**Step 2: Update root README**

Modify root `README.md` to reflect Notebook API implementation status.

**Step 3: Compile and verify**

```bash
npm run compile
```

Expected: SUCCESS

**Step 4: Commit**

```bash
git add quarto-inline-output/README.md README.md
git commit -m "docs: update README for Notebook API implementation"
```

---

## Task 9: Final Integration Testing

**Step 1: Clean build**

```bash
cd quarto-inline-output
rm -rf out node_modules
npm install
npm run compile
```

Expected: Clean build with no errors

**Step 2: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 3: Launch extension and test workflow**

1. Press F5 to launch Extension Development Host
2. Open `test-documents/01-basic-analysis.qmd`
3. Command: "Quarto: Open as Notebook"
4. Run all cells sequentially
5. Verify outputs appear
6. Add new markdown cell with text
7. Add new code cell with R code
8. Save file
9. Command: "Quarto: Open as Text"
10. Verify file format is correct
11. Run `git diff test-documents/01-basic-analysis.qmd`
12. Verify only new cells added (no output pollution)

**Step 4: Test with all sample documents**

Repeat workflow with:
- `test-documents/02-visualization.qmd`
- `test-documents/03-summary-stats.qmd`

**Step 5: Document any issues**

Update `docs/testing-notes.md` with findings.

**Step 6: Final commit**

```bash
git add .
git commit -m "test: complete integration testing of Notebook API"
```

---

## Implementation Complete!

### What We Built

1. ✅ NotebookSerializer for `.qmd` ↔ notebook cells conversion
2. ✅ NotebookController for cell execution via terminal
3. ✅ View switching commands (text ↔ notebook)
4. ✅ Chunk option preservation in metadata
5. ✅ Clean round-tripping (outputs not saved)
6. ✅ Integration with existing infrastructure

### Testing Performed

- Unit tests for serialization/deserialization
- Round-trip preservation tests
- Manual end-to-end testing
- Terminal interaction verification
- Error handling validation

### Next Steps (Future Work)

- Add plot output support
- Add Python language support
- Improve chunk options UI
- Add custom notebook renderers
- Publish to VSCode marketplace

---

## Reference: Key VSCode APIs Used

```typescript
// Notebook Serializer
vscode.workspace.registerNotebookSerializer(type, serializer, options)
vscode.NotebookData(cells)
vscode.NotebookCellData(kind, value, languageId)

// Notebook Controller
vscode.notebooks.createNotebookController(id, notebookType, label)
controller.createNotebookCellExecution(cell)
execution.start() / execution.end()
execution.replaceOutput(output)

// Notebook Outputs
vscode.NotebookCellOutput(items)
vscode.NotebookCellOutputItem.text(value)
vscode.NotebookCellOutputItem.error(error)

// Commands
vscode.commands.executeCommand('vscode.openWith', uri, editorId)
```

## Development Commands Reference

```bash
# Compile TypeScript
npm run compile

# Watch mode (auto-compile)
npm run watch

# Run tests
npm test

# Run specific test
npm test -- --grep "test name"

# Launch Extension Development Host
# Press F5 in VSCode
```
