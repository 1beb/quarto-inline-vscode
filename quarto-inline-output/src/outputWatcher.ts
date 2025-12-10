import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface CellOutput {
    type: 'OUTPUT' | 'MESSAGE' | 'WARNING' | 'ERROR' | 'PLOT' | 'HTML' | 'CELL_START' | 'CELL_END';
    content: string;
    cellId: string;
}

interface YamlOptions {
    echo: boolean;
    message: boolean;
    warning: boolean;
    error: boolean;
}

export class OutputWatcher {
    private outputDir: string;
    private outputFile: string;
    private plotDir: string;
    private watcher: fs.FSWatcher | null = null;
    private lastPosition: number = 0;
    private pendingContent: string = '';  // Accumulate incomplete blocks
    private cellOutputs: Map<string, CellOutput[]> = new Map();
    private cellCallbacks: Map<string, (outputs: CellOutput[]) => void> = new Map();
    private defaultYamlOptions: YamlOptions = {
        echo: true,
        message: true,
        warning: true,
        error: true
    };

    constructor() {
        this.outputDir = path.join(os.tmpdir(), 'quarto-inline');
        this.outputFile = path.join(this.outputDir, 'output.txt');
        this.plotDir = path.join(this.outputDir, 'plots');
    }

    public getOutputDir(): string {
        return this.outputDir;
    }

    private pollInterval: NodeJS.Timeout | null = null;

    public start(): void {
        // Ensure directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // Clear any existing output file
        if (fs.existsSync(this.outputFile)) {
            fs.unlinkSync(this.outputFile);
        }
        fs.writeFileSync(this.outputFile, '');
        this.lastPosition = 0;
        this.pendingContent = '';

        // Use polling instead of fs.watch (more reliable on Linux)
        this.pollInterval = setInterval(() => {
            this.processNewOutput();
        }, 100); // Poll every 100ms

        console.log('OutputWatcher started, polling:', this.outputFile);
    }

    public stop(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    public waitForCell(cellId: string, yamlOptions?: Partial<YamlOptions>): Promise<CellOutput[]> {
        const options = { ...this.defaultYamlOptions, ...yamlOptions };

        return new Promise((resolve) => {
            // Check if we already have complete output for this cell
            const existing = this.cellOutputs.get(cellId);
            if (existing && existing.some(o => o.type === 'CELL_END')) {
                resolve(this.filterOutputs(existing, options));
                return;
            }

            // Wait for cell completion
            this.cellCallbacks.set(cellId, (outputs) => {
                resolve(this.filterOutputs(outputs, options));
            });
        });
    }

    private filterOutputs(outputs: CellOutput[], options: YamlOptions): CellOutput[] {
        return outputs.filter(output => {
            switch (output.type) {
                case 'MESSAGE':
                    return options.message;
                case 'WARNING':
                    return options.warning;
                case 'ERROR':
                    return options.error;
                case 'CELL_START':
                case 'CELL_END':
                    return false; // Don't include markers in final output
                default:
                    return true;
            }
        });
    }

    private processNewOutput(): void {
        try {
            if (!fs.existsSync(this.outputFile)) return;

            const content = fs.readFileSync(this.outputFile, 'utf-8');
            const newContent = content.slice(this.lastPosition);
            this.lastPosition = content.length;

            if (!newContent) return;

            // Accumulate with pending content from previous incomplete reads
            this.pendingContent += newContent;

            if (!this.pendingContent.trim()) return;

            // Parse output blocks
            // Format: ###TYPE:CELL_ID###\nCONTENT\n###END###
            const blockRegex = /###(\w+):([^#]+)###\n([\s\S]*?)\n###END###/g;
            let match;
            let lastMatchEnd = 0;

            while ((match = blockRegex.exec(this.pendingContent)) !== null) {
                const [fullMatch, type, cellId, blockContent] = match;
                lastMatchEnd = match.index + fullMatch.length;
                console.log('OutputWatcher: Parsed block - type:', type, 'cellId:', cellId);

                const output: CellOutput = {
                    type: type as CellOutput['type'],
                    content: blockContent.trim(),
                    cellId: cellId.trim()
                };

                // Store output
                if (!this.cellOutputs.has(output.cellId)) {
                    this.cellOutputs.set(output.cellId, []);
                }
                this.cellOutputs.get(output.cellId)!.push(output);

                // Check if cell is complete
                if (output.type === 'CELL_END') {
                    console.log('OutputWatcher: CELL_END detected for', output.cellId);
                    const callback = this.cellCallbacks.get(output.cellId);
                    if (callback) {
                        console.log('OutputWatcher: Calling callback for', output.cellId);
                        callback(this.cellOutputs.get(output.cellId)!);
                        this.cellCallbacks.delete(output.cellId);
                    } else {
                        console.log('OutputWatcher: No callback found for', output.cellId);
                    }
                }
            }

            // Keep only unparsed content (incomplete blocks)
            if (lastMatchEnd > 0) {
                this.pendingContent = this.pendingContent.slice(lastMatchEnd);
            }
        } catch (error) {
            console.error('Error processing output:', error);
        }
    }

    public clearCellOutput(cellId: string): void {
        this.cellOutputs.delete(cellId);
    }

    public clearAllOutput(): void {
        this.cellOutputs.clear();
        this.lastPosition = 0;
        if (fs.existsSync(this.outputFile)) {
            fs.writeFileSync(this.outputFile, '');
        }
    }
}

// Convert cell outputs to VSCode notebook cell output
export function cellOutputsToNotebookOutput(outputs: CellOutput[]): vscode.NotebookCellOutput[] {
    const notebookOutputs: vscode.NotebookCellOutput[] = [];

    for (const output of outputs) {
        switch (output.type) {
            case 'OUTPUT':
            case 'MESSAGE':
            case 'WARNING':
            case 'ERROR':
                // Text output
                const mimeType = output.type === 'ERROR' ? 'application/vnd.code.notebook.stderr' : 'text/plain';
                notebookOutputs.push(new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(output.content, mimeType)
                ]));
                break;

            case 'PLOT':
                // Image output - read the file
                try {
                    const imageData = fs.readFileSync(output.content);
                    notebookOutputs.push(new vscode.NotebookCellOutput([
                        new vscode.NotebookCellOutputItem(imageData, 'image/png')
                    ]));
                } catch (e) {
                    console.error('Failed to read plot file:', output.content, e);
                }
                break;

            case 'HTML':
                // HTML output
                notebookOutputs.push(new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.text(output.content, 'text/html')
                ]));
                break;
        }
    }

    return notebookOutputs;
}
