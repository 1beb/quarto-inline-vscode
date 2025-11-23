import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

export interface OutputData {
    type: 'text' | 'html' | 'image' | 'error';
    content: string;
    mimeType?: string;
}

/**
 * Simple Pseudoterminal implementation without node-pty
 * Uses Node.js child_process to spawn R and capture output
 */
export class RPseudoterminalSimple implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<void>();
    private rProcess: child_process.ChildProcess | undefined;
    private outputBuffer: string = '';
    private isExecuting: boolean = false;
    private commandMarker = '.quarto_exec_id_';
    private endMarker = '_complete';
    private htmlStartMarker = '###QUARTO_HTML_START###';
    private htmlEndMarker = '###QUARTO_HTML_END###';
    private pendingResolve: ((outputs: OutputData[]) => void) | undefined;
    private currentOutputs: OutputData[] = [];
    private isReady: boolean = false;
    private readyPromise: Promise<void>;
    private readyResolve: (() => void) | undefined;

    onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    onDidClose: vscode.Event<void> = this.closeEmitter.event;

    constructor(private workspaceFolder?: string) {
        this.readyPromise = new Promise((resolve) => {
            this.readyResolve = resolve;
        });
    }

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        // Spawn R process in interactive mode
        this.rProcess = child_process.spawn('R', ['--no-save', '--no-restore', '--interactive'], {
            cwd: this.workspaceFolder || process.env.HOME,
            env: process.env as { [key: string]: string },
            shell: false
        });

        // Handle stdout
        this.rProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();

            // Clean text for terminal display
            let cleanText = text
                // Remove ANSI escape sequences and control characters
                .replace(/\x1b\[[^\x1b]*?m/g, '')
                .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
                .replace(/\x1b\][^\x07]*\x07/g, '')
                // Remove leading whitespace from every line
                .replace(/^[ \t]+/gm, '')
                // Convert line endings to \r\n for proper terminal display
                .replace(/\r?\n/g, '\r\n');

            // Display to terminal
            this.writeEmitter.fire(cleanText);

            // Capture output for processing if executing
            if (this.isExecuting) {
                this.outputBuffer += text;
                this.checkForCommandEnd();
            }
        });

        // Handle stderr
        this.rProcess.stderr?.on('data', (data: Buffer) => {
            const text = data.toString();

            // Clean text for terminal display
            let cleanText = text
                .replace(/\x1b\[[^\x1b]*?m/g, '')
                .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
                .replace(/\x1b\][^\x07]*\x07/g, '')
                .replace(/^[ \t]+/gm, '')
                .replace(/\r?\n/g, '\r\n');

            this.writeEmitter.fire(cleanText);

            if (this.isExecuting) {
                this.outputBuffer += text;
            }
        });

        // Handle process exit
        this.rProcess.on('exit', () => {
            this.closeEmitter.fire();
        });

        // Set up R environment
        this.setupREnvironment();
    }

    private setupREnvironment(): void {
        // Create setup script
        const setupScript = `
options(width=10000)
options(max.print=10000)
options(scipen=999)

.quarto_plot_dir <- tempdir()

.quarto_capture_plots <- function(code_expr) {
    plot_file <- file.path(.quarto_plot_dir, paste0("plot_", format(Sys.time(), "%Y%m%d_%H%M%OS3"), ".png"))
    png(plot_file, width = 800, height = 600, res = 100)
    dev_id <- dev.cur()
    tryCatch({
        result <- eval(code_expr)
        # Explicitly print the result to render ggplot objects
        if (!is.null(result)) {
            print(result)
        }
        if (dev.cur() == dev_id) {
            dev.off()
            if (file.exists(plot_file) && file.info(plot_file)$size > 0) {
                cat("###QUARTO_PLOT###", plot_file, "###END_PLOT###\\n", sep="")
            }
        }
    }, error = function(e) {
        if (dev.cur() == dev_id) dev.off()
        stop(e)
    })
}

.quarto_capture_html <- function(expr) {
    result <- tryCatch(eval(expr), error = function(e) e)
    if (inherits(result, "error")) {
        cat("Error: ", conditionMessage(result), "\\n", sep="")
    } else if (inherits(result, "gt_tbl")) {
        if (!requireNamespace("gt", quietly = TRUE)) {
            print(result)
        } else {
            tryCatch({
                html_content <- as.character(gt::as_raw_html(result))
                cat("###QUARTO_HTML_START###\\n")
                cat(html_content)
                cat("\\n###QUARTO_HTML_END###\\n")
            }, error = function(e) {
                cat("Error rendering gt table: ", conditionMessage(e), "\\n", sep="")
                print(result)
            })
        }
    } else if (inherits(result, "htmlwidget")) {
        if (!requireNamespace("htmlwidgets", quietly = TRUE)) {
            print(result)
        } else {
            tryCatch({
                temp_file <- tempfile(fileext = ".html")
                htmlwidgets::saveWidget(result, temp_file, selfcontained = TRUE)
                html_content <- readLines(temp_file)
                cat("###QUARTO_HTML_START###\\n")
                cat(html_content, sep = "\\n")
                cat("\\n###QUARTO_HTML_END###\\n")
                unlink(temp_file)
            }, error = function(e) {
                cat("Error rendering htmlwidget: ", conditionMessage(e), "\\n", sep="")
                print(result)
            })
        }
    } else {
        print(result)
    }
    invisible(result)
}
`;

        // Write to temp file
        const setupFile = path.join(os.tmpdir(), 'quarto_setup.R');
        fs.writeFileSync(setupFile, setupScript);

        // Execute silently
        if (this.rProcess?.stdin) {
            this.rProcess.stdin.write(`source("${setupFile.replace(/\\/g, '/')}", echo = FALSE)\n`);
        }

        // Mark ready after delay - give R time to load setup
        setTimeout(() => {
            this.isReady = true;
            if (this.readyResolve) {
                this.readyResolve();
            }
            // Clean up setup file after R has loaded it
            setTimeout(() => {
                if (fs.existsSync(setupFile)) {
                    fs.unlinkSync(setupFile);
                }
            }, 2000);
        }, 1500);
    }

    close(): void {
        this.rProcess?.kill();
    }

    handleInput(data: string): void {
        // Pass user input to R process only if we're not executing
        if (this.rProcess?.stdin && !this.isExecuting) {
            this.rProcess.stdin.write(data);
        }
    }

    setDimensions(dimensions: vscode.TerminalDimensions): void {
        // Terminal dimensions don't affect child process
    }

    public async executeCode(code: string): Promise<OutputData[]> {
        // Wait for R to be ready
        await this.readyPromise;

        return new Promise((resolve) => {
            this.currentOutputs = [];
            this.outputBuffer = '';
            this.pendingResolve = resolve;

            // Start capturing output
            this.isExecuting = true;

            // Check if we need HTML wrapper
            const needsHtmlWrapper = code.includes('gt()') ||
                                    code.includes('htmlwidgets') ||
                                    code.includes('plotly') ||
                                    code.includes('DT::datatable');

            // Check if code creates plots
            const needsPlotWrapper = code.includes('plot(') ||
                                    code.includes('ggplot(') ||
                                    code.includes('hist(') ||
                                    code.includes('boxplot(') ||
                                    code.includes('barplot(') ||
                                    code.includes('scatter');

            if (this.rProcess?.stdin) {
                // Create unique execution ID
                const execId = Date.now().toString();
                const startMarker = this.commandMarker + execId;
                const endMarker = startMarker + this.endMarker;

                // Send invisible start marker (variable assignment produces no output)
                this.rProcess.stdin.write(`${startMarker} <- TRUE\n`);

                // Send the actual user code directly (no temp file)
                if (needsPlotWrapper) {
                    this.rProcess.stdin.write(`.quarto_capture_plots(expression({\n${code}\n}))\n`);
                } else if (needsHtmlWrapper) {
                    this.rProcess.stdin.write(`.quarto_capture_html(expression({\n${code}\n}))\n`);
                } else {
                    // Send code directly - R will auto-print last value in interactive mode
                    this.rProcess.stdin.write(`${code}\n`);
                }

                // Send invisible end marker
                this.rProcess.stdin.write(`${endMarker} <- TRUE\n`);

                // Store the end marker we're looking for
                (this as any).currentEndMarker = endMarker;
            }

            setTimeout(() => {
                this.finishExecution();
            }, 3000);
        });
    }

    private checkForCommandEnd(): void {
        // Look for the end marker assignment in the output (e.g., "> .quarto_exec_id_123_complete <- TRUE")
        const endMarker = (this as any).currentEndMarker;
        if (endMarker && this.outputBuffer.includes(endMarker)) {
            this.finishExecution();
        }
    }

    private finishExecution(): void {
        if (!this.isExecuting) return;

        this.isExecuting = false;
        this.parseOutputBuffer();

        if (this.pendingResolve) {
            this.pendingResolve(this.currentOutputs);
            this.pendingResolve = undefined;
        }
    }

    private parseOutputBuffer(): void {
        let buffer = this.outputBuffer;

        // Remove marker variable assignments (e.g., "> .quarto_exec_id_123 <- TRUE")
        buffer = buffer.replace(/>\s*\.quarto_exec_id_\d+(_complete)?\s*<-\s*TRUE\s*\n?/g, '');

        // Remove wrapper function calls for plots/html
        buffer = buffer.replace(/>\s*\.quarto_capture_(plots|html)\(expression\(\{\s*\n?/g, '');
        buffer = buffer.replace(/>\s*\+\s*\}\)\)\s*\n?/g, '');

        // Filter output: keep ONLY output lines, remove all code/prompt lines
        // Code is already visible in the cell, we only want the output inline
        const lines = buffer.split('\n');
        const outputLines: string[] = [];

        for (const line of lines) {
            // Skip marker lines (with or without prompt)
            if (line.match(/\.quarto_exec_id_\d+(_complete)?\s*<-\s*TRUE/)) {
                continue;
            }
            // Skip all lines that start with R prompts (these are code being echoed)
            if (line.startsWith('> ') || line.startsWith('+ ') || line.match(/^>\s*$/)) {
                continue;
            }
            // Keep everything else (actual output)
            if (line.trim().length > 0) {
                outputLines.push(line);
            }
        }

        buffer = outputLines.join('\n').trim();

        // Check for plot files
        const plotRegex = /###QUARTO_PLOT###([^#]+)###END_PLOT###/g;
        let plotMatch;

        while ((plotMatch = plotRegex.exec(buffer)) !== null) {
            const plotPath = plotMatch[1].trim();
            if (fs.existsSync(plotPath)) {
                try {
                    const imageData = fs.readFileSync(plotPath);
                    const base64Image = imageData.toString('base64');
                    this.currentOutputs.push({
                        type: 'image',
                        content: base64Image,
                        mimeType: 'image/png'
                    });
                    fs.unlinkSync(plotPath);
                } catch (err) {
                    console.error('Failed to read plot file:', err);
                }
            }
            buffer = buffer.replace(plotMatch[0], '');
        }

        // Check for HTML content
        const htmlRegex = new RegExp(`${this.htmlStartMarker}([\\s\\S]*?)${this.htmlEndMarker}`, 'g');
        let htmlMatch;

        while ((htmlMatch = htmlRegex.exec(buffer)) !== null) {
            this.currentOutputs.push({
                type: 'html',
                content: htmlMatch[1].trim(),
                mimeType: 'text/html'
            });
            buffer = buffer.replace(htmlMatch[0], '');
        }

        // Process remaining text
        buffer = buffer.trim();

        if (buffer.length > 0) {
            if (buffer.includes('Error:') || buffer.includes('Error in')) {
                this.currentOutputs.push({
                    type: 'error',
                    content: buffer
                });
            } else {
                const lines = buffer.split('\n');
                const cleanedLines = lines.filter(line => {
                    return line !== '>' && line !== '+' && line.trim().length > 0;
                });

                if (cleanedLines.length > 0) {
                    this.currentOutputs.push({
                        type: 'text',
                        content: cleanedLines.join('\n')
                    });
                }
            }
        }

        this.outputBuffer = '';
    }
}