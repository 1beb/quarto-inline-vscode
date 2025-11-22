import * as vscode from 'vscode';

export class TerminalManager {
    private terminals: Map<string, vscode.Terminal> = new Map();
    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Track terminal disposal
        this.disposables.push(
            vscode.window.onDidCloseTerminal(terminal => {
                // Find and remove closed terminal
                for (const [key, term] of this.terminals.entries()) {
                    if (term === terminal) {
                        this.terminals.delete(key);
                        break;
                    }
                }
            })
        );
    }

    public getOrCreateTerminal(language: string): vscode.Terminal {
        const key = `quarto-${language}`;

        // Return existing terminal if available
        if (this.terminals.has(key)) {
            const terminal = this.terminals.get(key)!;
            return terminal;
        }

        // Create new terminal
        const terminal = vscode.window.createTerminal({
            name: `Quarto ${language.toUpperCase()}`,
            shellPath: this.getShellPath(language)
        });

        this.terminals.set(key, terminal);
        return terminal;
    }

    private getShellPath(language: string): string | undefined {
        switch (language.toLowerCase()) {
            case 'r':
                return 'R';
            case 'python':
                return 'python3';
            default:
                return undefined;
        }
    }

    public dispose(): void {
        for (const terminal of this.terminals.values()) {
            terminal.dispose();
        }
        this.terminals.clear();

        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
