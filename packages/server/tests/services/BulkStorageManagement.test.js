'use strict';

const { expect} = require('chai');
const testResources = require('../../../../tests/resources/resources.js');
const fs = require('fs');
const crypto = require('crypto');
const { BulkStorage} = require('bulk-storage');
const { StorageManager } = require('../../services/BulkStorageManagement.js');
const { masterDB } = require('../../db/master.js');


describe('Bulk Storage Management Service', function() {
    const password = crypto.randomBytes(16).toString('latin1');
    const {publicKey, privateKey} = BulkStorage.genKey(password);
    const root = testResources.output;
    const resources = {
        lorem: testResources.files.mpeg7,
        sff: testResources.files.kfm
    };

    beforeEach(async function() {
        await masterDB.sync({force: true});
        testResources.cleanUpTestOutputDir();
    });


    it('adds a file', async function() {
        const managerService = await StorageManager.start(root, privateKey, password, publicKey);

        expect(managerService.stores[0].bulk.records).to.be.empty;
        await managerService.addFile(fs.createReadStream(resources.lorem));

        const records = managerService.stores[0].bulk.records;
        expect(records).to.not.be.empty;
    });

    it('adds multiple files', async function() {
        const managerService = await StorageManager.start(root, privateKey, password, publicKey);

        expect(managerService.stores[0].bulk.records).to.be.empty;
        await managerService.addFile(fs.createReadStream(resources.lorem));
        await managerService.addFile(fs.createReadStream(resources.sff));
        const remainingRecords = managerService.stores[0].bulk.records;
        expect(remainingRecords.length).to.equal(2);
    });

    it('removes a file', async function() {
        const managerService = await StorageManager.start(root, privateKey, password, publicKey);
        const source = fs.createReadStream(resources.lorem);
        const record = await managerService.addFile(source);

        const wasDeleted = managerService.delete(record.uuid);
        const remainingRecords = managerService.stores[0].bulk.records
            .filter(record => record.flags.isDeleted() === false);

        expect(wasDeleted).to.be.true;
        expect(remainingRecords).to.be.empty;
    });

    it('reopens after shutdown', async function() {
        let managerService = await StorageManager.start(root, privateKey, password, publicKey);
        const insertedRecords = [];
        let record = await managerService.addFile(fs.createReadStream(resources.sff));
        insertedRecords.push(record);
        record = await managerService.addFile(fs.createReadStream(resources.lorem));
        insertedRecords.push(record);

        managerService.close(publicKey);
        managerService = await StorageManager.start(root, privateKey, password, publicKey);

        const recordsUUIDs = managerService.stores[0].bulk.records
            .filter(record => record.flags.isDeleted() === false)
            .map(record => record.uuid);
        const insertedRecordsUUIDs = insertedRecords
            .filter(record => record.flags.isDeleted() === false)
            .map(record => record.uuid);

        expect(recordsUUIDs).to.be.deep.equal(insertedRecordsUUIDs);
    });
});
