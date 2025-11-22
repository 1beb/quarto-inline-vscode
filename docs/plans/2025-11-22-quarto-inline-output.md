# Quarto Inline Output VSCode Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a VSCode extension that displays R code chunk outputs inline below the chunk in Quarto documents, similar to Jupyter notebooks.

**Architecture:** Use VSCode Decorations API to render outputs below chunks. Instrument R code to capture text output (via sink()) and plots (via png device). Send code to visible terminal for execution. Parse terminal output and read saved files to display inline.

**Tech Stack:** TypeScript, VSCode Extension API, Node.js, Yeoman generator

---

## Task 1: Scaffold Extension Project

**Files:**
- Create: Project structure via Yeoman generator

**Step 1: Install Yeoman and VSCode extension generator**

```bash
npm install -g yo generator-code
```

Expected: Installation success

**Step 2: Generate extension scaffold**

```bash
cd /home/b/projects/quarto-proper
yo code
```

When prompted, select:
- Type: "New Extension (TypeScript)"
- Name: "quarto-inline-output"
- Identifier: "quarto-inline-output"
- Description: "Display code chunk outputs inline in Quarto documents"
- Initialize git: "Yes"
- Package manager: "npm"

Expected: Project created in `quarto-inline-output/` directory

**Step 3: Verify scaffold structure**

```bash
cd quarto-inline-output
ls -la
```

Expected output should include:
- `.vscode/`
- `src/extension.ts`
- `package.json`
- `tsconfig.json`

**Step 4: Install dependencies**

```bash
npm install
```

Expected: Dependencies installed successfully

**Step 5: Test the scaffold**

```bash
npm run compile
```

Expected: TypeScript compilation succeeds, creates `out/extension.js`

**Step 6: Commit scaffold**

```bash
git add .
git commit -m "feat: scaffold extension with Yeoman generator"
```

---

## Task 2: Create Chunk Parser

**Files:**
- Create: `src/chunkParser.ts`
- Create: `src/test/chunkParser.test.ts`

**Step 1: Write the failing test**

Create `src/test/chunkParser.test.ts`:

```typescript
import * as assert from 'assert';
import { parseChunks, CodeChunk } from '../chunkParser';

suite('ChunkParser Test Suite', () => {
    test('should parse single R chunk', () => {
        const content = `# Test document
\`\`\`{r}
x <- 1 + 1
print(x)
\`\`\`
`;
        const chunks = parseChunks(content);
        assert.strictEqual(chunks.length, 1);
        assert.strictEqual(chunks[0].language, 'r');
        assert.strictEqual(chunks[0].code, 'x <- 1 + 1\nprint(x)');
        assert.strictEqual(chunks[0].startLine, 1);
        assert.strictEqual(chunks[0].endLine, 4);
    });

    test('should parse multiple chunks', () => {
        const content = `\`\`\`{r}
x <- 1
\`\`\`

Some text

\`\`\`{python}
y = 2
\`\`\`
`;
        const chunks = parseChunks(content);
        assert.strictEqual(chunks.length, 2);
        assert.strictEqual(chunks[0].language, 'r');
        assert.strictEqual(chunks[1].language, 'python');
    });

    test('should return empty array for no chunks', () => {
        const content = 'Just some text with no code chunks';
        const chunks = parseChunks(content);
        assert.strictEqual(chunks.length, 0);
    });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL - Module '../chunkParser' not found

**Step 3: Write minimal implementation**

Create `src/chunkParser.ts`:

```typescript
export interface CodeChunk {
    language: string;
    code: string;
    startLine: number;
    endLine: number;
    options?: Record<string, any>;
}

export function parseChunks(content: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');

    let inChunk = false;
    let currentChunk: Partial<CodeChunk> | null = null;
    let chunkLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match chunk start: ```{language}
        const startMatch = line.match(/^```\{(\w+)(?:\s+(.+))?\}/);
        if (startMatch && !inChunk) {
            inChunk = true;
            currentChunk = {
                language: startMatch[1],
                startLine: i,
                options: parseChunkOptions(startMatch[2])
            };
            chunkLines = [];
            continue;
        }

        // Match chunk end: ```
        if (line.trim() === '```' && inChunk && currentChunk) {
            currentChunk.code = chunkLines.join('\n');
            currentChunk.endLine = i;
            chunks.push(currentChunk as CodeChunk);
            inChunk = false;
            currentChunk = null;
            chunkLines = [];
            continue;
        }

        // Collect chunk content
        if (inChunk) {
            chunkLines.push(line);
        }
    }

    return chunks;
}

function parseChunkOptions(optionsString?: string): Record<string, any> {
    if (!optionsString) {
        return {};
    }

    // Basic option parsing - can be enhanced later
    const options: Record<string, any> = {};
    const pairs = optionsString.split(',');

    for (const pair of pairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (key && value) {
            options[key] = value;
        }
    }

    return options;
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS - All 3 tests pass

**Step 5: Commit**

```bash
git add src/chunkParser.ts src/test/chunkParser.test.ts
git commit -m "feat: add chunk parser for R and Python code blocks"
```

---

## Task 3: Create Terminal Manager

**Files:**
- Create: `src/terminalManager.ts`

**Step 1: Write the implementation**

Create `src/terminalManager.ts`:

```typescript
import * as vscode from 'vscode';

export class TerminalManager {
    private terminals: Map<string, vscode.Terminal> = new Map();
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Track terminal disposal
        this.disposables.push(
            vscode.window.onDidCloseTerminal(terminal => {
                // Find and remove closed terminal
                for (const [key, term] of this.terminals.entries()) {
                    if (term === terminal) {
                        this.terminals.delete(key);
                        break;
                    }
                }
            })
        );
    }

    public getOrCreateTerminal(language: string): vscode.Terminal {
        const key = `quarto-${language}`;

        // Return existing terminal if available
        if (this.terminals.has(key)) {
            const terminal = this.terminals.get(key)!;
            return terminal;
        }

        // Create new terminal
        const terminal = vscode.window.createTerminal({
            name: `Quarto ${language.toUpperCase()}`,
            shellPath: this.getShellPath(language)
        });

        this.terminals.set(key, terminal);
        return terminal;
    }

    private getShellPath(language: string): string | undefined {
        switch (language.toLowerCase()) {
            case 'r':
                return 'R';
            case 'python':
                return 'python3';
            default:
                return undefined;
        }
    }

    public dispose(): void {
        for (const terminal of this.terminals.values()) {
            terminal.dispose();
        }
        this.terminals.clear();

        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
```

**Step 2: Compile and verify**

```bash
npm run compile
```

Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src/terminalManager.ts
git commit -m "feat: add terminal manager for R and Python sessions"
```

---

## Task 4: Create Base Executor Interface

**Files:**
- Create: `src/executors/baseExecutor.ts`

**Step 1: Write the interface**

Create `src/executors/baseExecutor.ts`:

```typescript
import * as vscode from 'vscode';

export interface ExecutionResult {
    textOutput?: string;
    plotPaths?: string[];
    error?: string;
}

export interface CodeChunkExecution {
    code: string;
    options?: Record<string, any>;
}

export abstract class BaseExecutor {
    protected terminal: vscode.Terminal;

    constructor(terminal: vscode.Terminal) {
        this.terminal = terminal;
    }

    /**
     * Execute code chunk and return captured outputs
     */
    abstract executeChunk(chunk: CodeChunkExecution): Promise<ExecutionResult>;

    /**
     * Get the language this executor handles
     */
    abstract getLanguage(): string;

    /**
     * Instrument code with output capture logic
     */
    protected abstract instrumentCode(code: string, options?: Record<string, any>): string;

    /**
     * Show terminal to user
     */
    protected showTerminal(): void {
        this.terminal.show(true); // preserveFocus = true
    }
}
```

**Step 2: Compile and verify**

```bash
npm run compile
```

Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src/executors/baseExecutor.ts
git commit -m "feat: add base executor interface"
```

---

## Task 5: Create R Executor with Text Output Capture

**Files:**
- Create: `src/executors/rExecutor.ts`

**Step 1: Write the implementation**

Create `src/executors/rExecutor.ts`:

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BaseExecutor, ExecutionResult, CodeChunkExecution } from './baseExecutor';

export class RExecutor extends BaseExecutor {
    private outputDir: string;

    constructor(terminal: vscode.Terminal) {
        super(terminal);
        this.outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quarto-r-'));
    }

    getLanguage(): string {
        return 'r';
    }

    async executeChunk(chunk: CodeChunkExecution): Promise<ExecutionResult> {
        const outputFile = path.join(this.outputDir, `output-${Date.now()}.txt`);
        const instrumentedCode = this.instrumentCode(chunk.code, chunk.options, outputFile);

        this.showTerminal();
        this.terminal.sendText(instrumentedCode);

        // Wait for execution to complete
        await this.waitForExecution();

        // Read output file
        const result: ExecutionResult = {};

        if (fs.existsSync(outputFile)) {
            result.textOutput = fs.readFileSync(outputFile, 'utf-8');
            // Clean up
            fs.unlinkSync(outputFile);
        }

        return result;
    }

    protected instrumentCode(code: string, options: Record<string, any> | undefined, outputFile: string): string {
        // Escape special characters in path
        const escapedPath = outputFile.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        return `
# Quarto Inline Output Capture
.quarto_output_file <- '${escapedPath}'
sink(.quarto_output_file)
tryCatch({
${code}
}, error = function(e) {
  cat("Error:", conditionMessage(e), "\\n")
}, finally = {
  sink()
})
rm(.quarto_output_file)
`;
    }

    private async waitForExecution(): Promise<void> {
        // Simple delay - will be improved later
        return new Promise(resolve => setTimeout(resolve, 1000));
    }

    public dispose(): void {
        // Clean up temp directory
        if (fs.existsSync(this.outputDir)) {
            fs.rmSync(this.outputDir, { recursive: true, force: true });
        }
    }
}
```

**Step 2: Compile and verify**

```bash
npm run compile
```

Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src/executors/rExecutor.ts
git commit -m "feat: add R executor with text output capture"
```

---

## Task 6: Create Decoration Manager

**Files:**
- Create: `src/decorationManager.ts`

**Step 1: Write the implementation**

Create `src/decorationManager.ts`:

```typescript
import * as vscode from 'vscode';

interface ChunkOutput {
    chunkEndLine: number;
    textOutput?: string;
    plotPaths?: string[];
}

export class DecorationManager {
    private outputDecorationType: vscode.TextEditorDecorationType;
    private chunkOutputs: Map<string, ChunkOutput[]> = new Map(); // documentUri -> outputs

    constructor() {
        this.outputDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: '',
            },
            isWholeLine: true,
        });
    }

    public setChunkOutput(
        editor: vscode.TextEditor,
        chunkEndLine: number,
        textOutput?: string,
        plotPaths?: string[]
    ): void {
        const uri = editor.document.uri.toString();

        // Get or create outputs array for this document
        if (!this.chunkOutputs.has(uri)) {
            this.chunkOutputs.set(uri, []);
        }

        const outputs = this.chunkOutputs.get(uri)!;

        // Remove existing output for this chunk if any
        const existingIndex = outputs.findIndex(o => o.chunkEndLine === chunkEndLine);
        if (existingIndex >= 0) {
            outputs.splice(existingIndex, 1);
        }

        // Add new output
        outputs.push({
            chunkEndLine,
            textOutput,
            plotPaths
        });

        // Re-render all decorations for this document
        this.renderDecorations(editor);
    }

    public clearChunkOutput(editor: vscode.TextEditor, chunkEndLine: number): void {
        const uri = editor.document.uri.toString();
        const outputs = this.chunkOutputs.get(uri);

        if (outputs) {
            const index = outputs.findIndex(o => o.chunkEndLine === chunkEndLine);
            if (index >= 0) {
                outputs.splice(index, 1);
                this.renderDecorations(editor);
            }
        }
    }

    public clearAllOutputs(editor: vscode.TextEditor): void {
        const uri = editor.document.uri.toString();
        this.chunkOutputs.delete(uri);
        editor.setDecorations(this.outputDecorationType, []);
    }

    private renderDecorations(editor: vscode.TextEditor): void {
        const uri = editor.document.uri.toString();
        const outputs = this.chunkOutputs.get(uri) || [];

        const decorations: vscode.DecorationOptions[] = [];

        for (const output of outputs) {
            const decoration = this.createDecoration(editor, output);
            if (decoration) {
                decorations.push(decoration);
            }
        }

        editor.setDecorations(this.outputDecorationType, decorations);
    }

    private createDecoration(
        editor: vscode.TextEditor,
        output: ChunkOutput
    ): vscode.DecorationOptions | null {
        const line = output.chunkEndLine;

        if (line >= editor.document.lineCount) {
            return null;
        }

        let contentText = '\n';

        if (output.textOutput) {
            // Format text output
            const lines = output.textOutput.trim().split('\n');
            contentText += '┌─ Output ─────────────────────────────────\n';
            for (const line of lines) {
                contentText += `│ ${line}\n`;
            }
            contentText += '└──────────────────────────────────────────\n';
        }

        if (output.plotPaths && output.plotPaths.length > 0) {
            contentText += `\n📊 ${output.plotPaths.length} plot(s) generated\n`;
        }

        const range = new vscode.Range(line, 0, line, 0);

        return {
            range,
            renderOptions: {
                after: {
                    contentText,
                    color: new vscode.ThemeColor('editorCodeLens.foreground'),
                    fontStyle: 'normal',
                    fontWeight: 'normal',
                }
            }
        };
    }

    public dispose(): void {
        this.outputDecorationType.dispose();
        this.chunkOutputs.clear();
    }
}
```

**Step 2: Compile and verify**

```bash
npm run compile
```

Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src/decorationManager.ts
git commit -m "feat: add decoration manager for inline output rendering"
```

---

## Task 7: Create Code Lens Provider

**Files:**
- Create: `src/codeLensProvider.ts`

**Step 1: Write the implementation**

Create `src/codeLensProvider.ts`:

```typescript
import * as vscode from 'vscode';
import { parseChunks } from './chunkParser';

export class QuartoCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];

        // Only provide code lenses for Quarto documents
        if (!this.isQuartoDocument(document)) {
            return codeLenses;
        }

        const chunks = parseChunks(document.getText());

        for (const chunk of chunks) {
            // Create "Run" code lens at the start of each chunk
            const range = new vscode.Range(chunk.startLine, 0, chunk.startLine, 0);

            const runCommand: vscode.Command = {
                title: '▶ Run',
                command: 'quarto-inline-output.runChunk',
                arguments: [chunk]
            };

            codeLenses.push(new vscode.CodeLens(range, runCommand));
        }

        return codeLenses;
    }

    private isQuartoDocument(document: vscode.TextDocument): boolean {
        return document.fileName.endsWith('.qmd') || document.languageId === 'quarto';
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
```

**Step 2: Compile and verify**

```bash
npm run compile
```

Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src/codeLensProvider.ts
git commit -m "feat: add code lens provider for run buttons"
```

---

## Task 8: Wire Everything Together in Extension Entry Point

**Files:**
- Modify: `src/extension.ts`

**Step 1: Replace extension.ts content**

Modify `src/extension.ts`:

```typescript
import * as vscode from 'vscode';
import { QuartoCodeLensProvider } from './codeLensProvider';
import { TerminalManager } from './terminalManager';
import { DecorationManager } from './decorationManager';
import { RExecutor } from './executors/rExecutor';
import { CodeChunk } from './chunkParser';

let terminalManager: TerminalManager;
let decorationManager: DecorationManager;
let codeLensProvider: QuartoCodeLensProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Quarto Inline Output extension is now active');

    // Initialize managers
    terminalManager = new TerminalManager();
    decorationManager = new DecorationManager();
    codeLensProvider = new QuartoCodeLensProvider();

    // Register code lens provider
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        { language: 'quarto', scheme: 'file' },
        codeLensProvider
    );

    // Also register for markdown files with .qmd extension
    const mdCodeLensDisposable = vscode.languages.registerCodeLensProvider(
        { pattern: '**/*.qmd', scheme: 'file' },
        codeLensProvider
    );

    // Register run chunk command
    const runChunkCommand = vscode.commands.registerCommand(
        'quarto-inline-output.runChunk',
        async (chunk: CodeChunk) => {
            await runChunk(chunk);
        }
    );

    // Register refresh command
    const refreshCommand = vscode.commands.registerCommand(
        'quarto-inline-output.refresh',
        () => {
            codeLensProvider.refresh();
        }
    );

    // Refresh code lenses when document changes
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.fileName.endsWith('.qmd')) {
            codeLensProvider.refresh();
        }
    });

    context.subscriptions.push(
        codeLensDisposable,
        mdCodeLensDisposable,
        runChunkCommand,
        refreshCommand,
        changeDisposable,
        { dispose: () => terminalManager.dispose() },
        { dispose: () => decorationManager.dispose() }
    );
}

async function runChunk(chunk: CodeChunk): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    try {
        // Get appropriate executor based on language
        let executor;

        switch (chunk.language.toLowerCase()) {
            case 'r':
                const rTerminal = terminalManager.getOrCreateTerminal('r');
                executor = new RExecutor(rTerminal);
                break;
            default:
                vscode.window.showWarningMessage(`Language ${chunk.language} not yet supported`);
                return;
        }

        // Execute chunk
        const result = await executor.executeChunk({
            code: chunk.code,
            options: chunk.options
        });

        // Display output
        decorationManager.setChunkOutput(
            editor,
            chunk.endLine,
            result.textOutput,
            result.plotPaths
        );

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to execute chunk: ${message}`);
    }
}

export function deactivate() {
    if (terminalManager) {
        terminalManager.dispose();
    }
    if (decorationManager) {
        decorationManager.dispose();
    }
}
```

**Step 2: Compile and verify**

```bash
npm run compile
```

Expected: Compilation succeeds

**Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire up all components in extension entry point"
```

---

## Task 9: Update Package.json with Extension Metadata

**Files:**
- Modify: `package.json`

**Step 1: Update package.json**

Modify the `package.json` file to add proper activation events and contributions:

```json
{
  "name": "quarto-inline-output",
  "displayName": "Quarto Inline Output",
  "description": "Display code chunk outputs inline in Quarto documents",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onLanguage:quarto",
    "onLanguage:markdown"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "quarto-inline-output.runChunk",
        "title": "Run Quarto Chunk"
      },
      {
        "command": "quarto-inline-output.refresh",
        "title": "Refresh Quarto Code Lenses"
      }
    ],
    "keybindings": [
      {
        "command": "quarto-inline-output.runChunk",
        "key": "ctrl+enter",
        "mac": "cmd+enter",
        "when": "editorTextFocus && resourceExtname == .qmd"
      }
    ]
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile && npm run lint",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/mocha": "^10.0.6",
    "@types/node": "18.x",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "eslint": "^8.56.0",
    "typescript": "^5.3.3",
    "@vscode/test-electron": "^2.3.8"
  }
}
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "feat: update package.json with extension metadata and keybindings"
```

---

## Task 10: Create Test Quarto Documents

**Files:**
- Create: `test-documents/01-basic-analysis.qmd`
- Create: `test-documents/02-visualization.qmd`
- Create: `test-documents/03-summary-stats.qmd`

**Step 1: Create test documents directory**

```bash
mkdir -p test-documents
```

**Step 2: Create basic analysis document**

Create `test-documents/01-basic-analysis.qmd`:

````markdown
---
title: "Basic mtcars Analysis"
format: html
---

## Introduction

Basic exploration of the mtcars dataset.

```{r}
# Load and examine the mtcars dataset
data(mtcars)
head(mtcars)
```

```{r}
# Get dimensions
dim(mtcars)
```

```{r}
# Summary statistics
summary(mtcars$mpg)
```

```{r}
# Calculate mean MPG by number of cylinders
aggregate(mpg ~ cyl, data = mtcars, FUN = mean)
```
````

**Step 3: Create visualization document**

Create `test-documents/02-visualization.qmd`:

````markdown
---
title: "mtcars Visualizations"
format: html
---

## Plotting mtcars Data

```{r}
# Simple scatter plot
plot(mtcars$wt, mtcars$mpg,
     xlab = "Weight (1000 lbs)",
     ylab = "Miles per Gallon",
     main = "MPG vs Weight")
```

```{r}
# Histogram of MPG
hist(mtcars$mpg,
     breaks = 10,
     col = "skyblue",
     main = "Distribution of MPG",
     xlab = "Miles per Gallon")
```

```{r}
# Boxplot by cylinder
boxplot(mpg ~ cyl, data = mtcars,
        xlab = "Number of Cylinders",
        ylab = "Miles per Gallon",
        main = "MPG by Cylinder Count",
        col = c("lightblue", "lightgreen", "lightcoral"))
```
````

**Step 4: Create summary statistics document**

Create `test-documents/03-summary-stats.qmd`:

````markdown
---
title: "mtcars Summary Statistics"
format: html
---

## Comprehensive Analysis

```{r}
# Load dataset
data(mtcars)
str(mtcars)
```

```{r}
# Correlation between weight and MPG
cor(mtcars$wt, mtcars$mpg)
```

```{r}
# Group statistics by transmission type
aggregate(cbind(mpg, hp, wt) ~ am, data = mtcars, FUN = mean)
```

```{r}
# Create a simple linear model
model <- lm(mpg ~ wt + hp, data = mtcars)
summary(model)
```

```{r}
# Check for errors - intentional
print("Testing error handling:")
sqrt(-1)
```
````

**Step 5: Commit test documents**

```bash
git add test-documents/
git commit -m "feat: add test Quarto documents for mtcars analysis"
```

---

## Task 11: Test the Extension

**Files:**
- None (manual testing)

**Step 1: Open extension in development mode**

```bash
cd quarto-inline-output
code .
```

In VSCode:
1. Press F5 to launch Extension Development Host
2. A new VSCode window opens with the extension loaded

**Step 2: Open a test document**

In the Extension Development Host window:
1. File > Open Folder > Select `test-documents` folder
2. Open `01-basic-analysis.qmd`

**Step 3: Verify Code Lenses appear**

Expected: "▶ Run" buttons appear above each R code chunk

**Step 4: Test chunk execution**

1. Click "▶ Run" on the first chunk
2. Observe:
   - R terminal opens
   - Code executes
   - Output appears below the chunk (decorated text)

**Step 5: Test multiple chunks**

Run each chunk in sequence and verify:
- Outputs appear below respective chunks
- R terminal maintains state between chunks
- Variables persist (e.g., `mtcars` stays loaded)

**Step 6: Test keyboard shortcut**

1. Place cursor inside a code chunk
2. Press Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
3. Verify chunk executes

**Step 7: Document test results**

Create a file noting any issues found during testing.

---

## Next Steps After MVP

### Phase 2: Plot Support
**Files to create:**
- Modify: `src/executors/rExecutor.ts` - Add plot device instrumentation
- Modify: `src/decorationManager.ts` - Add image rendering

### Phase 3: Enhanced Features
- Collapse/expand UI for outputs
- Clear output commands
- Better error formatting
- Configuration options

### Phase 4: Python Support
- Create: `src/executors/pythonExecutor.ts`
- Adapt output capture for matplotlib

---

## Key Testing Points

1. **Chunk parsing**: Various chunk formats, edge cases
2. **Terminal management**: Creating, reusing, handling closed terminals
3. **Output capture**: Text output, errors, empty output
4. **Decorations**: Multiple chunks, re-running chunks, clearing outputs
5. **State persistence**: Variables should persist across chunk executions

## Common Issues & Solutions

**Issue:** Code lenses don't appear
- Check file extension is `.qmd`
- Verify extension activated (check Output > Quarto Inline Output)

**Issue:** Output doesn't appear
- Check R terminal for errors
- Verify temp file creation (console.log in rExecutor)
- Increase wait time in `waitForExecution()`

**Issue:** Terminal not created
- Check R is installed and in PATH
- Verify terminal manager initialization

## Architecture Reminders

- **DRY**: Executor interface allows adding Python/Julia without duplication
- **YAGNI**: MVP focuses on R + text output only
- **TDD**: ChunkParser has tests; add more for other components
- **Frequent commits**: Each component committed independently
