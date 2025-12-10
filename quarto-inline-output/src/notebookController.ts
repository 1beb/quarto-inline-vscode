import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OutputWatcher, cellOutputsToNotebookOutput } from './outputWatcher';

interface YamlOptions {
    echo: boolean;
    message: boolean;
    warning: boolean;
    error: boolean;
}

export class QuartoNotebookController {
    private controller: vscode.NotebookController;
    private outputWatcher: OutputWatcher;
    private terminal: vscode.Terminal | null = null;
    private rSetupSourced: boolean = false;
    private executionOrder: number = 0;

    constructor() {
        this.outputWatcher = new OutputWatcher();

        this.controller = vscode.notebooks.createNotebookController(
            'quarto-notebook-controller',
            'quarto-notebook',
            'Quarto R'
        );

        this.controller.supportedLanguages = ['r'];
        this.controller.supportsExecutionOrder = true;
        this.controller.executeHandler = this.executeCell.bind(this);
    }

    private getOrCreateTerminal(): vscode.Terminal {
        // Look for an existing R terminal
        const existingTerminal = vscode.window.terminals.find(t =>
            t.name.toLowerCase().includes('r') ||
            t.name.toLowerCase().includes('radian')
        );

        if (existingTerminal) {
            this.terminal = existingTerminal;
            return existingTerminal;
        }

        // Create a new terminal if none exists
        if (!this.terminal || this.terminal.exitStatus !== undefined) {
            this.terminal = vscode.window.createTerminal({
                name: 'R',
                shellPath: this.findRPath()
            });
            this.rSetupSourced = false;
        }

        return this.terminal;
    }

    private findRPath(): string {
        // Check VSCode R extension settings first
        const config = vscode.workspace.getConfiguration('r');
        const rTermLinux = config.get<string>('rterm.linux');
        const rTermMac = config.get<string>('rterm.mac');
        const rTermWindows = config.get<string>('rterm.windows');

        // Use platform-appropriate setting
        const platform = process.platform;
        let configuredPath: string | undefined;

        if (platform === 'linux' && rTermLinux) {
            configuredPath = rTermLinux;
        } else if (platform === 'darwin' && rTermMac) {
            configuredPath = rTermMac;
        } else if (platform === 'win32' && rTermWindows) {
            configuredPath = rTermWindows;
        }

        if (configuredPath && fs.existsSync(configuredPath)) {
            return configuredPath;
        }

        // Fallback to common paths
        const possiblePaths = [
            '/usr/bin/R',
            '/usr/local/bin/R',
            '/opt/homebrew/bin/R',
            'R'
        ];

        for (const rPath of possiblePaths) {
            if (rPath === 'R' || fs.existsSync(rPath)) {
                return rPath;
            }
        }

        return 'R';
    }

    private async ensureRSetup(): Promise<void> {
        const terminal = this.getOrCreateTerminal();

        // Check if terminal changed or was closed
        if (this.rSetupSourced && this.terminal?.exitStatus !== undefined) {
            // Terminal was closed, need to re-setup
            this.rSetupSourced = false;
            this.terminal = null;
        }

        // Check if the ready file exists - if not, R setup may have been lost
        const outputDir = this.outputWatcher.getOutputDir();
        const readyFile = path.join(outputDir, 'ready');
        if (this.rSetupSourced && !fs.existsSync(readyFile)) {
            // Ready file missing, need to re-setup
            this.rSetupSourced = false;
        }

        if (this.rSetupSourced) return;

        // Start the output watcher
        this.outputWatcher.start();

        // Write setup code to a temp file (radian breaks on multi-line input)
        const setupCode = `
.quarto_inline <- new.env()
.quarto_inline$output_dir <- "${outputDir.replace(/\\/g, '/')}"
.quarto_inline$output_file <- file.path(.quarto_inline$output_dir, "output.txt")
.quarto_inline$plot_dir <- file.path(.quarto_inline$output_dir, "plots")
dir.create(.quarto_inline$plot_dir, showWarnings = FALSE, recursive = TRUE)
if (file.exists(.quarto_inline$output_file)) file.remove(.quarto_inline$output_file)

.quarto_inline$write_output <- function(type, content, cell_id = "none") {
  cat("###", type, ":", cell_id, "###\\n", sep = "", file = .quarto_inline$output_file, append = TRUE)
  cat(content, "\\n", sep = "", file = .quarto_inline$output_file, append = TRUE)
  cat("###END###\\n", file = .quarto_inline$output_file, append = TRUE)
}

.quarto_inline$current_cell <- "none"

globalCallingHandlers(
  message = function(m) .quarto_inline$write_output("MESSAGE", trimws(conditionMessage(m)), .quarto_inline$current_cell),
  warning = function(w) .quarto_inline$write_output("WARNING", trimws(conditionMessage(w)), .quarto_inline$current_cell)
)

.quarto_eval_cell <- function(code_text, cell_id) {
  .quarto_inline$current_cell <- cell_id
  .quarto_inline$write_output("CELL_START", "", cell_id)
  tryCatch({
    exprs <- parse(text = code_text)
    for (expr in exprs) {
      expr_text <- deparse(expr)
      is_plot <- any(grepl("^(plot|hist|boxplot|barplot|pie|pairs|image|contour|persp|ggplot|geom_)", expr_text))
      if (is_plot) {
        plot_file <- file.path(.quarto_inline$plot_dir, paste0("plot_", cell_id, "_", format(Sys.time(), "%H%M%OS3"), ".png"))
        png(plot_file, width = 800, height = 600, res = 100)
        dev_id <- dev.cur()
        result <- tryCatch({ res <- withVisible(eval(expr, envir = globalenv())); if (inherits(res$value, c("ggplot", "gg"))) print(res$value); res }, finally = { if (dev.cur() == dev_id) dev.off() })
        if (file.exists(plot_file) && file.info(plot_file)$size > 0) .quarto_inline$write_output("PLOT", plot_file, cell_id)
      } else {
        out <- capture.output(result <- withVisible(eval(expr, envir = globalenv())))
        if (length(out) > 0 && any(nzchar(out))) { .quarto_inline$write_output("OUTPUT", paste(out, collapse = "\\n"), cell_id); cat(out, sep = "\\n") }
        if (result$visible && !is.null(result$value)) {
          if (inherits(result$value, "gt_tbl") && requireNamespace("gt", quietly = TRUE)) { .quarto_inline$write_output("HTML", as.character(gt::as_raw_html(result$value)), cell_id); cat("[gt table rendered inline]\\n") }
          else if (inherits(result$value, "htmlwidget") && requireNamespace("htmlwidgets", quietly = TRUE)) { f <- tempfile(fileext = ".html"); htmlwidgets::saveWidget(result$value, f, selfcontained = TRUE); .quarto_inline$write_output("HTML", paste(readLines(f), collapse = "\\n"), cell_id); unlink(f) }
          else if (length(out) == 0) { out2 <- capture.output(print(result$value)); if (length(out2) > 0) { .quarto_inline$write_output("OUTPUT", paste(out2, collapse = "\\n"), cell_id); cat(out2, sep = "\\n") } }
        }
      }
    }
  }, error = function(e) { .quarto_inline$write_output("ERROR", conditionMessage(e), cell_id); cat("Error:", conditionMessage(e), "\\n") })
  .quarto_inline$write_output("CELL_END", "", cell_id)
  .quarto_inline$current_cell <- "none"
}
cat("Quarto Inline ready\\n")
# Signal that setup is complete
cat("ready", file = "${readyFile.replace(/\\/g, '/')}")
`;

        // Write to temp file
        const setupFile = path.join(outputDir, 'quarto_setup.R');
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(setupFile, setupCode);

        // Remove ready file if it exists
        if (fs.existsSync(readyFile)) {
            fs.unlinkSync(readyFile);
        }

        // Show terminal to ensure it's active
        terminal.show(true);

        // Wait for terminal/R to start up (radian needs time)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Source the file
        terminal.sendText(`source("${setupFile.replace(/\\/g, '/')}")`);

        // Wait for ready signal with timeout
        const startTime = Date.now();
        const timeout = 30000; // 30 seconds
        while (!fs.existsSync(readyFile)) {
            if (Date.now() - startTime > timeout) {
                // Log diagnostics
                console.error('Timeout waiting for R setup');
                console.error('Setup file exists:', fs.existsSync(setupFile));
                console.error('Output dir exists:', fs.existsSync(outputDir));
                console.error('Ready file path:', readyFile);

                // Try one more time
                terminal.sendText(`source("${setupFile.replace(/\\/g, '/')}")`);
                await new Promise(resolve => setTimeout(resolve, 5000));

                if (!fs.existsSync(readyFile)) {
                    throw new Error('Timeout waiting for R setup to complete. Make sure R is running in the terminal.');
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.rSetupSourced = true;
        console.log('R setup complete');
    }

    private parseYamlOptions(notebook: vscode.NotebookDocument): YamlOptions {
        const defaultOptions: YamlOptions = {
            echo: true,
            message: true,
            warning: true,
            error: true
        };

        // Find the first markdown cell that might contain YAML front matter
        const firstCell = notebook.getCells().find(c => c.kind === vscode.NotebookCellKind.Markup);
        if (!firstCell) return defaultOptions;

        const content = firstCell.document.getText();

        // Parse YAML front matter
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!yamlMatch) return defaultOptions;

        const yaml = yamlMatch[1];

        // Simple YAML parsing - support both singular and plural forms
        const echoMatch = yaml.match(/echo:\s*(true|false)/i);
        const messageMatch = yaml.match(/messages?:\s*(true|false)/i);
        const warningMatch = yaml.match(/warnings?:\s*(true|false)/i);
        const errorMatch = yaml.match(/errors?:\s*(true|false)/i);

        return {
            echo: echoMatch ? echoMatch[1].toLowerCase() === 'true' : defaultOptions.echo,
            message: messageMatch ? messageMatch[1].toLowerCase() === 'true' : defaultOptions.message,
            warning: warningMatch ? warningMatch[1].toLowerCase() === 'true' : defaultOptions.warning,
            error: errorMatch ? errorMatch[1].toLowerCase() === 'true' : defaultOptions.error
        };
    }

    private async executeCell(
        cells: vscode.NotebookCell[],
        notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController
    ): Promise<void> {
        // Parse YAML options once per execution batch
        const yamlOptions = this.parseYamlOptions(notebook);

        for (const cell of cells) {
            await this.executeSingleCell(cell, notebook, yamlOptions);
        }
    }

    private async executeSingleCell(
        cell: vscode.NotebookCell,
        notebook: vscode.NotebookDocument,
        yamlOptions: YamlOptions
    ): Promise<void> {
        const execution = this.controller.createNotebookCellExecution(cell);
        execution.executionOrder = ++this.executionOrder;
        execution.start(Date.now());
        execution.clearOutput();

        try {
            // Ensure R is set up
            await this.ensureRSetup();

            const terminal = this.getOrCreateTerminal();
            terminal.show(true); // Show terminal, preserve focus

            // Generate unique cell ID
            const cellId = `cell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Clear any previous output for this cell
            this.outputWatcher.clearCellOutput(cellId);

            // Get the code to execute
            const code = cell.document.getText();

            // Escape the code for R string
            const escapedCode = code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

            // Send code to terminal using our eval wrapper
            terminal.sendText(`.quarto_eval_cell("${escapedCode}", "${cellId}")`);

            // Wait for output with timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Execution timeout')), 60000);
            });

            const outputs = await Promise.race([
                this.outputWatcher.waitForCell(cellId, yamlOptions),
                timeoutPromise
            ]);

            // Convert to notebook outputs
            const notebookOutputs = cellOutputsToNotebookOutput(outputs);

            if (notebookOutputs.length > 0) {
                execution.replaceOutput(notebookOutputs);
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
        this.outputWatcher.stop();
        this.controller.dispose();
    }
}
