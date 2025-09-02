'use strict';

const crypto = require("crypto");
const fs = require("fs");
//const io = require("./io.js");

/**
 * @typedef {0|1|2|4|8|16|32|64|128|256|512|1024|2048|4096|8192|16384|32768} BinaryFlag
 */

/**
 *
 * @readonly
 * @enum {BinaryFlag}
 */
const FlagState = {
    NONE: 0,
    BUSY: 1,
    DELETED: 2,
    NOT_READY: 4,
    UNUSED_4: 8,
    UNUSED_5: 16,
    UNUSED_6: 32,
    UNUSED_7: 64,
    UNUSED_8: 128,
    UNUSED_9: 256,
    UNUSED_10: 512,
    UNUSED_11: 1024,
    UNUSED_12: 2048,
    UNUSED_13: 4096,
    UNUSED_14: 8192,
    UNUSED_15: 16384,
    UNUSED_16: 32768
}

/**
 * Special flags for record
 * @param {number} [flags=FlagStates.NONE] Starting flags. If ommited, sets no flags
 * @constructor
 */
function RecordFlags(flags) {
    this.value = flags ?? FlagState.NONE;
}

/**
 * True if this record is normal
 * @returns {boolean}
 */
RecordFlags.prototype.isNormal = function() {
    return this.value === FlagState.NONE;
};

/**
 * True if the record is under operation
 * @returns {boolean}
 */
RecordFlags.prototype.isBusy = function() {
    return (this.value & FlagState.BUSY) > 0;
}

/**
 * True if the record was deleted
 * @returns {boolean}
 */
RecordFlags.prototype.isDeleted = function() {
    return (this.value & FlagState.DELETED) > 0;
}

/**
 * Toggle the value of the busy status
 */
RecordFlags.prototype.toggleBusy = function() {this.value ^= FlagState.BUSY};

/**
 * Toggle the value of the deleted status
 */
RecordFlags.prototype.toggleDeleted = function() {this.value ^= FlagState.DELETED};

/**
 * @override
 * Converts the flags to a bit-flag integer
 * @returns {number}
 */
RecordFlags.prototype.valueOf = function() {return this.value};

/**
 * Contains data about a stored file
 *
 * @param {Buffer} uuid Universal Unique Identifier for the file
 * @param {number|bigint} start File start offset relative to the bulk file start
 * @param {number|bigint} end File end offset relative to the bulk file start
 * @param {Buffer} iv Initialization Vector used to encrypt the file
 * @param {number} flags Two bytes bitmask for special attributes
 * @constructor
 */
const FileRecord = function(uuid, start, end, iv, flags) {
    if(start >= end)
        throw new Error("Invalid FileRecord: Invalid start/end markers!");
    if(iv.byteLength < 16)
        throw new Error("Invalid FileRecord: Got insufficient sized buffer for IV!");

    this.uuid = uuid;
    this.start = BigInt(start);
    this.end = BigInt(end);
    this.iv = iv;
    this.flags = new RecordFlags(flags);
}

/**
 * Length of this record in bytes
 * @type {number}
 */
Object.defineProperty(FileRecord, "BIN_LENGTH", {
    writable: false,
    value: 128
});

/**
 * Gets the encrypted length of the file referenced by this record
 * @returns {bigint}
 */
FileRecord.prototype.length = function() {return this.end - this.start};

/**
 * Converts this record into binary data
 * @returns {Buffer}
 */
FileRecord.prototype.toBinary = function() {
    const result = Buffer.allocUnsafe(FileRecord.BIN_LENGTH);

    result.set(this.uuid, 0); // 0-15
    result.writeBigInt64LE(this.start, 16); // 16-23
    result.writeBigInt64LE(this.end, 24); // 24-31
    result.set(this.iv, 32); // 32-47
    result.writeUInt16LE(this.flags.valueOf(), 48); // 48-49
    crypto.randomFillSync(result, 50); // 50-127

    return result;
}

/**
 * Creates a file record from raw data
 * @param {Buffer} buf
 * @returns {FileRecord}
 */
FileRecord.from = (buf) => {
    const uuid = buf.subarray(0, 16); //0-15
    const start = buf.readBigInt64LE(16); //16-23
    const end = buf.readBigInt64LE(24); //24-31
    const iv = buf.subarray(32, 48); //32-47
    const flags = buf.readUint16LE(48); //48-49

    return new FileRecord(uuid, start, end, iv, flags);
}

/**
 * Parses multiple <code>FileRecord</code>s stored contiguously in a buffer
 * @param {Buffer} buf The buffer holding the records
 * @returns {FileRecord[]}
 */
FileRecord.many = (buf) => {
    const LEN = FileRecord.BIN_LENGTH;
    if(buf.byteLength === 0)
        return [];
    if(buf.byteLength%LEN !== 0)
        console.warn("Got incorrect length!");

    return Array.from({length: buf.byteLength/LEN},
        (record, index) => {
            const chunk = buf.subarray(
                index*LEN,
                (index+1)*LEN
            );

            return FileRecord.from(chunk);
        }
    );
}

/**
 * Creates a new File Record
 * @param {number} start
 * @param {number} end
 * @param {number?} [flags=FlagState.NONE] Flags to apply to the file. Defaults to no flags set.
 */
FileRecord.create = (start, end, flags) => {
    const uuid = Buffer.from(
        crypto.randomUUID().replace(/-/g, '').toLowerCase(),
        'hex');
    const iv = crypto.randomBytes(16);

    return new FileRecord(uuid, start, end, iv, flags??FlagState.NONE);
}


/**
 * Headers of the Bulk Storage have two sections:
 *
 * <code>Signature</code>: Hold the string "BULK#" (5 bytes, ascii) and version (3 bytes, hex)</br>
 * <code>TOC Info</code>: Contain the properties of the Table of Contents, encrypted by an asymmetric key (512 bytes with RSA 4096)
 *
 * This class holds the TOC Info details
 * @param {Buffer} key Symmetric Key used to encrypt the Table of Contents
 * @param {Buffer} iv Initialization Vector used to encrypt the Table of Contents
 * @param {number|bigint} start Starting position of the Table of Contents
 *
 * @property {Buffer} key
 * @property {Buffer} iv
 * @property {bigint} start
 * @constructor
 */
function Header(key, iv, start) {
    this.key = key;
    this.iv = iv;
    this.start = BigInt(start);
}

/**
 * Size of the binary data in bytes
 * @type {number}
 */
Object.defineProperty(Header, "BIN_LENGTH", {
    writable: false,
    value: 520
});

/**
 * Exports this Bulk Header to binary data
 * @param publicKey The RSA 4096 key used to encrypt
 * @returns {crypto.KeyLike}
 */
Header.prototype.toBinary = function(publicKey) {
    const result = Buffer.allocUnsafe(Header.BIN_LENGTH);

    // write headers
    result.write("BULK#", 0, 'ascii');
    result.write("001001", 5, 'hex');

    // write raw toc data (reuse Buffer 8..63 positions)
    // toc info is offset by 8
    result.set(this.key, 8); // toc pk on 8-39 (32)
    result.set(this.iv, 40); // toc iv on 40-55 (16)
    result.writeBigInt64LE(this.start, 56); // toc pos on 56-63 (8)
    crypto.randomFillSync(result, 64, 264); // random fill on 64-263 (200)

    // encrypt raw toc data
    // this should have 512 bytes with a RSA 4096 key
    const toc = crypto.publicEncrypt(publicKey, result.subarray(8, 264));
    result.set(toc, 8);

    return result;
}

/**
 * Imports headers from raw data
 *
 * @param {Buffer} data
 * @param {crypto.KeyLike} privateKey The RSA 4096 private key used to encrypt the Table of Contents Info section
 * @param {string} password The private key password
 * @returns {Header}
 */
Header.from = (data, privateKey, password) => {
    // check file type (signature)
    const signature = data.toString('ascii', 0, 5);
    if(signature !== "BULK#")
        throw new Error("This file is incompatible!");

    // check if file is compatible (major version)
    const version = data.toString('hex', 5, 8);
    if(!version.startsWith('0'))
        throw new Error(`The file version (${version[0]}.${version.slice(1,2)}.${version.slice(2)}) is not compatible.`);

    // decrypt toc_info
    const tocInfo = crypto.privateDecrypt(
        {key: privateKey, passphrase: password},
        data.subarray(8, Header.BIN_LENGTH)
    );

    // extract toc fields
    const key = tocInfo.subarray(0, 32);
    const iv = tocInfo.subarray(32, 48);
    const start = tocInfo.readBigInt64LE(48);

    return new Header(key, iv, start);
}

/**
 * Table Of Contents is a collection of file records and associated data
 */
const TableOfContents = { }

/**
 * Converts this Table of Contents into binary data
 *
 * @param {FileRecord[]} toc
 * @param {crypto.CipherKey} key
 * @param {crypto.BinaryLike} iv
 * @returns {Buffer}
 */
TableOfContents.toBinary = (toc, key, iv) => {
    const cipher = crypto.createCipheriv(TableOfContents.CIPHER_ALGORITHM, key, iv);
    const encryptedTOC = toc.map(record => cipher.update(record.toBinary()));
    return Buffer.concat([...encryptedTOC, cipher.final()]);
}

/**
 * Parses a Table of Contents from raw data
 * @param {Buffer} buf Binary data
 * @param {Buffer} key Symmetric key used to encrypt the records
 * @param {Buffer} iv Initialization Vector used to encrypt the records
 * @returns {FileRecord[]}
 */
TableOfContents.from = (buf, key, iv) => {
    // decrypt toc
    const decipher = crypto.createDecipheriv(TableOfContents.CIPHER_ALGORITHM, key, iv);
    const tocData = Buffer.concat([decipher.update(buf), decipher.final()]);

    return FileRecord.many(tocData);
}

/**
 * Cipher algorithm used on the asymmetric encryption/decryption of the Table Of Contents.
 * @type {string}
 * @defaultValue 'aes-256-cbc'
 */
TableOfContents.CIPHER_ALGORITHM = 'aes-256-cbc';

// TODO: Implement journaling
//    The journal indicates points of any pending writes. If any pending write is found at boot, it must be purged.
//    Purging overwrites locations of non-deleted, non-pending data with bytes from healthy locations, then truncates the file.
//    Purging locks the database for any reads or writes.

/**
 * Fired when a file is successfully added to the Bulk Storage
 * @event BulkStorage#added
 * @type {FileRecord} The record added
 */

/**
 * Fired when a file addition is canceled
 * @event BulkStorage#aborted
 */
/**
 *
 * @param {Header} headers
 * @param {FileRecord[]} toc
 * @param {number} fd
 * @extends {EventEmitter<BulkStorage>}
 * @constructor
 */
function BulkStorage(headers, toc, fd) {
    let _fd = fd;

    Object.defineProperties(this, {
        /** @type {Header} */
        headers: {
            value: headers,
            writable: false
        },
        /** @type {number} */
        fd: {
            get() { return _fd; }
        },
        /** @type {boolean} */
        isClosed: {
            get() { return _fd === -1; }
        },
        /** @type {FileRecord[]} */
        records: {
            value: [...toc],
            writable: false
        }
    });

    /**
     * Closes the underlying file.
     * Any further operations will throw an error
     */
    this.close = () => {
        fs.closeSync(_fd);
        _fd = -1;
    }

}

/**
 * Adds a file to the Bulk Storage
 * @param {stream.ReadStream} source
 * @returns {Promise<FileRecord>}
 */
BulkStorage.prototype.add = async function(source) {
    if(this.isClosed) // fixme: probably a bug
        throw new Error("Storage is closed!");

    // create encryptor
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(TableOfContents.CIPHER_ALGORITHM, this.headers.key, iv);
    let encryptedLength = 0;
    cipher.on("data", (chunk) => {
        encryptedLength += chunk.byteLength;
    });

    // create output stream
    const output = fs.createWriteStream(null,
        {fd: this.fd, highWaterMark: 64*1024, autoClose: false, start: Number(this.headers.start)}
    );

    const writer = source.pipe(cipher).pipe(output);

    return new Promise((resolve, reject) => {
        let finished = false;
        // create new record after finishing encryption
        writer.once("finish", () => {
            const uuid = Buffer.from(
                crypto.randomUUID().replace(/-/g, '').toLowerCase(),
                'hex');
            const record = new FileRecord(
                uuid,
                this.headers.start,
                this.headers.start + BigInt(encryptedLength),
                iv,
                RecordFlags.NONE
            );
            this.records.push(record);
            this.headers.start = record.end;
            finished = true;
            return resolve(record);
        });

        // abort and remove written data after error
        writer.once("error", () => {
            // do nothing if managed to finish
            if(finished)
                return;
            fs.ftruncateSync(this.fd, Number(this.headers.start));
            return reject(new Error("BulkStorage: An error occurred while processing the file."));
        });

        writer.once("close", () => {
            // do nothing if managed to finish
            if(finished)
                return;
            fs.ftruncateSync(this.fd, Number(this.headers.start));
            return reject(new Error("BulkStorage: Stream closed prematurely!"));
        });
    });
}

/**
 * Reads a record from the Bulk Storage
 * @param {Buffer} uuid
 * @returns {crypto.Decipheriv|null}
 */
BulkStorage.prototype.get = function(uuid) {
    if(this.isClosed)
        throw new Error("Storage is closed!");

    const record = this.records.find(record => record.uuid.compare(uuid) === 0);
    if(record === undefined)
        return null;
    if(record.flags.isDeleted())
        return null;

    const decipher = crypto.createDecipheriv(TableOfContents.CIPHER_ALGORITHM, this.headers.key, record.iv);
    const reader = fs.createReadStream(null,
        {
            fd: this.fd,
            start: Number(record.start),
            end: Number(record.end),
            highWaterMark: 64*1024
        });
    return reader.pipe(decipher);
}

/**
 * Marks a file as deleted for purging
 * @param {Buffer} uuid
 * @returns {boolean} true if deleted, otherwise false
 */
BulkStorage.prototype.delete = function(uuid) {
    if(this.isClosed)
        throw new Error("Storage is closed!");

    const record = this.records.find(record => record.uuid.compare(uuid) === 0);
    if(record === undefined)
        return false;
    if(record.flags.isDeleted())
        return false;

    // tidy up if possible
    // if the last record is deleted, remove it from disk
    if(record.end === this.headers.start) {
        this.headers.start = record.start;
        fs.ftruncateSync(this.fd, Number(this.headers.start));
        const index = this.records.findIndex(record => record.uuid.compare(uuid) === 0);
        this.records.splice(index, 1);
    } else {
        record.flags.toggleDeleted();
    }
    return true;
}

/**
 * Removes records marked as removed and tidy up the file
 * @returns {Promise<number>[]} One promise for each file to be realocated with the file size
 */
BulkStorage.prototype.purge = function() {
    throw new Error("Bulk Storage: Not implemented yet!");

    // 1. set the search position to the start of the file
    // 2. find the first deleted record from the starting position
    //    If the list ends and no deleted records are found, return;
    // 3. find next normal record.
    //    If list ends and no normal records are found, truncate the storage file to the starting position of the search;
    // 4. overwrite the first deleted record with the normal record on storage file;
    // 5. change the starting and end position on the normal record;
    // 6. remove the deleted record from the toc;
    // 7. set the search position to the last modified end position and go to (2)
}

/**
 * Writes the Table of Content and headers to the storage and closes the storage
 * Bulk Storage cannot be used for further operations,
 * @param {crypto.KeyLike} publicKey
 */
BulkStorage.prototype.sync = function(publicKey) {
    if(this.isClosed)
        throw new Error("Bulk Storage:Storage is closed!");
    fs.ftruncateSync(this.fd, Number(this.headers.start));

    const tocbin = TableOfContents.toBinary(this.records, this.headers.key, this.headers.iv);
    fs.writeSync(this.fd, tocbin, 0, tocbin.byteLength, Number(this.headers.start));

    const headerbin = this.headers.toBinary(publicKey);
    fs.writeSync(this.fd, headerbin, 0, headerbin.byteLength, 0);
}

/**
 * Creates a new Bulk Storage file
 * @param {fs.PathLike} path
 * @param {crypto.KeyLike} publicKey
 * @returns {BulkStorage}
 */
BulkStorage.create = (path, publicKey) => {
    const fd = fs.openSync(path, 'w+');
    const toc = [];

    const pw = crypto.randomBytes(64);
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(pw, salt, 16384, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    const header = new Header(key, iv, Header.BIN_LENGTH);
    const storage = new BulkStorage(header, toc, fd);
    storage.sync(publicKey);

    return storage;
}

// TODO: Migrate fs operations to FileInterface ('io.js')
//  even if it means promisifying the entire thing

/**
 * Opens a storage from file
 * @param {fs.PathLike} path Path of the storage file
 * @param {crypto.KeyLike} privateKey Private asymmetric key used to decrypt the data
 * @param {string} password Password used to decrypt data
 * @returns {Promise<BulkStorage>}
 */
BulkStorage.open2 = async (path, privateKey, password) => {
    const {FileInterface} = require('./io.js');
    const fi = new FileInterface(path);

    /** @type Header */
    const headers = await new Promise((resolve, reject) => {
        fi.read(
            (data, readCount) => {
                if(readCount !== Header.BIN_LENGTH)
                    reject(new Error("Bulk Storage: Error reading header!"));
                resolve(Header.from(data, privateKey, password));
            },
            {amount: Header.BIN_LENGTH})
    });

    /** @type {FileRecord[]} */
    const toc = await new Promise(resolve => {
        fi.read(
            data => resolve(TableOfContents.from(data, headers.key, headers.iv)),
            {start: headers.start}
        );
    });

    // Truncate old Table of Content from storage
    await new Promise(resolve => fi.trunc(headers.start, resolve));

    return new BulkStorage(headers, toc, fi);
}

/**
 * Opens a storage from file
 * @param {fs.PathLike} path Path of the storage file
 * @param {crypto.KeyLike} privateKey Private asymmetric key used to decrypt the data. Should be a 4096 bit key.
 * @param {string} password Password used to decrypt data
 */
BulkStorage.open = (path, privateKey, password) => {
    const fd = fs.openSync(path, 'r+');

    // decrypt headers
    const binHeader = Buffer.allocUnsafe(Header.BIN_LENGTH);
    fs.readSync(fd, binHeader, {position: 0});
    const header = Header.from(binHeader, privateKey, password);

    // decrypt Table of Content
    const toclen = fs.fstatSync(fd, {bigint: true}).size - header.start;
    const bintoc = Buffer.allocUnsafe(Number(toclen));
    fs.readSync(fd, bintoc, {position: header.start});
    const toc = TableOfContents.from(bintoc, header.key, header.iv);

    // Truncate old Table of Content from storage
    fs.ftruncateSync(fd, Number(header.start));

    return new BulkStorage(header, toc, fd);
}

/**
 * Generate a key compatible with this bulk storage
 * @param {string} passphrase The password used to generate the key and decrypt data
 * @returns {KeyPairSyncResult<string, string>}
 */
BulkStorage.genKey = (passphrase) => {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: "spki",
            format: "pem"
        },
        privateKeyEncoding: {
            type: "pkcs8",
            format: "pem",
            cipher: 'aes-256-cbc', //gcm is borked
            passphrase
        }
    });
}

module.exports = exports = (process.env.NODE_ENV?.toLowerCase().startsWith('dev'))
    ?{ BulkStorage, TableOfContents, Header, FileRecord, RecordFlags, FlagState }
    :{ BulkStorage };
