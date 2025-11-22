# Architecture & Technical Decisions

## Current Implementation (v0.1.0)

### What Works
- ✅ Chunk parsing for R and Python code blocks
- ✅ Code lens "▶ Display" buttons above chunks
- ✅ R code execution in visible terminal with persistent state
- ✅ R output capture using `withVisible()` and `sink()`
- ✅ Terminal management (one per language per workspace)

### Key Discovery: VSCode Decorations API Limitations

**Problem**: The VSCode `TextEditorDecorationType` API with `after.contentText` **does not support multi-line inline content**.

**What we tried**:
```typescript
renderOptions: {
    after: {
        contentText: '┌─ Output ─────\n│ line 1\n│ line 2\n└──────────────',
        // This doesn't render multi-line content properly
    }
}
```

**Result**: Only single-line text appears inline. Multi-line content is truncated or not displayed.

**Current Workaround**:
- Display summary inline: `📋 Output (6 lines)`
- Full output shown on hover as markdown code block
- This is functional but not the ideal UX

### Why This Matters

The original goal was "inline output like Jupyter notebooks" where:
- Multiple lines of console output appear directly below code chunks
- Plots render inline at full size
- Output is visible without hovering

The Decorations API cannot achieve this.

## Alternative Approaches

### Option 1: VSCode Notebook API ⭐ Recommended
**Pros**:
- True inline multi-line output
- Rich output support (plots, tables, HTML)
- Familiar Jupyter-like UX
- Built-in cell execution UI

**Cons**:
- Requires treating `.qmd` as notebook format
- More complex implementation
- May conflict with text-based `.qmd` editing

**Implementation**:
- Register a `NotebookSerializer` for `.qmd` files
- Parse Quarto chunks into notebook cells
- Use built-in notebook renderer for output
- Similar to how Jupyter extension works

**Example**: See VSCode's Jupyter extension

### Option 2: WebView Panel
**Pros**:
- Full control over rendering
- Can display HTML, plots, tables
- Side-by-side layout familiar to users

**Cons**:
- Output not "inline" with code
- Requires managing WebView lifecycle
- More resource intensive

**Implementation**:
- Create WebView panel that opens alongside editor
- Send output to panel after chunk execution
- Scroll panel to match editor position

**Example**: Similar to R extension's plot viewer

### Option 3: Virtual Text / Inline Values API
**Pros**:
- Can insert text that looks inline
- Less invasive than full notebook

**Cons**:
- Still has limitations on formatting
- May not support all output types
- Experimental API

### Option 4: Text Insertion (Commented Output)
**Pros**:
- Simple implementation
- Actually modifies document with output

**Cons**:
- Pollutes document with output comments
- Requires cleanup mechanism
- Conflicts with version control

**Implementation**:
```
```{r}
x <- head(mtcars)
```
<!-- Output:
     mpg cyl disp  hp
1   21.0   6  160 110
2   21.0   6  160 110
-->
```

## Recommendation

For achieving the goal of "Jupyter-like inline output in Quarto", **Option 1 (Notebook API)** is the proper solution.

**Phase 1 (Current MVP)**:
- Keep current hover-based approach for basic functionality
- Add plot support using hover/WebView
- Useful for quick output inspection

**Phase 2 (Full Solution)**:
- Implement NotebookSerializer for `.qmd` files
- Register custom notebook renderer
- Provide toggle between text mode and notebook mode
- This is how you get true inline output

## Technical Notes

### R Output Capture
Using `withVisible()` to properly capture expression results:
```r
.quarto_result <- withVisible({
  # user code here
})
if (.quarto_result$visible) {
  print(.quarto_result$value)
}
```

This ensures expressions like `head(mtcars)` get printed to the output file, not just explicit `print()` calls.

### Why Quarto Visual Mode Doesn't Help
Quarto's visual mode is for **markdown editing**, not for inline code execution. It provides WYSIWYG markdown formatting but doesn't solve the code output display problem.

## Next Steps

1. **Short term**: Add plot support to current hover-based implementation
2. **Medium term**: Explore Notebook API implementation
3. **Long term**: Contribute back to Quarto extension or create standalone notebook provider

## References

- [VSCode Text Editor Decoration API](https://code.visualstudio.com/api/references/vscode-api#TextEditorDecorationType)
- [VSCode Notebook API](https://code.visualstudio.com/api/extension-guides/notebook)
- [Jupyter Extension Source](https://github.com/microsoft/vscode-jupyter)
- [Quarto VSCode Extension](https://github.com/quarto-dev/quarto)
