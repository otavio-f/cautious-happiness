'use strict';

process.env.NODE_ENV = 'dev';

const { expect} = require('chai');
const { TagController } = require('../../controllers/TagController.js');
const { masterDB } = require('../../db/master.js');
const { Tag, Namespace } = require('../../models/tag.js');


describe('Tag Controller', function() {
    beforeEach(async function() {
        await masterDB.sync({force: true});
    });

    it('Creates a tag', async function() {
        await TagController.addTag("deleteme", "meta");

        const allTags = await Tag.findAll();
        expect(allTags).to.not.be.empty;
    });

    it('Creates many tags', async function() {
        await TagController.addTag("deleteme", "meta");
        await TagController.addTag("corrupted", "meta");
        await TagController.addTag("photo", "media");

        const allTags = await Tag.findAll();
        expect(allTags.length).to.be.equal(3);

        const allNamespaces = await Namespace.findAll();
        expect(allNamespaces.length).to.be.equal(2);
    });

    it('Deletes a tag', async function() {
        await TagController.addTag("deleteme", "meta");
        await TagController.addTag("corrupted", "meta");

        const deleteTag = await Tag.findOne({where: {value: "deleteme"}});
        const wasRemoved = await TagController.removeTag(deleteTag.id);

        expect(wasRemoved).to.be.true;
        const allTags = await Tag.findAll();
        expect(allTags.length).to.be.equal(1);
        const allNamespaces = await Namespace.findAll();
        expect(allNamespaces.length).to.be.equal(1);
    });

    it('Deletes a tag and removes orphan namespaces', async function() {
        await TagController.addTag("deleteme", "meta");
        await TagController.addTag("corrupted", "meta");
        await TagController.addTag("photo", "media");

        const photoTag = await Tag.findOne({where: {value: "photo"}});
        const wasRemoved = await TagController.removeTag(photoTag.id);

        expect(wasRemoved).to.be.true;
        const allTags = await Tag.findAll();
        expect(allTags.length).to.be.equal(2);
        const allNamespaces = await Namespace.findAll();
        expect(allNamespaces.length).to.be.equal(1);
    });

    it('Changes a tag namespace and removes orphans', async function() {
        await TagController.addTag("deleteme", "meta");
        await TagController.addTag("corrupted", "meta");
        await TagController.addTag("photo", "media");

        const photoTag = await Tag.findOne({where: {value: "photo"}});
        await TagController.changeNamespace(photoTag.id, "meta");

        const allTags = await Tag.findAll();
        expect(allTags.length).to.be.equal(3);
        const allNamespaces = await Namespace.findAll();
        expect(allNamespaces.length).to.be.equal(1);
    });
});