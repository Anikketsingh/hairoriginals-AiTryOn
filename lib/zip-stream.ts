/**
 * lib/zip-stream.ts
 *
 * Minimal streaming ZIP writer, used by the bulk image export
 * (app/api/admin/vault/[key]/download/route.ts).
 *
 * Deliberately dependency-free and "store" only (no deflate): every byte we
 * archive is an already-compressed JPEG/PNG/WebP, so deflating them burns CPU
 * on a serverless function to save ~0%. Storing also means each entry's size
 * and CRC are known before its local header is written, so we never need data
 * descriptors and the output is a plain, seekable, universally-readable ZIP.
 *
 * It streams: one source image is held in memory at a time and handed to the
 * response as soon as it's framed, so an export of thousands of photos runs at
 * flat memory instead of buffering gigabytes.
 *
 * ZIP64 is emitted per entry once a 32-bit field would overflow (an archive
 * past 4 GiB — reachable here) and for the trailer once the entry count passes
 * 65535. Below those limits the output stays a classic ZIP that even ancient
 * tools open.
 */

export interface ZipEntry {
  /** Path inside the archive. Must be unique across the stream. */
  name: string;
  data: Uint8Array;
  /** Modification time recorded in the entry. Defaults to now. */
  date?: Date;
}

/** Value a 32-bit ZIP field takes to mean "the real number is in the ZIP64 extra field". */
const U32_MAX = 0xffffffff;
/** Same sentinel for the 16-bit entry-count fields in the end-of-central-directory record. */
const U16_MAX = 0xffff;

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const ZIP64_EOCD_SIG = 0x06064b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const EOCD_SIG = 0x06054b50;

/** Bit 11 — filename/comment are UTF-8 rather than CP437. */
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const VERSION_STORE = 20; // 2.0
const VERSION_ZIP64 = 45; // 4.5
/** Host 3 (UNIX) in the high byte of "version made by". */
const MADE_BY = (3 << 8) | VERSION_ZIP64;

/**
 * External file attributes: `0100644` (regular file, rw-r--r--) in the high
 * 16 bits, which is where a UNIX-host archive carries its st_mode.
 *
 * Not optional. Declaring host 3 and then leaving this zero makes `unzip`
 * extract every file with mode 0000 — the archive verifies clean and the
 * contents are correct, but nothing in it can be opened afterwards.
 */
const EXTERNAL_ATTRS = ((0o100644 << 16) >>> 0) as number;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed time/date. Pre-1980 dates aren't representable, so clamp. */
function dosDateTime(date: Date): { time: number; dosDate: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (Math.floor(date.getSeconds() / 2) & 0x1f),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Little-endian writer over a fixed-size buffer, with a cursor. */
class ByteWriter {
  private readonly view: DataView;
  private cursor = 0;
  readonly bytes: Uint8Array;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }

  u16(value: number): this {
    this.view.setUint16(this.cursor, value, true);
    this.cursor += 2;
    return this;
  }

  u32(value: number): this {
    this.view.setUint32(this.cursor, value >>> 0, true);
    this.cursor += 4;
    return this;
  }

  u64(value: number): this {
    this.view.setBigUint64(this.cursor, BigInt(value), true);
    this.cursor += 8;
    return this;
  }

  raw(value: Uint8Array): this {
    this.bytes.set(value, this.cursor);
    this.cursor += value.length;
    return this;
  }
}

interface CentralRecord {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  dosDate: number;
}

export interface CreateZipStreamOptions {
  /**
   * Byte value above which a field is written as a ZIP64 sentinel. Exists so
   * tests can exercise the ZIP64 branch without generating a 4 GiB archive —
   * leave unset in production.
   */
  zip64Threshold?: number;
}

/**
 * Frames an async sequence of entries into a ZIP archive as a byte stream.
 *
 * Entries are pulled one at a time, in response to the consumer's demand, so
 * the caller's generator controls how much data is ever resident.
 */
export function createZipStream(
  entries: AsyncIterable<ZipEntry>,
  options: CreateZipStreamOptions = {}
): ReadableStream<Uint8Array> {
  const threshold = options.zip64Threshold ?? U32_MAX;
  const iterator = entries[Symbol.asyncIterator]();
  const central: CentralRecord[] = [];
  const encoder = new TextEncoder();

  // Running byte offset into the archive — this is what central-directory
  // records point at, so it must count every byte we enqueue.
  let offset = 0;
  let finished = false;

  function localHeader(record: CentralRecord, dataLength: number): Uint8Array {
    const zip64 = dataLength > threshold;
    // A local header can't carry an offset, so its ZIP64 extra field only ever
    // holds the two sizes — and both must be present when either is.
    const extraLength = zip64 ? 20 : 0;
    const writer = new ByteWriter(30 + record.nameBytes.length + extraLength);

    writer
      .u32(LOCAL_HEADER_SIG)
      .u16(zip64 ? VERSION_ZIP64 : VERSION_STORE)
      .u16(FLAG_UTF8)
      .u16(METHOD_STORE)
      .u16(record.time)
      .u16(record.dosDate)
      .u32(record.crc)
      .u32(zip64 ? U32_MAX : dataLength)
      .u32(zip64 ? U32_MAX : dataLength)
      .u16(record.nameBytes.length)
      .u16(extraLength)
      .raw(record.nameBytes);

    if (zip64) {
      writer.u16(0x0001).u16(16).u64(dataLength).u64(dataLength);
    }
    return writer.bytes;
  }

  function centralHeader(record: CentralRecord): Uint8Array {
    // Only the fields that actually overflow go in the extra block, and the
    // spec fixes their order: uncompressed size, compressed size, offset.
    const sizeOverflow = record.size > threshold;
    const offsetOverflow = record.offset > threshold;
    const extraDataLength = (sizeOverflow ? 16 : 0) + (offsetOverflow ? 8 : 0);
    const extraLength = extraDataLength > 0 ? extraDataLength + 4 : 0;
    const writer = new ByteWriter(46 + record.nameBytes.length + extraLength);

    writer
      .u32(CENTRAL_HEADER_SIG)
      .u16(MADE_BY)
      .u16(extraLength > 0 ? VERSION_ZIP64 : VERSION_STORE)
      .u16(FLAG_UTF8)
      .u16(METHOD_STORE)
      .u16(record.time)
      .u16(record.dosDate)
      .u32(record.crc)
      .u32(sizeOverflow ? U32_MAX : record.size)
      .u32(sizeOverflow ? U32_MAX : record.size)
      .u16(record.nameBytes.length)
      .u16(extraLength)
      .u16(0) // file comment length
      .u16(0) // disk number start
      .u16(0) // internal attributes
      .u32(EXTERNAL_ATTRS)
      .u32(offsetOverflow ? U32_MAX : record.offset)
      .raw(record.nameBytes);

    if (extraLength > 0) {
      writer.u16(0x0001).u16(extraDataLength);
      if (sizeOverflow) writer.u64(record.size).u64(record.size);
      if (offsetOverflow) writer.u64(record.offset);
    }
    return writer.bytes;
  }

  function trailer(centralOffset: number, centralSize: number): Uint8Array {
    const count = central.length;
    // The trailer needs ZIP64 as soon as any of its own fields would overflow,
    // independently of whether individual entries did.
    const zip64 =
      count > U16_MAX || centralSize > threshold || centralOffset > threshold;
    const writer = new ByteWriter(zip64 ? 56 + 20 + 22 : 22);

    if (zip64) {
      writer
        .u32(ZIP64_EOCD_SIG)
        .u64(44) // record size, excluding its own signature and size fields
        .u16(MADE_BY)
        .u16(VERSION_ZIP64)
        .u32(0) // this disk
        .u32(0) // disk holding the central directory
        .u64(count)
        .u64(count)
        .u64(centralSize)
        .u64(centralOffset)
        .u32(ZIP64_LOCATOR_SIG)
        .u32(0) // disk holding the ZIP64 EOCD
        .u64(centralOffset + centralSize)
        .u32(1); // total disks
    }

    writer
      .u32(EOCD_SIG)
      .u16(0)
      .u16(0)
      .u16(zip64 ? U16_MAX : count)
      .u16(zip64 ? U16_MAX : count)
      .u32(zip64 ? U32_MAX : centralSize)
      .u32(zip64 ? U32_MAX : centralOffset)
      .u16(0); // archive comment length

    return writer.bytes;
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;

      const next = await iterator.next();

      if (!next.done) {
        const entry = next.value;
        const { time, dosDate } = dosDateTime(entry.date ?? new Date());
        const record: CentralRecord = {
          nameBytes: encoder.encode(entry.name),
          crc: crc32(entry.data),
          size: entry.data.length,
          offset,
          time,
          dosDate,
        };

        const header = localHeader(record, entry.data.length);
        controller.enqueue(header);
        controller.enqueue(entry.data);
        offset += header.length + entry.data.length;
        central.push(record);
        return;
      }

      finished = true;
      const centralOffset = offset;
      let centralSize = 0;
      for (const record of central) {
        const header = centralHeader(record);
        controller.enqueue(header);
        centralSize += header.length;
      }
      controller.enqueue(trailer(centralOffset, centralSize));
      controller.close();
    },

    async cancel(reason) {
      finished = true;
      await iterator.return?.(reason);
    },
  });
}
