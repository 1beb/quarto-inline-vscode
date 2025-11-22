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
        const parts: string[] = [];

        for (let i = 0; i < data.cells.length; i++) {
            const cell = data.cells[i];
            const isFirstCell = i === 0;
            const isLastCell = i === data.cells.length - 1;

            if (cell.kind === vscode.NotebookCellKind.Markup) {
                // Markdown cells written as-is
                parts.push(cell.value);
            } else if (cell.kind === vscode.NotebookCellKind.Code) {
                // Add blank line before code fence if previous cell doesn't end with double newline
                if (!isFirstCell && !parts[parts.length - 1].endsWith('\n\n')) {
                    if (parts[parts.length - 1].endsWith('\n')) {
                        parts.push('\n');
                    } else {
                        parts.push('\n\n');
                    }
                }

                // Build chunk header with options
                let chunkHeader = `\`\`\`{${cell.languageId}`;

                if (cell.metadata?.chunkOptions) {
                    const options = Object.entries(cell.metadata.chunkOptions)
                        .map(([key, value]) => `${key}=${value}`)
                        .join(', ');
                    chunkHeader += ` ${options}`;
                }

                chunkHeader += '}';

                // Code cells wrapped in fences with newlines
                parts.push(`${chunkHeader}\n`);
                parts.push(cell.value);
                parts.push('\n```');

                // Add blank line after code fence if not the last cell
                if (!isLastCell) {
                    parts.push('\n');
                }
            }
        }

        return Buffer.from(parts.join(''), 'utf-8');
    }
}
