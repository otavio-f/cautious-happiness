'use strict';

const crypto = require("crypto");
const fs = require("fs");
const crc32 = require("crc/calculators/crc32");
const { FileRecord, Header } = require('./filerecord.js');


/**
 * Converts a number to buffer
 * @param {number} num
 * @returns {Buffer}
 */
const intToBuf = (num) => {
    let repr = num.toString(16);
    if(repr.length%2 !== 0)
        repr = '0' + repr;

    return Buffer.from(repr);
}

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
    if(this.isClosed)
        throw new Error("Storage is closed!");

    const record = FileRecord.create({start: this.headers.start});
    let crc = 0;
    const md5 = crypto.createHash('md5');
    const sha256 = crypto.createHash('sha256');

    // create output stream
    const output = fs.createWriteStream(null,
        {fd: this.fd, highWaterMark: 64*1024, autoClose: false, start: Number(record.start)}
    );

    source.on("data", chunk => {
        if(chunk === null)
            return;
        crc = crc32(chunk, crc);
        md5.update(chunk);
        sha256.update(chunk);
    });

    const writer = source.pipe(record.getEncryptor()).pipe(output);

    return new Promise((resolve, reject) => {
        let finished = false;
        // create new record after finishing encryption
        writer.once("finish", () => {
            record.crc = intToBuf(crc);
            record.md5 = md5.digest();
            record.sha = sha256.digest();
            record.end = BigInt(writer.pos);
            this.records.push(record);
            this.headers.start = record.end;
            finished = true;
            return resolve(record);
        });

        // abort and remove written data after error
        writer.once("error", () => {
            fs.ftruncateSync(this.fd, Number(record.start));
            return reject(new Error("BulkStorage: An error occurred while processing the file."));
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

    const reader = fs.createReadStream(null,
        {
            fd: this.fd,
            start: Number(record.start),
            end: Number(record.end) - 1, // sub 1 because inclusive end causes decryption to fail
            highWaterMark: 64*1024
        });
    return reader.pipe(record.getDecryptor());
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

    const tocstart = Number(this.headers.start);

    fs.ftruncateSync(this.fd, tocstart);

    const tocbin = FileRecord.TableOfContents.toBinary(this.records, this.headers.key, this.headers.iv);
    fs.writeSync(this.fd, tocbin, 0, tocbin.byteLength, tocstart);

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

    // decrypt Table of Contents
    const toclen = fs.fstatSync(fd, {bigint: true}).size - header.start;
    const bintoc = Buffer.allocUnsafe(Number(toclen));
    fs.readSync(fd, bintoc, {position: header.start});
    const toc = FileRecord.TableOfContents.from(bintoc, header.key, header.iv);

    // Truncate old Table of Content from storage
    fs.ftruncateSync(fd, Number(header.start));

    return new BulkStorage(header, toc, fd);
}

module.exports = exports = { BulkStorage };
