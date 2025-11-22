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
            const terminal = this.terminalManager.getOrCreateTerminal(cell.document.languageId);

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
