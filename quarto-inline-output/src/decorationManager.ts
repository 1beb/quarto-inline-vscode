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

        console.log('[DecorationManager] Setting output for chunk ending at line', chunkEndLine);
        console.log('[DecorationManager] Text output:', textOutput);
        console.log('[DecorationManager] Plot paths:', plotPaths);

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

        console.log('[DecorationManager] Total outputs for document:', outputs.length);

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

        console.log('[DecorationManager] Rendering decorations for', outputs.length, 'outputs');

        const decorations: vscode.DecorationOptions[] = [];

        for (const output of outputs) {
            const decoration = this.createDecoration(editor, output);
            if (decoration) {
                decorations.push(decoration);
                console.log('[DecorationManager] Created decoration for line', output.chunkEndLine);
            } else {
                console.log('[DecorationManager] Failed to create decoration for line', output.chunkEndLine);
            }
        }

        console.log('[DecorationManager] Setting', decorations.length, 'decorations');
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

        // Create hover message with full output
        const hoverMessage = new vscode.MarkdownString();
        hoverMessage.isTrusted = true;

        if (output.textOutput) {
            const trimmed = output.textOutput.trim();
            const lineCount = trimmed.split('\n').length;
            hoverMessage.appendMarkdown(`**Output (${lineCount} lines)**\n\n`);
            hoverMessage.appendCodeblock(trimmed, 'r');
        }

        if (output.plotPaths && output.plotPaths.length > 0) {
            hoverMessage.appendMarkdown(`\n\n**Plots:** ${output.plotPaths.length} generated`);
        }

        // Create a simple inline indicator
        let contentText = '';
        if (output.textOutput) {
            const lines = output.textOutput.trim().split('\n');
            contentText = ` 📋 Output (${lines.length} lines)`;
        }
        if (output.plotPaths && output.plotPaths.length > 0) {
            contentText += ` 📊 ${output.plotPaths.length} plot(s)`;
        }

        const range = new vscode.Range(line, 0, line, 0);

        return {
            range,
            hoverMessage,
            renderOptions: {
                after: {
                    contentText,
                    color: new vscode.ThemeColor('editorInfo.foreground'),
                    margin: '0 0 0 2em',
                }
            }
        };
    }

    public dispose(): void {
        this.outputDecorationType.dispose();
        this.chunkOutputs.clear();
    }
}
