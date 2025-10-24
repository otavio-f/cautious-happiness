'use strict';

process.env.NODE_ENV = 'dev';

const { expect} = require('chai');
const { TagController } = require('../../controllers/TagController.js');
const { masterDB } = require('../../db/master.js');
const { Tag } = require('../../models/tag.js');


describe('Tag Controller', function() {
    beforeEach(async function() {
        await masterDB.sync({force: true});
    });

    it('Creates a tag', async function() {
        const tag = await TagController.addTag("deleteme", "meta");

        const allTags = await Tag.findAll();
        expect(allTags).to.not.be.empty;
        expect(tag.value).to.equal("deleteme");
        expect(tag.namespace).to.equal("meta");
    });

    it('Creates many tags', async function() {
        await TagController.addTag("deleteme", "meta");
        await TagController.addTag("corrupted", "meta");
        await TagController.addTag("photo", "media");

        const allTags = await Tag.findAll();
        expect(allTags.length).to.be.equal(3);
    });

    it('Refuses to create a duplicate tag', async function() {
        await TagController.addTag("deleteme", "meta");
        await TagController.addTag("deleteme", "meta")
          .then(() => fail("Shouldn't be able to create a duplicate tag"))
          .catch(async (err) => {
              expect(err.name).equal("SequelizeUniqueConstraintError");
              const allTags = await Tag.findAll();
              expect(allTags.length).to.be.equal(1);
          });
    });

    it('Deletes a tag', async function() {
        await TagController.addTag("deleteme", "meta");
        await TagController.addTag("corrupted", "meta");

        const deleteTag = await Tag.findOne({where: {value: "deleteme"}});
        const wasRemoved = await TagController.removeTag(deleteTag.id);

        expect(wasRemoved).to.be.true;
        const allTags = await Tag.findAll();
        expect(allTags.length).to.be.equal(1);
    });

    it('Changes a tag namespace', async function() {
        await TagController.addTag("deleteme", "meta");
        await TagController.addTag("corrupted", "meta");
        await TagController.addTag("photo", "media");

        const photoTag = await Tag.findOne({where: {value: "photo"}});
        await TagController.change(photoTag.id, "photo", "meta");

        const allTags = await Tag.findAll();
        expect(allTags.length).to.be.equal(3);
    });

    it('Changes a tag value', async function() {
        await TagController.addTag("deleteme", "meta");
        await TagController.addTag("corrupted", "meta");
        await TagController.addTag("photo", "media");

        const photoTag = await Tag.findOne({where: {value: "photo"}});
        await TagController.change(photoTag.id, "video", "media");

        const allTags = await Tag.findAll();
        expect(allTags.length).to.be.equal(3);
    });

    it('Refuses to change a tag that causes duplicate', async function() {
        await TagController.addTag("deleteme", "meta");
        const tag = await TagController.addTag("corrupted", "meta");

        // tries to change second tag into first
        await TagController.change(tag.id, "deleteme", "meta")
          .then(() => fail("It shouldn't be allowed to create a duplicate."))
          .catch((err) => {
              expect(err.name).equal("SequelizeUniqueConstraintError");
          });
    });
});