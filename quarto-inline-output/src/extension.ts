import * as vscode from 'vscode';
import { QuartoCodeLensProvider } from './codeLensProvider';
import { DecorationManager } from './decorationManager';
import { CodeChunk } from './chunkParser';
import { QuartoNotebookSerializer } from './notebookSerializer';
import { QuartoNotebookController } from './notebookController';

let decorationManager: DecorationManager;
let codeLensProvider: QuartoCodeLensProvider;
let notebookController: QuartoNotebookController;

export function activate(context: vscode.ExtensionContext) {
    console.log('Quarto Inline Output extension is now active (file-based IPC mode)');

    // Initialize managers
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

    // Register notebook controller (uses default terminal + file-based output capture)
    notebookController = new QuartoNotebookController();
    context.subscriptions.push(notebookController);

    // Register code lens provider for .qmd files
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        { pattern: '**/*.qmd', scheme: 'file' },
        codeLensProvider
    );

    // Register run chunk command (simplified for now - uses notebook execution)
    const runChunkCommand = vscode.commands.registerCommand(
        'quarto-inline-output.runChunk',
        async (chunk: CodeChunk) => {
            vscode.window.showInformationMessage(
                'Run chunk from text editor not yet supported in file-IPC mode. Open as notebook to execute.'
            );
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
        { dispose: () => decorationManager.dispose() }
    );
}

export function deactivate() {
    if (notebookController) {
        notebookController.dispose();
    }
    if (decorationManager) {
        decorationManager.dispose();
    }
}
