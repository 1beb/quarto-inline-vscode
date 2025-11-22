export interface CodeChunk {
    language: string;
    code: string;
    startLine: number;
    endLine: number;
    options?: Record<string, any>;
}

export function parseChunks(content: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');

    let inChunk = false;
    let currentChunk: Partial<CodeChunk> | null = null;
    let chunkLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match chunk start: ```{language}
        const startMatch = line.match(/^```\{(\w+)(?:\s+(.+))?\}/);
        if (startMatch && !inChunk) {
            inChunk = true;
            currentChunk = {
                language: startMatch[1],
                startLine: i,
                options: parseChunkOptions(startMatch[2])
            };
            chunkLines = [];
            continue;
        }

        // Match chunk end: ```
        if (line.trim() === '```' && inChunk && currentChunk) {
            currentChunk.code = chunkLines.join('\n');
            currentChunk.endLine = i;
            chunks.push(currentChunk as CodeChunk);
            inChunk = false;
            currentChunk = null;
            chunkLines = [];
            continue;
        }

        // Collect chunk content
        if (inChunk) {
            chunkLines.push(line);
        }
    }

    return chunks;
}

function parseChunkOptions(optionsString?: string): Record<string, any> {
    if (!optionsString) {
        return {};
    }

    // Basic option parsing - can be enhanced later
    const options: Record<string, any> = {};
    const pairs = optionsString.split(',');

    for (const pair of pairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (key && value) {
            options[key] = value;
        }
    }

    return options;
}
