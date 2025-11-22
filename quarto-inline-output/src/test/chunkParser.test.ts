import * as assert from 'assert';
import { parseChunks, CodeChunk } from '../chunkParser';

suite('ChunkParser Test Suite', () => {
    test('should parse single R chunk', () => {
        const content = `# Test document
\`\`\`{r}
x <- 1 + 1
print(x)
\`\`\`
`;
        const chunks = parseChunks(content);
        assert.strictEqual(chunks.length, 1);
        assert.strictEqual(chunks[0].language, 'r');
        assert.strictEqual(chunks[0].code, 'x <- 1 + 1\nprint(x)');
        assert.strictEqual(chunks[0].startLine, 1);
        assert.strictEqual(chunks[0].endLine, 4);
    });

    test('should parse multiple chunks', () => {
        const content = `\`\`\`{r}
x <- 1
\`\`\`

Some text

\`\`\`{python}
y = 2
\`\`\`
`;
        const chunks = parseChunks(content);
        assert.strictEqual(chunks.length, 2);
        assert.strictEqual(chunks[0].language, 'r');
        assert.strictEqual(chunks[1].language, 'python');
    });

    test('should return empty array for no chunks', () => {
        const content = 'Just some text with no code chunks';
        const chunks = parseChunks(content);
        assert.strictEqual(chunks.length, 0);
    });
});
