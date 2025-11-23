import * as vscode from 'vscode';
import { QuartoCodeLensProvider } from './codeLensProvider';
import { PseudoterminalManager } from './pseudoterminalManager';
import { DecorationManager } from './decorationManager';
import { RExecutor } from './executors/rExecutor';
import { CodeChunk } from './chunkParser';
import { QuartoNotebookSerializer } from './notebookSerializer';
import { QuartoNotebookController } from './notebookController';

let pseudoterminalManager: PseudoterminalManager;
let decorationManager: DecorationManager;
let codeLensProvider: QuartoCodeLensProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Quarto Inline Output extension is now active');

    // Initialize managers
    pseudoterminalManager = new PseudoterminalManager();
    decorationManager = new DecorationManager();
    codeLensProvider = new QuartoCodeLensProvider();

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
    const notebookController = new QuartoNotebookController(pseudoterminalManager);
    context.subscriptions.push(notebookController);

    // Register code lens provider for .qmd files
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
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

    // Refresh code lenses when document changes
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.fileName.endsWith('.qmd')) {
            codeLensProvider.refresh();
        }
    });

    context.subscriptions.push(
        codeLensDisposable,
        runChunkCommand,
        refreshCommand,
        openAsNotebookCommand,
        openAsTextCommand,
        changeDisposable,
        { dispose: () => pseudoterminalManager.dispose() },
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
        // Get workspace folder
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;

        // Get pseudoterminal for this language
        const { terminal, pty } = pseudoterminalManager.getOrCreatePseudoterminal(
            chunk.language,
            workspaceFolder
        );

        // Show terminal
        terminal.show(true);

        // Execute code using pseudoterminal
        const outputs = await pty.executeCode(chunk.code);

        // Process outputs for decoration display
        let textOutput = '';
        let htmlOutput = '';

        for (const output of outputs) {
            switch (output.type) {
                case 'text':
                    textOutput += output.content + '\n';
                    break;
                case 'html':
                    htmlOutput += output.content;
                    break;
                case 'error':
                    textOutput += 'Error: ' + output.content + '\n';
                    break;
            }
        }

        // Display output (decorations API doesn't support HTML yet, so we show text summary)
        if (htmlOutput) {
            textOutput += '[HTML output generated - view in notebook mode for full rendering]';
        }

        decorationManager.setChunkOutput(
            editor,
            chunk.endLine,
            textOutput.trim(),
            [] // plots not yet supported in decoration mode
        );

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to execute chunk: ${message}`);
    }
}

export function deactivate() {
    if (pseudoterminalManager) {
        pseudoterminalManager.dispose();
    }
    if (decorationManager) {
        decorationManager.dispose();
    }
}
