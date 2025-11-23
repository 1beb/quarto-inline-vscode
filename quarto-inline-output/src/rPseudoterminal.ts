import * as vscode from 'vscode';
import * as pty from 'node-pty';
import * as os from 'os';

export interface OutputData {
    type: 'text' | 'html' | 'image' | 'error';
    content: string;
    mimeType?: string;
}

export class RPseudoterminal implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<void>();
    private ptyProcess: pty.IPty | undefined;
    private outputBuffer: string = '';
    private outputCallback: ((data: OutputData) => void) | undefined;
    private isExecuting: boolean = false;
    private commandMarker = '###QUARTO_COMMAND_START###';
    private endMarker = '###QUARTO_COMMAND_END###';

    onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    onDidClose: vscode.Event<void> = this.closeEmitter.event;

    constructor(private workspaceFolder?: string) {}

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        // Spawn R process using node-pty
        const shell = 'R';
        const args = ['--no-save', '--quiet'];

        this.ptyProcess = pty.spawn(shell, args, {
            name: 'xterm-color',
            cols: initialDimensions?.columns || 80,
            rows: initialDimensions?.rows || 30,
            cwd: this.workspaceFolder || process.env.HOME,
            env: process.env as { [key: string]: string }
        });

        // Listen to data from pty process
        this.ptyProcess.onData((data: string) => {
            // Write to terminal display (visible to user)
            this.writeEmitter.fire(data);

            // Capture output for processing if executing a command
            if (this.isExecuting) {
                this.outputBuffer += data;
                this.checkForCommandEnd();
            }
        });

        this.ptyProcess.onExit(() => {
            this.closeEmitter.fire();
        });

        // Set up R environment for better output capture
        this.setupREnvironment();
    }

    private setupREnvironment(): void {
        // Configure R for better output handling
        const setupCommands = [
            // Set options for consistent output
            'options(width=10000)',  // Prevent line wrapping
            'options(max.print=10000)',  // More output
            'options(scipen=999)',  // Avoid scientific notation

            // Define helper functions for output capture
            `.quarto_capture_html <- function(expr) {
                result <- eval(expr)
                # Check if result has an HTML representation
                if (inherits(result, "gt_tbl")) {
                    # gt table - export as HTML
                    html_content <- as.character(gt::as_raw_html(result))
                    cat("###QUARTO_HTML_START###\\n")
                    cat(html_content)
                    cat("\\n###QUARTO_HTML_END###\\n")
                } else if (inherits(result, "htmlwidget")) {
                    # htmlwidget - export as HTML
                    temp_file <- tempfile(fileext = ".html")
                    htmlwidgets::saveWidget(result, temp_file, selfcontained = TRUE)
                    html_content <- readLines(temp_file)
                    cat("###QUARTO_HTML_START###\\n")
                    cat(html_content, sep = "\\n")
                    cat("\\n###QUARTO_HTML_END###\\n")
                    unlink(temp_file)
                } else {
                    # Regular output
                    print(result)
                }
                invisible(result)
            }`,
            ''  // Empty line to execute
        ];

        // Send setup commands silently
        setupCommands.forEach(cmd => {
            if (this.ptyProcess) {
                this.ptyProcess.write(cmd + '\n');
            }
        });
    }

    close(): void {
        this.ptyProcess?.kill();
    }

    handleInput(data: string): void {
        // This is called when user types in the terminal
        // Just pass through to the pty process
        if (this.ptyProcess) {
            this.ptyProcess.write(data);
        }
    }

    setDimensions(dimensions: vscode.TerminalDimensions): void {
        this.ptyProcess?.resize(dimensions.columns, dimensions.rows);
    }

    /**
     * Execute code and capture output
     * This is our main API for running code chunks
     */
    public async executeCode(code: string): Promise<OutputData[]> {
        return new Promise((resolve) => {
            const outputs: OutputData[] = [];

            // Set up output collection
            this.outputBuffer = '';
            this.isExecuting = true;

            // Create a callback to collect outputs
            this.outputCallback = (data: OutputData) => {
                outputs.push(data);
            };

            // Check if we need to wrap for HTML output detection
            const needsHtmlWrapper = code.includes('gt()') ||
                                    code.includes('htmlwidgets') ||
                                    code.includes('plotly') ||
                                    code.includes('DT::datatable');

            // Send the code with markers
            if (this.ptyProcess) {
                // Start marker (invisible to user due to how R processes it)
                this.ptyProcess.write(`cat("${this.commandMarker}\\n")\n`);

                if (needsHtmlWrapper) {
                    // Wrap in HTML capture function
                    this.ptyProcess.write(`.quarto_capture_html(expression({\n${code}\n}))\n`);
                } else {
                    // Send code directly
                    this.ptyProcess.write(code + '\n');
                }

                // End marker
                this.ptyProcess.write(`cat("${this.endMarker}\\n")\n`);
            }

            // Set up timeout and resolution
            const timeout = setTimeout(() => {
                this.isExecuting = false;
                this.parseOutputBuffer(outputs);
                resolve(outputs);
            }, 2000); // 2 second timeout

            // Store resolver for use in checkForCommandEnd
            (this as any).currentResolver = () => {
                clearTimeout(timeout);
                this.isExecuting = false;
                this.parseOutputBuffer(outputs);
                resolve(outputs);
            };
        });
    }

    private checkForCommandEnd(): void {
        if (this.outputBuffer.includes(this.endMarker)) {
            // Command finished, process the output
            if ((this as any).currentResolver) {
                (this as any).currentResolver();
            }
        }
    }

    private parseOutputBuffer(outputs: OutputData[]): void {
        // Remove markers from buffer
        let buffer = this.outputBuffer
            .replace(this.commandMarker, '')
            .replace(this.endMarker, '')
            .trim();

        // Check for HTML content
        const htmlMatch = buffer.match(/###QUARTO_HTML_START###\n([\s\S]*?)\n###QUARTO_HTML_END###/);
        if (htmlMatch) {
            outputs.push({
                type: 'html',
                content: htmlMatch[1],
                mimeType: 'text/html'
            });
            // Remove HTML from buffer
            buffer = buffer.replace(htmlMatch[0], '').trim();
        }

        // Check for error patterns
        if (buffer.includes('Error:') || buffer.includes('Error in')) {
            outputs.push({
                type: 'error',
                content: buffer
            });
        } else if (buffer.length > 0) {
            // Regular text output
            // Clean up R prompt artifacts
            const cleanedBuffer = buffer
                .split('\n')
                .filter(line => !line.startsWith('>') && !line.startsWith('+'))
                .join('\n')
                .trim();

            if (cleanedBuffer.length > 0) {
                outputs.push({
                    type: 'text',
                    content: cleanedBuffer
                });
            }
        }

        // Clear the buffer
        this.outputBuffer = '';
    }
}