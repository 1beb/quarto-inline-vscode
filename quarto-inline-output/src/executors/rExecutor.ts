import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BaseExecutor, ExecutionResult, CodeChunkExecution } from './baseExecutor';

export class RExecutor extends BaseExecutor {
    private outputDir: string;

    constructor(terminal: vscode.Terminal) {
        super(terminal);
        this.outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quarto-r-'));
    }

    getLanguage(): string {
        return 'r';
    }

    async executeChunk(chunk: CodeChunkExecution): Promise<ExecutionResult> {
        const outputFile = path.join(this.outputDir, `output-${Date.now()}.txt`);
        const instrumentedCode = this.instrumentCodeWithOutput(chunk.code, chunk.options, outputFile);

        console.log('[RExecutor] Output file path:', outputFile);
        console.log('[RExecutor] Instrumented code:', instrumentedCode);

        this.showTerminal();
        this.terminal.sendText(instrumentedCode);

        // Wait for execution to complete
        await this.waitForExecution();

        // Read output file
        const result: ExecutionResult = {};

        console.log('[RExecutor] Checking if output file exists:', fs.existsSync(outputFile));
        if (fs.existsSync(outputFile)) {
            result.textOutput = fs.readFileSync(outputFile, 'utf-8');
            console.log('[RExecutor] Output captured:', result.textOutput);
            // Clean up
            fs.unlinkSync(outputFile);
        } else {
            console.log('[RExecutor] No output file found');
        }

        return result;
    }

    protected instrumentCode(code: string, options?: Record<string, any>): string {
        // This method is required by base class but not used directly
        // The actual instrumentation happens in instrumentCodeWithOutput
        return code;
    }

    private instrumentCodeWithOutput(code: string, options: Record<string, any> | undefined, outputFile: string): string {
        // Escape special characters in path
        const escapedPath = outputFile.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        return `
# Quarto Inline Output Capture
.quarto_output_file <- '${escapedPath}'
.quarto_capture <- file(.quarto_output_file, open = "wt")
sink(.quarto_capture, type = "output")
sink(.quarto_capture, type = "message")
tryCatch({
  .quarto_result <- withVisible({
${code}
  })
  if (.quarto_result$visible) {
    print(.quarto_result$value)
  }
}, error = function(e) {
  cat("Error:", conditionMessage(e), "\\n")
}, finally = {
  sink(type = "message")
  sink(type = "output")
  close(.quarto_capture)
})
rm(.quarto_output_file, .quarto_capture, .quarto_result)
`;
    }

    private async waitForExecution(): Promise<void> {
        // Simple delay - will be improved later
        return new Promise(resolve => setTimeout(resolve, 1000));
    }

    public dispose(): void {
        // Clean up temp directory
        if (fs.existsSync(this.outputDir)) {
            fs.rmSync(this.outputDir, { recursive: true, force: true });
        }
    }
}
