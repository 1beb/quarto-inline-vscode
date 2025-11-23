import * as vscode from 'vscode';
import { PseudoterminalManager } from './pseudoterminalManager';
import { OutputData } from './rPseudoterminalSimple';

export class QuartoNotebookController {
    private controller: vscode.NotebookController;
    private pseudoterminalManager: PseudoterminalManager;

    constructor(pseudoterminalManager: PseudoterminalManager) {
        this.pseudoterminalManager = pseudoterminalManager;

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
        notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): Promise<void> {
        for (const cell of cells) {
            await this.executeSingleCell(cell, notebook);
        }
    }

    private async executeSingleCell(cell: vscode.NotebookCell, notebook: vscode.NotebookDocument): Promise<void> {
        const execution = this.controller.createNotebookCellExecution(cell);
        execution.start(Date.now());
        execution.clearOutput();

        try {
            // Get workspace folder for this notebook
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(notebook.uri)?.uri.fsPath;

            // Get pseudoterminal for this language
            const { terminal, pty } = this.pseudoterminalManager.getOrCreatePseudoterminal(
                cell.document.languageId,
                workspaceFolder
            );

            // Show terminal so user can see execution
            terminal.show(true); // preserveFocus = true

            // Execute code using the pseudoterminal
            const outputs = await pty.executeCode(cell.document.getText());

            // Process outputs and create appropriate NotebookCellOutputItems
            const cellOutputs: vscode.NotebookCellOutput[] = [];

            for (const output of outputs) {
                let outputItems: vscode.NotebookCellOutputItem[] = [];

                switch (output.type) {
                    case 'text':
                        outputItems.push(
                            vscode.NotebookCellOutputItem.text(output.content, 'text/plain')
                        );
                        break;

                    case 'html':
                        // Support for HTML output (gt tables, htmlwidgets, etc.)
                        outputItems.push(
                            vscode.NotebookCellOutputItem.text(output.content, 'text/html')
                        );
                        break;

                    case 'error':
                        outputItems.push(
                            vscode.NotebookCellOutputItem.error(new Error(output.content))
                        );
                        break;

                    case 'image':
                        // Display image from base64 data
                        const imageBuffer = Buffer.from(output.content, 'base64');
                        outputItems.push(
                            new vscode.NotebookCellOutputItem(imageBuffer, 'image/png')
                        );
                        break;
                }

                if (outputItems.length > 0) {
                    cellOutputs.push(new vscode.NotebookCellOutput(outputItems));
                }
            }

            // Replace all outputs at once
            if (cellOutputs.length > 0) {
                execution.replaceOutput(cellOutputs);
            }

            execution.end(true, Date.now());

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
