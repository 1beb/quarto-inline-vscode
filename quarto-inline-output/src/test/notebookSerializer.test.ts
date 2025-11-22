import * as assert from 'assert';
import { QuartoNotebookSerializer } from '../notebookSerializer';
import * as vscode from 'vscode';

suite('QuartoNotebookSerializer', () => {
    let serializer: QuartoNotebookSerializer;

    setup(() => {
        serializer = new QuartoNotebookSerializer();
    });

    test('deserialize simple qmd with one code chunk', async () => {
        const qmdContent = `---
title: "Test"
---

# Heading

Some text.

\`\`\`{r}
head(mtcars)
\`\`\`

More text.`;

        const data = Buffer.from(qmdContent, 'utf-8');
        const token = new vscode.CancellationTokenSource().token;

        const notebook = await serializer.deserializeNotebook(data, token);

        assert.strictEqual(notebook.cells.length, 3);
        assert.strictEqual(notebook.cells[0].kind, vscode.NotebookCellKind.Markup);
        assert.strictEqual(notebook.cells[1].kind, vscode.NotebookCellKind.Code);
        assert.strictEqual(notebook.cells[2].kind, vscode.NotebookCellKind.Markup);
        assert.ok(notebook.cells[0].value.includes('title: "Test"'));
        assert.strictEqual(notebook.cells[1].value, 'head(mtcars)');
        assert.strictEqual(notebook.cells[1].languageId, 'r');
    });

    test('round-trip preserves exact formatting', async () => {
        const qmdContent = `---
title: "Test"
---

# Introduction

Some text here.

\`\`\`{r}
x <- 1
y <- 2
\`\`\`

More text.

\`\`\`{r}
summary(mtcars)
\`\`\`

# Conclusion

Final thoughts.`;

        const data = Buffer.from(qmdContent, 'utf-8');
        const token = new vscode.CancellationTokenSource().token;

        const notebook = await serializer.deserializeNotebook(data, token);
        const serialized = await serializer.serializeNotebook(notebook, token);
        const result = Buffer.from(serialized).toString('utf-8');

        assert.strictEqual(result, qmdContent);
    });

    test('round-trip with file that does not end with newline', async () => {
        // This test case has no trailing newline at the end
        const qmdContent = `# Title

\`\`\`{r}
x <- 1
\`\`\`

Text without trailing newline`;

        const data = Buffer.from(qmdContent, 'utf-8');
        const token = new vscode.CancellationTokenSource().token;

        const notebook = await serializer.deserializeNotebook(data, token);
        const serialized = await serializer.serializeNotebook(notebook, token);
        const result = Buffer.from(serialized).toString('utf-8');

        assert.strictEqual(result, qmdContent);
    });

    test('preserves chunk options in round-trip', async () => {
        const qmdContent = `\`\`\`{r echo=FALSE, warning=FALSE}
x <- 1
\`\`\``;

        const data = Buffer.from(qmdContent, 'utf-8');
        const token = new vscode.CancellationTokenSource().token;

        const notebook = await serializer.deserializeNotebook(data, token);
        const serialized = await serializer.serializeNotebook(notebook, token);
        const result = Buffer.from(serialized).toString('utf-8');

        assert.ok(result.includes('echo=FALSE'));
        assert.ok(result.includes('warning=FALSE'));
    });
});
