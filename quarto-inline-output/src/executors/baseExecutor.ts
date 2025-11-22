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
