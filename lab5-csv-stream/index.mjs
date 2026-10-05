import fs from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

const input = process.argv[2] ?? 'input-500mb.csv';
const output = process.argv[3] ?? 'output.json';
const CHUNK_SIZE = 64 * 1024; 

class LineSplitter extends Transform {
  constructor() {
    super({ readableObjectMode: true });
    this.tail = '';
    this.decoder = new StringDecoder('utf8');
  }

  _transform(chunk, _encoding, callback) {
    try {
      const text = this.tail + this.decoder.write(chunk);
      const lines = text.split(/\r?\n/);
      this.tail = lines.pop() ?? '';

      for (const line of lines) {
        if (line.length > 0) this.push(line);
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    try {
      const remaining = this.tail + this.decoder.end();
      if (remaining.length > 0) this.push(remaining);
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new Error(`Malformed CSV: unclosed quote in line: ${line.slice(0, 100)}`);
  fields.push(field);
  return fields;
}

class RowsToJson extends Transform {
  constructor() {
    super({ writableObjectMode: true });
    this.headers = null;
    this.count = 0;
  }

  _transform(line, _encoding, callback) {
    try {
      const fields = parseCsvLine(line);

      if (this.headers === null) {
        this.headers = fields;
        this.push('[\n');
        callback();
        return;
      }

      const row = {};
      for (let i = 0; i < this.headers.length; i++) {
        row[this.headers[i]] = fields[i] ?? null;
      }

      const separator = this.count === 0 ? '' : ',\n';
      this.push(separator + JSON.stringify(row));
      this.count++;
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    if (this.headers === null) {
      this.push('[]\n');
    } else {
      this.push('\n]\n');
    }
    callback();
  }
}

let peakRss = process.memoryUsage().rss;
const initialRss = peakRss;
const startedAt = performance.now();
const monitor = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 50);
monitor.unref();

try {
  await pipeline(
    fs.createReadStream(input, { highWaterMark: CHUNK_SIZE }),
    new LineSplitter(),
    new RowsToJson(),
    fs.createWriteStream(output)
  );

  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const finalRss = process.memoryUsage().rss;
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const formatMiB = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;

  console.log(`Input:          ${path.resolve(input)}`);
  console.log(`Output:         ${path.resolve(output)}`);
  console.log(`Initial RSS:    ${formatMiB(initialRss)}`);
  console.log(`Peak RSS:       ${formatMiB(peakRss)}`);
  console.log(`Final RSS:      ${formatMiB(finalRss)}`);
  console.log(`Execution time: ${elapsedSeconds.toFixed(2)} seconds`);
} catch (error) {
  console.error(`CSV-to-JSON conversion failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearInterval(monitor);
}
