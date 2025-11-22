# Notebook API Testing Notes

## Overview

This document outlines manual testing procedures for the Quarto Notebook API implementation. The notebook API provides true inline output display for Quarto documents using VSCode's native notebook interface.

## Testing Environment

- **Extension**: Quarto Inline Output (v0.2.0 - Notebook API)
- **VSCode Version**: Latest
- **Test Documents**: `test-documents/01-basic-analysis.qmd`, `test-documents/02-visualization.qmd`, `test-documents/03-summary-stats.qmd`
- **Languages**: R (Python support planned for future)

## Manual Test Procedures

### Test 1: Basic Analysis Document

**Objective**: Verify that `.qmd` files open correctly as notebooks and code execution works.

**Steps**:
1. Launch Extension Development Host (F5)
2. Open `test-documents/01-basic-analysis.qmd`
3. Run command "Quarto: Open as Notebook" (Cmd/Ctrl+Shift+P)
4. Verify document opens in notebook view
5. Verify cells are correctly split (markdown cells and code cells)
6. Run first code cell (click Run button or press Cmd/Ctrl+Enter)
7. Verify output appears inline below the cell
8. Verify terminal shows execution in visible R terminal

**Expected Results**:
- Document opens in notebook interface
- Cells are properly separated based on code chunks
- YAML frontmatter appears in first markdown cell
- Code cells execute successfully
- Output displays inline below executed cells
- R terminal is visible and shows code execution

**Actual Results**:
- [ ] PASS / [ ] FAIL
- Notes: _[To be filled in during manual testing]_

---

### Test 2: Round-Tripping and File Preservation

**Objective**: Verify that notebook edits save correctly and outputs are NOT persisted to the `.qmd` file.

**Steps**:
1. Open `test-documents/01-basic-analysis.qmd` in notebook view
2. Make a small edit to a markdown cell (e.g., add a sentence)
3. Save file (Cmd/Ctrl+S)
4. Run command "Quarto: Open as Text"
5. Verify the markdown edit is preserved in text view
6. Verify code chunks are intact with correct formatting
7. Verify no outputs are saved to the file
8. Run `git diff test-documents/01-basic-analysis.qmd` in terminal
9. Verify only your markdown edit appears in the diff (no output clutter)

**Expected Results**:
- Markdown edits saved correctly
- Code chunks maintain original format: ` ```{r} ... ``` `
- Chunk options preserved (e.g., `echo=FALSE`)
- NO output text saved to file
- Clean git diff showing only intentional edits
- File round-trips without corruption

**Actual Results**:
- [ ] PASS / [ ] FAIL
- Notes: _[To be filled in during manual testing]_

---

### Test 3: Terminal Interaction and Bidirectional Flow

**Objective**: Verify that notebook cells and R terminal share the same session (bidirectional variable flow).

**Steps**:
1. Open `test-documents/01-basic-analysis.qmd` as notebook
2. Run first cell (should create variables in R session, e.g., `x <- 1`)
3. Switch to the R terminal panel
4. Type `ls()` in the terminal to list variables
5. Verify variables from notebook cell exist in the terminal
6. Create a new variable in terminal: `terminal_var <- 999`
7. Add a new code cell in the notebook
8. In the new cell, type: `print(terminal_var)`
9. Run the new cell
10. Verify output shows `999`

**Expected Results**:
- Variables created in notebook cells appear in terminal
- Variables created in terminal appear in notebook cells
- Bidirectional flow confirmed
- Single R session shared between notebook and terminal
- Terminal remains visible during execution

**Actual Results**:
- [ ] PASS / [ ] FAIL
- Notes: _[To be filled in during manual testing]_

---

### Test 4: Error Handling

**Objective**: Verify that errors in code cells are displayed correctly and don't break the notebook.

**Steps**:
1. Open a `.qmd` file as notebook
2. Create a new code cell with invalid R syntax: `x <- )`
3. Run the cell
4. Verify error message appears in cell output
5. Verify cell is marked with an error indicator (red decoration)
6. Create another valid code cell: `y <- 2; print(y)`
7. Run the valid cell
8. Verify the valid cell executes successfully despite previous error

**Expected Results**:
- Error message displayed in cell output
- Error indicator visible on failed cell
- Other cells continue to execute normally
- No crash or extension malfunction

**Actual Results**:
- [ ] PASS / [ ] FAIL
- Notes: _[To be filled in during manual testing]_

---

### Test 5: Multiple Document Types

**Objective**: Verify notebook functionality works across different Quarto document types.

**Test Documents**:
- `test-documents/01-basic-analysis.qmd` - Basic data manipulation
- `test-documents/02-visualization.qmd` - Plots and visualizations
- `test-documents/03-summary-stats.qmd` - Statistical summaries

**Steps** (for each document):
1. Open document as notebook
2. Run all cells sequentially
3. Verify outputs appear correctly
4. Save file and verify round-trip preservation
5. Test terminal interaction

**Expected Results**:
- All document types open correctly
- Cell execution works consistently
- Outputs display appropriately (note: plots may not render in v0.2.0)
- File format preserved on save

**Actual Results**:
- Document 1: [ ] PASS / [ ] FAIL - _[Notes]_
- Document 2: [ ] PASS / [ ] FAIL - _[Notes]_
- Document 3: [ ] PASS / [ ] FAIL - _[Notes]_

---

### Test 6: View Switching Commands

**Objective**: Verify seamless switching between text and notebook views.

**Steps**:
1. Open a `.qmd` file in default text editor
2. Run command "Quarto: Open as Notebook"
3. Verify file reopens in notebook view
4. Make some edits in notebook view
5. Run command "Quarto: Open as Text"
6. Verify file reopens in text editor
7. Verify edits are preserved
8. Switch back to notebook view again
9. Verify state is consistent

**Expected Results**:
- Smooth transition between views
- No data loss during switching
- Edits preserved across view changes
- Commands accessible via Command Palette

**Actual Results**:
- [ ] PASS / [ ] FAIL
- Notes: _[To be filled in during manual testing]_

---

### Test 7: Chunk Options Preservation

**Objective**: Verify that chunk options (e.g., `echo=FALSE`, `warning=FALSE`) are preserved during editing.

**Steps**:
1. Create or open a `.qmd` file with chunk options:
   ```
   ```{r echo=FALSE, warning=FALSE}
   x <- 1
   ```
   ```
2. Open as notebook
3. Run the cell
4. Save file
5. Open as text
6. Verify chunk options are intact in the code fence

**Expected Results**:
- Chunk options preserved in cell metadata
- Options restored correctly on serialization
- Format: ` ```{r echo=FALSE, warning=FALSE} `

**Actual Results**:
- [ ] PASS / [ ] FAIL
- Notes: _[To be filled in during manual testing]_

---

## Known Issues

### Current Limitations (v0.2.0)
- **Plot Output**: Graphical output not yet supported (text output only)
- **Python Support**: Only R language currently supported
- **Chunk Options UI**: Options must be edited in text view (no UI in notebook view)
- **Output Types**: Limited to text output (NotebookCellOutputItem.text)

### Bugs Found During Testing
_[To be filled in during manual testing]_

---

## Testing Checklist Summary

- [ ] Test 1: Basic Analysis Document
- [ ] Test 2: Round-Tripping and File Preservation
- [ ] Test 3: Terminal Interaction
- [ ] Test 4: Error Handling
- [ ] Test 5: Multiple Document Types
- [ ] Test 6: View Switching Commands
- [ ] Test 7: Chunk Options Preservation

---

## Future Improvements

Based on testing, the following enhancements are planned:

1. **Plot Support**: Add custom notebook renderers for R plots
2. **Python Support**: Extend NotebookController to support Python code chunks
3. **Chunk Options UI**: Add UI controls for editing chunk options in notebook view
4. **Rich Output**: Support HTML, images, and other MIME types
5. **Performance**: Optimize serialization for large documents
6. **Keyboard Shortcuts**: Add dedicated shortcuts for common operations

---

## Test Results Summary

**Testing Date**: 2025-11-22

**Tester**: Automated testing completed for Tasks 8 & 9

**Overall Status**:
- [x] All automated tests passed (8/8)
- [ ] Some tests failed (see notes above)
- [ ] Testing blocked (specify reason)

**Recommendation**:
- [x] Ready for manual testing
- [ ] Needs fixes before release
- [ ] Requires additional testing

**Additional Notes**:
- Clean build completed successfully (v0.2.0)
- All TypeScript compilation passed with no errors
- ESLint passed with no warnings
- All 8 automated tests passing:
  - 4 NotebookSerializer tests
  - 1 Extension test
  - 3 ChunkParser tests
- Documentation updated to reflect Notebook API implementation
- Manual testing procedures documented above for future validation

---

## Automated Test Coverage

While this document covers manual testing, the following automated tests exist:

- `src/test/notebookSerializer.test.ts`: Serialization/deserialization tests
  - ✅ Deserialize simple `.qmd` with one code chunk
  - ✅ Round-trip preserves exact formatting
  - ✅ Round-trip with file that does not end with newline
  - ✅ Preserves chunk options in round-trip
- `src/test/extension.test.ts`: Basic extension tests
  - ✅ Sample test (extension activation)
- `src/test/chunkParser.test.ts`: Chunk parsing tests
  - ✅ Parse single R chunk
  - ✅ Parse multiple chunks
  - ✅ Return empty array for no chunks

**Automated Test Status** (as of 2025-11-22):
- ✅ All 8 tests passing
- ✅ Clean build successful
- ✅ No compilation errors
- ✅ No linting errors
- Ready for manual testing and further development

---

## References

- Implementation Plan: `docs/plans/2025-11-22-notebook-api-implementation.md`
- Architecture: `docs/ARCHITECTURE.md`
- VSCode Notebook API: https://code.visualstudio.com/api/extension-guides/notebook
