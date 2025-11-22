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
                title: '▶ Display',
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
