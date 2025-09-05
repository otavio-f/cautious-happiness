'use strict';

const testResources = require('../../../../tests/resources/resources.js');
const { expect } = require('chai');
const fs = require('fs');
const { BulkStorage } = require('bulk-storage');
const { User } = require('../../models/user.js');
const { Media } = require('../../models/media/media.js');
const { MediaController } = require('../../controllers/MediaController.js');
const { StorageManager } = require('../../services/BulkStorageManagement.js');
const { genRandom, hashPassword } = require('../../utils/utils.js');
const {masterDB} = require("../../db/master.js");


describe("Media Controller", function() {
    this.timeout(30_000);

    /**@type { StorageManager } */
    let storageManager;
    let owner;

    afterEach("Delete test files", testResources.cleanUpTestOutputDir);

    beforeEach("Creates test resources", async () => {
        await masterDB.sync({force: true});
        const password = genRandom('bin', 32);
        const {publicKey, privateKey} = BulkStorage.genKey(password);
        storageManager = await StorageManager.start(testResources.output, privateKey, password, publicKey);

        const {hash: userPass, salt} = await hashPassword("12345");
        owner = await User.create({
            username: "test",
            password: userPass,
            salt,
            level: 10
        });
    });

    it("Saves new media", async () => {
        const controller = new MediaController(storageManager);
        const source = fs.createReadStream(testResources.files.haha);

        const media = await controller.store(owner, source, "video/webm");

        expect(media).to.not.be.undefined;
        const allRecords = await Media.findAll();
        expect(allRecords).to.not.be.empty;
    });

    it("Removes media", async () => {
        const controller = new MediaController(storageManager);
        const source = fs.createReadStream(testResources.files.haha);
        const video = await controller.store(owner, source, "video/webm");

        const media = await video.getMedia();
        const hasRemoved = await controller.remove(media.uuid);

        const allRecords = await Media.findAll();
        expect(allRecords).to.be.empty;
    });
})