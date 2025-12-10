# Quarto Inline Output - R Setup Script
# Captures R output while letting it display in terminal

# Create output directory
.quarto_inline <- new.env()
.quarto_inline$output_dir <- file.path(tempdir(), "quarto-inline")
dir.create(.quarto_inline$output_dir, showWarnings = FALSE, recursive = TRUE)

# Output file path
.quarto_inline$output_file <- file.path(.quarto_inline$output_dir, "output.txt")
.quarto_inline$plot_dir <- file.path(.quarto_inline$output_dir, "plots")
dir.create(.quarto_inline$plot_dir, showWarnings = FALSE)

# Clear previous output
if (file.exists(.quarto_inline$output_file)) {
  file.remove(.quarto_inline$output_file)
}

# Helper to write structured output (simple text format)
# Format: ###TYPE:CELL_ID###\nCONTENT\n###END###
.quarto_inline$write_output <- function(type, content, cell_id = "none") {
  cat("###", type, ":", cell_id, "###\n", sep = "", file = .quarto_inline$output_file, append = TRUE)
  cat(content, "\n", sep = "", file = .quarto_inline$output_file, append = TRUE)
  cat("###END###\n", file = .quarto_inline$output_file, append = TRUE)
}

# Current cell tracking
.quarto_inline$current_cell <- "none"

# Install global handlers for messages and warnings
globalCallingHandlers(
  message = function(m) {
    msg <- conditionMessage(m)
    .quarto_inline$write_output("MESSAGE", trimws(msg), .quarto_inline$current_cell)
  },
  warning = function(w) {
    msg <- conditionMessage(w)
    .quarto_inline$write_output("WARNING", trimws(msg), .quarto_inline$current_cell)
  }
)

# Wrapper for cell execution
.quarto_eval_cell <- function(code_text, cell_id) {
  .quarto_inline$current_cell <- cell_id
  .quarto_inline$write_output("CELL_START", "", cell_id)

  tryCatch({
    exprs <- parse(text = code_text)

    for (expr in exprs) {
      # Check if this looks like a plot
      expr_text <- deparse(expr)
      is_plot_code <- any(grepl("^(plot|hist|boxplot|barplot|pie|pairs|image|contour|persp|ggplot|geom_)", expr_text))

      if (is_plot_code) {
        # Capture plot
        plot_file <- file.path(.quarto_inline$plot_dir,
                                paste0("plot_", cell_id, "_", format(Sys.time(), "%H%M%OS3"), ".png"))
        png(plot_file, width = 800, height = 600, res = 100)
        dev_id <- dev.cur()

        result <- tryCatch({
          res <- withVisible(eval(expr, envir = globalenv()))
          if (inherits(res$value, c("ggplot", "gg"))) {
            print(res$value)
          }
          res
        }, finally = {
          if (dev.cur() == dev_id) dev.off()
        })

        if (file.exists(plot_file) && file.info(plot_file)$size > 0) {
          .quarto_inline$write_output("PLOT", plot_file, cell_id)
        }
      } else {
        # Regular evaluation with output capture
        out <- capture.output(result <- withVisible(eval(expr, envir = globalenv())))

        if (length(out) > 0 && any(nzchar(out))) {
          .quarto_inline$write_output("OUTPUT", paste(out, collapse = "\n"), cell_id)
          cat(out, sep = "\n")  # Also show in terminal
        }

        # Auto-print if visible and not already captured
        if (result$visible && !is.null(result$value)) {
          if (inherits(result$value, "gt_tbl")) {
            # GT table - capture HTML
            if (requireNamespace("gt", quietly = TRUE)) {
              html <- as.character(gt::as_raw_html(result$value))
              .quarto_inline$write_output("HTML", html, cell_id)
            }
            print(result$value)  # Text to terminal

          } else if (inherits(result$value, "htmlwidget")) {
            # HTML widget
            if (requireNamespace("htmlwidgets", quietly = TRUE)) {
              html_file <- tempfile(fileext = ".html")
              htmlwidgets::saveWidget(result$value, html_file, selfcontained = TRUE)
              html <- paste(readLines(html_file), collapse = "\n")
              .quarto_inline$write_output("HTML", html, cell_id)
              unlink(html_file)
            }

          } else if (length(out) == 0) {
            # Print result if not already captured
            out2 <- capture.output(print(result$value))
            if (length(out2) > 0) {
              .quarto_inline$write_output("OUTPUT", paste(out2, collapse = "\n"), cell_id)
              cat(out2, sep = "\n")
            }
          }
        }
      }
    }
  }, error = function(e) {
    .quarto_inline$write_output("ERROR", conditionMessage(e), cell_id)
    cat("Error:", conditionMessage(e), "\n")
  })

  .quarto_inline$write_output("CELL_END", "", cell_id)
  .quarto_inline$current_cell <- "none"
}

# Print ready message
cat("Quarto Inline Output ready.\n")
cat("Output directory:", .quarto_inline$output_dir, "\n")
