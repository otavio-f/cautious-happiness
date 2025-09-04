'use strict';
const crypto = require('crypto');

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
 * @param {bigint} start File start offset relative to the bulk file start
 * @param {bigint} end File end offset relative to the bulk file start
 * @param {Buffer} key 32 byte key used to encrypt the file
 * @param {Buffer} iv 16 byte Initialization Vector used to encrypt the file
 * @param {Buffer} crc 4 byte CRC32 checksum
 * @param {Buffer} md5 128 byte MD5 checksum
 * @param {Buffer} sha 256 byte SHA256 checksum
 * @param {Date} ctime creation date relative to epoch, in milliseconds
 * @param {RecordFlags} flags Two bytes bitmask for special attributes
 * @constructor
 */
const FileRecord = function(uuid, start, end, key, iv, crc, md5, sha, ctime, flags) {
    if(start >= end)
        throw new Error("Invalid FileRecord: Invalid start/end markers!");
    if(iv.byteLength < 16)
        throw new Error("Invalid FileRecord: Got insufficient sized buffer for IV!");

    this.uuid = uuid;
    this.start = BigInt(start);
    this.end = BigInt(end);
    this.key = key;
    this.iv = iv;
    this.crc = crc;
    this.md5 = md5;
    this.sha = sha;
    this.ctime = ctime;
    this.flags = flags;
}

/**
 * Length of this record in bytes
 * @type {number}
 */
Object.defineProperty(FileRecord, "BIN_LENGTH", {
    writable: false,
    value: 256
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
    result.set(this.key, 32); // 32-63
    result.set(this.iv, 64); // 64-79
    result.set(this.crc, 80); // 80-83
    result.set(this.md5, 84); // 84-100
    result.set(this.sha, 100); // 100-131
    result.writeBigInt64LE(BigInt(this.ctime.valueOf()), 132); // 132-139
    result.writeUInt16LE(this.flags.valueOf(), 140); // 140-141
    result.fill(0, 142); // zero fill: 142-256

    return result;
}

/**
 * Creates an encryptor object for this record
 * @returns {Cipheriv}
 */
FileRecord.prototype.getEncryptor = function() {
    return crypto.createCipheriv(FileRecord.CIPHER_ALGORITHM, this.key, this.iv);
}

/**
 * Creates a decryptor object for this record
 * @returns {Decipheriv}
 */
FileRecord.prototype.getDecryptor = function() {
    return crypto.createDecipheriv(FileRecord.CIPHER_ALGORITHM, this.key, this.iv);
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
    const key = buf.subarray(32, 64); //32-63
    const iv = buf.subarray(64, 80); //64-79
    const crc = buf.subarray(80, 84); //80-83
    const md5 = buf.subarray(84, 100); //84-99
    const sha = buf.subarray(100, 132); //100-131
    const ctime = Number(buf.readBigInt64LE(132)); //132-139
    const flags = buf.readUint16LE(140); //140-141

    return new FileRecord(uuid, start, end, key, iv, crc, md5, sha, new Date(ctime), new RecordFlags(flags));
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
 * Creates a pre-filled file record
 * @param {{start: (int|bigint)?, end: (int|bigint)?, crc: Buffer?, md5: Buffer?, sha: Buffer?}} [options]
 * @returns {FileRecord}
 */
FileRecord.create = (options) => {
    options = options??{};

    const uuid = Buffer.from(crypto.randomUUID().toString().replace(/-/g, '').toLowerCase(), 'hex');
    const start = BigInt(options.start??0);
    const end = BigInt(options.end??(start+1n));
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const crc = options.crc??Buffer.alloc(4, 0);
    const md5 = options.md5??Buffer.alloc(16, 0);
    const sha = options.sha??Buffer.alloc(32, 0);
    const ctime = new Date();

    return new FileRecord(
        uuid,
        start,
        end,
        key,
        iv,
        crc,
        md5,
        sha,
        ctime,
        new RecordFlags()
    );
}

FileRecord.TableOfContents = {}

/**
 * Converts this Table of Contents into binary data
 *
 * @param {FileRecord[]} toc
 * @param {crypto.CipherKey} key
 * @param {crypto.BinaryLike} iv
 * @returns {Buffer}
 */
FileRecord.TableOfContents.toBinary = (toc, key, iv) => {
    const cipher = crypto.createCipheriv(FileRecord.CIPHER_ALGORITHM, key, iv);
    const bintoc = Buffer.concat(toc.map(record => record.toBinary()));
    const encryptedTOC = cipher.update(bintoc);
    return Buffer.concat([encryptedTOC, cipher.final()]);
}

/**
 * Parses a Table of Contents from raw data
 * @param {Buffer} buf Binary data
 * @param {Buffer} key Symmetric key used to encrypt the records
 * @param {Buffer} iv Initialization Vector used to encrypt the records
 * @returns {FileRecord[]}
 */
FileRecord.TableOfContents.from = (buf, key, iv) => {
    // decrypt toc
    const decipher = crypto.createDecipheriv(FileRecord.CIPHER_ALGORITHM, key, iv);
    const tocData = Buffer.concat([decipher.update(buf), decipher.final()]);

    return FileRecord.many(tocData);
}

/**
 * Cipher algorithm used on the asymmetric encryption/decryption of the Table Of Contents.
 * @type {string}
 * @defaultValue 'aes-256-cbc'
 */
FileRecord.CIPHER_ALGORITHM = 'aes-256-cbc';


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
 * @property {Buffer} key Key used to encrypt the Table Of Contents
 * @property {Buffer} iv Initialization Vector used to encrypt the Table of Contents
 * @property {bigint} start Table of Contents offset on file
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
 * @param {KeyLike} publicKey The RSA 4096 key used to encrypt
 * @returns {Buffer}
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
 * Generate a key compatible with headers
 * @param {string} passphrase The password used to generate the key and decrypt data
 * @returns {KeyPairSyncResult<string, string>}
 */
Header.genKey = (passphrase) => {
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

module.exports = exports = { FileRecord, RecordFlags, Header };
