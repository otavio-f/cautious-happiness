'use strict';

const { expect } = require('chai');
const crypto = require("crypto");
const { FileRecord, RecordFlags, Header } = require('../filerecord.js');


/**
 * Generates a File Record with random data
 * @returns {FileRecord}
 */
const genRecord = () => {
    const start = crypto.randomInt(0, 2**32);
    return  FileRecord.create({
        start,
        end : crypto.randomInt(start, 2**32),
        crc : crypto.randomBytes(4),
        md5 : crypto.randomBytes(16),
        sha : crypto.randomBytes(32)
    });
}

describe("File Flags", function() {
    it("sets normal flag by default", function() {
        const flag = new RecordFlags();

        expect(flag.isNormal()).ok;
    });

    it("is normal when no other flag is set", function() {
        const flag = new RecordFlags();

        expect(flag.isNormal()).ok;
        expect(flag.isBusy()).not.ok;
        expect(flag.isDeleted()).not.ok;
    });

    it("becomes normal when all flags are unset", function() {
        const flag = new RecordFlags();

        flag.toggleDeleted();
        flag.toggleBusy();
        flag.toggleDeleted();
        flag.toggleBusy();

        expect(flag.isNormal()).ok;
    });

    it("is not normal when any other flag is set", function() {
        const flag = new RecordFlags();

        flag.toggleDeleted();

        expect(flag.isNormal()).not.ok;
    });

    it("sets busy flag", function() {
        const flag = new RecordFlags();

        flag.toggleBusy();

        expect(flag.isBusy()).ok;
    });

    it("sets deleted flag", function() {
        const flag = new RecordFlags();

        flag.toggleDeleted();

        expect(flag.isDeleted()).ok;
    });

    it("unsets busy flag", function() {
        const flag = new RecordFlags();

        flag.toggleBusy();
        flag.toggleBusy()

        expect(flag.isBusy()).not.ok;
    });

    it("unsets deleted flag", function() {
        const flag = new RecordFlags();

        flag.toggleDeleted();
        flag.toggleDeleted();

        expect(flag.isDeleted()).not.ok;
    });

    it("sets multiple tags", function() {
        const flag = new RecordFlags();

        flag.toggleDeleted();
        flag.toggleBusy();

        expect(flag.isDeleted()).ok;
        expect(flag.isBusy()).ok;
    });

    it("unsets partially", function() {
        const flag = new RecordFlags();

        flag.toggleDeleted();
        flag.toggleBusy();
        flag.toggleBusy();

        expect(flag.isDeleted()).ok;
        expect(flag.isBusy()).not.ok;
    });
});

describe("File Record", function() {
    it('imports and exports records from/to binary data', () => {
        const record = genRecord();

        const buf = record.toBinary();
        const result = FileRecord.from(buf);

        expect(result).to.deep.equal(record);
    });

    it('imports and exports many records from/to binary data', () => {
        const records = Array.from({length: 16}, genRecord);

        const buf = Buffer.concat(records.map(record => record.toBinary()));
        const result = FileRecord.many(buf);

        expect(result).deep.equal(records);
    });

});

describe("Table of Contents", function() {
    let records;

    beforeEach(() => {
        records = Array.from({length: 16384},  genRecord);
    });

    it("encrypts and decrypts toc from/to binary data", function() {
        const pk = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);

        const bin = FileRecord.TableOfContents.toBinary(records, pk, iv);
        const tocFromBinary = FileRecord.TableOfContents.from(bin, pk, iv);

        expect(tocFromBinary).to.be.deep.equal(records);
    });
});

describe("Bulk Header", function() {
    // key gen takes a while, so be patient
    const pw = crypto.randomBytes(64).toString('latin1');
    const {publicKey, privateKey} = Header.genKey(pw);

    it("imports and exports headers from/to binary data", function() {
        const header = new Header(
            crypto.randomBytes(32),
            crypto.randomBytes(16),
            crypto.randomInt(2**32)
        );

        const buf = header.toBinary(publicKey);

        expect(Header.from(buf, privateKey, pw)).to.deep.equal(header);
    });
});
