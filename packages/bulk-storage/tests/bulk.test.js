'use strict';


const { expect } = require('chai');
const testResources = require('../../../tests/resources/resources.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BulkStorage, FileRecord, RecordFlags, FlagState, Header, TableOfContents } = require("../bulk.js");


/**
 * Generates a File Record with random data
 * @returns {FileRecord}
 */
const genRecord = () => {
    const start = crypto.randomInt(0, 2**32);
    const end = crypto.randomInt(start, 2**32);
    const iv = crypto.randomBytes(16);

    return new FileRecord(
        Buffer.from(crypto.randomUUID().toString().replace(/-/g, '').toLowerCase(), 'hex'),
        start,
        end,
        iv,
        FlagState.NONE
    );
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

describe("Bulk Header", function() {
    // key gen takes a while, so be patient

    const pw = crypto.randomBytes(64).toString('latin1');
    const {publicKey, privateKey} = BulkStorage.genKey(pw);

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

describe("Table of Contents", function() {
    this.timeout(10_000); // long timeout to compensate for decryption/encryption being too heavy

    let records;

    beforeEach(() => {
        records = Array.from(
            {length: 64},
            () => { // mano que porcaria devagar
                return genRecord();
            }
        );
    });

    it("imports and exports toc from/to binary data", function() {
        const pk = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);

        const bin = TableOfContents.toBinary(records, pk, iv);
        const tocFromBinary = TableOfContents.from(bin, pk, iv);

        expect(tocFromBinary).to.be.deep.equal(records);
    });
});

describe("Bulk Storage", function() {
    // The result of all tests are contained on this file
    const TARGET = path.join(testResources.output, "test.store");

    const SOURCES = {
        serval: {path: testResources.files.serval, md5: "e102fe988826053209e9374fa3377fb3"},
        haha: {path: testResources.files.haha, md5: "4bb12bf412c1f0ec53b890802ef626a8"},
        mpeg7: {path: testResources.files.mpeg7, md5: "98abf0b6b59347bf1da4a2dfc6c52654"}
    }

    const pw = crypto.randomBytes(64).toString('latin1');
    const {publicKey, privateKey} = BulkStorage.genKey(pw);

    beforeEach(() => {
        testResources.cleanUpTestOutputDir();
    })

    it("creates storage file", () => {
        const storage = BulkStorage.create(TARGET, publicKey);
        expect(storage.records).to.be.empty;
    });

    it("can reopen a storage file", () => {
        let storage = BulkStorage.create(TARGET, publicKey);

        storage.close();
        storage = BulkStorage.open(TARGET, privateKey, pw);
        expect(storage.records).to.be.empty;
    });

    it("inserts files", async() => {
        const storage = BulkStorage.create(TARGET, publicKey);

        const sources = Object.values(SOURCES);
        for(const src of sources) {
            const reader = fs.createReadStream(src.path);
            const record = await storage.add(reader);
            expect(record).to.be.instanceOf(FileRecord);
        }

        expect(storage.records).to.have.length(sources.length);
    });

    it("returns the record after add", async() => {
        const storage = BulkStorage.create(TARGET, publicKey);

        const sources = Object.values(SOURCES);
        for(const src of sources) {
            const reader = fs.createReadStream(src.path);
            const record = await storage.add(reader);
            expect(storage.records).to.contain(record);
        }

    });

    it("insert fails after closing", async() => {
        const storage = BulkStorage.create(TARGET, publicKey);
        storage.close();

        const source = fs.createReadStream(SOURCES.serval.path);
        storage.add(source)
            .then(() => {
                expect.fail("This promise shouldn't resolve!");
            })
            .catch(reason => {
                expect(reason).to.equal("Storage is closed!");
            });
    });

    it("deletes files", async() => {
        const storage = BulkStorage.create(TARGET, publicKey);

        const sources = Object.values(SOURCES);
        for(const src of sources) {
            const reader = fs.createReadStream(src.path);
            await storage.add(reader);
        }

        const records = storage.records;
        const wasDeleted = storage.delete(records[0].uuid);

        expect(wasDeleted).to.be.true;
        const normalRecords = storage
            .records
            .filter(record => !record.flags.isDeleted());
        expect(normalRecords).to.have.length(sources.length-1);
    });

    it("cannot delete twice", async() => {
        const storage = BulkStorage.create(TARGET, publicKey);

        const sources = Object.values(SOURCES);
        for(const src of sources) {
            const reader = fs.createReadStream(src.path);
            await storage.add(reader);
        }

        const records = storage.records;
        storage.delete(records[0].uuid);
        const wasDeleted = storage.delete(records[0].uuid);

        expect(wasDeleted).to.be.false;
        const normalRecords = storage
            .records
            .filter(r => !r.flags.isDeleted());
        expect(normalRecords).to.have.length(sources.length-1);
    });

    it("cannot delete not existing", async() => {
        // create storage and add files
        const storage = BulkStorage.create(TARGET, publicKey);
        const sources = Object.values(SOURCES);
        for(const src of sources) {
            const reader = fs.createReadStream(src.path);
            await storage.add(reader);
        }

        // try to delete file with random ID
        const wasDeleted = storage.delete(crypto.randomBytes(32));

        expect(wasDeleted).to.be.false;
        const normalRecords = storage
            .records
            .filter(r => !r.flags.isDeleted());
        expect(normalRecords).to.have.length(sources.length);
    });

    it("delete fails after closing", async() => {
        const storage = BulkStorage.create(TARGET, publicKey);
        storage.close();

        const uuid = Buffer.alloc(16).fill(0);
        expect(() => storage.delete(uuid)).to.throw("Storage is closed!");
    });

    it("reads file", async () => {
        const storage = BulkStorage.create(TARGET, publicKey);
        const source = fs.createReadStream(SOURCES.serval.path);
        const record = await storage.add(source);

        const streamOut = storage.get(record.uuid);
        const hash = crypto.createHash("md5");
        streamOut.pipe(hash);
        await new Promise(resolve => {
            streamOut.on("end", resolve);
        });
        expect(hash.digest("hex")).to.be.equal(SOURCES.serval.md5);
    });

    it("cannot read file if not exists", async() => {
        const storage = BulkStorage.create(TARGET, publicKey);

        const sources = Object.values(SOURCES);
        for(const src of sources) {
            const reader = fs.createReadStream(src.path);
            const record = await storage.add(reader);
        }

        const stream = storage.get(crypto.randomBytes(32));

        expect(stream).to.be.null;
    });

    it("reads insterted file after reopening", async () => {
        let storage = BulkStorage.create(TARGET, publicKey);
        const source = fs.createReadStream(SOURCES.serval.path);
        const record = await storage.add(source);
        storage.sync(publicKey);
        storage.close();

        storage = BulkStorage.open(TARGET, privateKey, pw);

        const streamOut = storage.get(record.uuid);
        const hash = crypto.createHash("md5");
        streamOut.pipe(hash);
        await new Promise(resolve => {
            streamOut.on("end", resolve);
        });
        expect(hash.digest("hex")).to.be.equal(SOURCES.serval.md5);
    });

    it("read fails when closed", async() => {
        const storage = BulkStorage.create(TARGET, publicKey);
        storage.close();

        const uuid = Buffer.alloc(16).fill(0);
        expect(() => storage.get(uuid)).to.throw("Storage is closed!");
    });
});