# Lab 5 — Stream a large CSV to JSON with bounded memory

## Requirements
- Node.js 18 or newer
- No third-party npm packages required

## 1. Generate test inputs
```bash
node make-csv.mjs 50 input-50mb.csv
node make-csv.mjs 500 input-500mb.csv
```

The generator writes incrementally and respects backpressure. It may create a file slightly larger than the requested size because it finishes the final row.

## 2. Convert CSV to JSON
```bash
node index.mjs input-50mb.csv output-50mb.json
node index.mjs input-500mb.csv output-500mb.json
```

## 3. Record measurements
Run each conversion separately and record the console output:

| Metric | 50 MB input | 500 MB input |
|---|---:|---:|
| Initial RSS | your result | your result |
| Peak RSS | your result | your result |
| Final RSS | your result | your result |
| Execution time | your result | your result |

Do not copy sample numbers from another machine; RAM use and execution time depend on the machine and runtime.

## Why memory stays bounded
- `createReadStream()` reads 64 KiB chunks instead of loading the full file.
- `LineSplitter` keeps only the unfinished line between chunks.
- `RowsToJson` converts one row at a time.
- `pipeline()` propagates errors and coordinates stream flow/backpressure. If the output stream slows down, upstream stages stop being pulled until the writable stream can accept more data.
- The program never stores all rows in an array.

## Important limitation
This teaching implementation assumes one CSV record occupies one physical line. It supports commas and escaped quotes inside a quoted field, but **not quoted fields containing embedded newlines**. For production CSV files with multiline quoted fields, use a streaming CSV parser that explicitly supports that format.

RSS is the process's resident memory, not just JavaScript heap. Peak RSS is sampled every 50 ms, so a very brief peak could be missed.
