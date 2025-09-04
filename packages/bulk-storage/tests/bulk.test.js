'use strict';


const { expect } = require('chai');
const testResources = require('../../../tests/resources/resources.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BulkStorage } = require('../bulk.js');
const { FileRecord, Header } = require('../filerecord.js');

describe("Bulk Storage", function() {
    // The result of all tests are contained on this file
    const TARGET = path.join(testResources.output, "test.store");

    const SOURCES = {
        serval: {path: testResources.files.serval, md5: "135d6abb5c0282124edb36010740ff46"},
        haha: {path: testResources.files.haha, md5: "4fd94b8c96df725de6edf17694ce9bf5"},
        mpeg7: {path: testResources.files.mpeg7, md5: "98abf0b6b59347bf1da4a2dfc6c52654"}
    }

    const pw = crypto.randomBytes(64).toString('latin1');
    const {publicKey, privateKey} = Header.genKey(pw);

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
        let source = fs.createReadStream(SOURCES.serval.path);
        const record = await storage.add(source);
        source = fs.createReadStream(SOURCES.mpeg7.path);
        await storage.add(source);

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