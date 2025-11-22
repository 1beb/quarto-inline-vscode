import * as vscode from 'vscode';
import { QuartoCodeLensProvider } from './codeLensProvider';
import { TerminalManager } from './terminalManager';
import { DecorationManager } from './decorationManager';
import { RExecutor } from './executors/rExecutor';
import { CodeChunk } from './chunkParser';
import { QuartoNotebookSerializer } from './notebookSerializer';
import { QuartoNotebookController } from './notebookController';

let terminalManager: TerminalManager;
let decorationManager: DecorationManager;
let codeLensProvider: QuartoCodeLensProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Quarto Inline Output extension is now active');

    // Initialize managers
    terminalManager = new TerminalManager();
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
    const notebookController = new QuartoNotebookController(terminalManager);
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

    try {
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
    } finally {
        // Dispose executor to clean up temp directories
        if (executor && 'dispose' in executor) {
            executor.dispose();
        }
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
