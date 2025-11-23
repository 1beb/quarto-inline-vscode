import * as vscode from 'vscode';
import { RPseudoterminalSimple } from './rPseudoterminalSimple';

export class PseudoterminalManager {
    private pseudoterminals: Map<string, RPseudoterminalSimple> = new Map();
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
                        const pty = this.pseudoterminals.get(key);
                        if (pty) {
                            pty.close();
                            this.pseudoterminals.delete(key);
                        }
                        break;
                    }
                }
            })
        );
    }

    public getOrCreatePseudoterminal(language: string, workspaceFolder?: string): { terminal: vscode.Terminal, pty: RPseudoterminalSimple } {
        const key = `quarto-${language}`;

        // Return existing terminal and pty if available
        if (this.terminals.has(key) && this.pseudoterminals.has(key)) {
            return {
                terminal: this.terminals.get(key)!,
                pty: this.pseudoterminals.get(key)!
            };
        }

        // Create new pseudoterminal based on language
        let pty: RPseudoterminalSimple;

        switch (language.toLowerCase()) {
            case 'r':
                pty = new RPseudoterminalSimple(workspaceFolder);
                break;
            default:
                throw new Error(`Language ${language} not yet supported`);
        }

        // Create VSCode terminal with the pseudoterminal
        const terminal = vscode.window.createTerminal({
            name: `Quarto ${language.toUpperCase()}`,
            pty: pty
        });

        // Store references
        this.pseudoterminals.set(key, pty);
        this.terminals.set(key, terminal);

        return { terminal, pty };
    }

    public dispose(): void {
        // Close all pseudoterminals
        for (const pty of this.pseudoterminals.values()) {
            pty.close();
        }
        this.pseudoterminals.clear();

        // Dispose all terminals
        for (const terminal of this.terminals.values()) {
            terminal.dispose();
        }
        this.terminals.clear();

        // Dispose event listeners
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}