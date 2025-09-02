'use strict';

const { Tag, Namespace } = require('../models/tag.js');

/**
 * @constructor
 */
exports.TagController = function() {

    /**
     *
     * @param {string} value
     * @param {string} namespace
     */
    this.addTag = async (value, namespace) => {
        const [namespaceFound, _] = await Namespace.findOrCreate(
            {
                where: {value: namespace},
                defaults: {value: namespace}
            });

        await Tag.create({
                value: value,
                namespace: namespaceFound.id
            });
    }

    /**
     * Deletes namespace if it has no tags associated
     * @param {number} id The numeric id of the namespace
     */
    const cleanupNamespace = async (id) => {
        const relatedTags = await Tag.findAll({
            where: {namespace: id}
        });

        const isOrphan = (relatedTags.length === 0);
        if(isOrphan)
            return await Namespace.destroy({where: {id}});
        return 0;
    }

    /**
     * Removes the tag by id or name
     * @param {number} id The tag id or name
     * @returns {Promise<boolean>} true if removed the tag, otherwise false
     */
    this.removeTag = async (id) => {
        const tag = await Tag.findByPk(id);

        if(tag === null)
            return false;

        const namespaceID = (await tag.getNamespace()).id;
        await Tag.destroy({
            where: {id: tag.id}
        });

        await cleanupNamespace(namespaceID);

        return true;
    }

    /**
     *
     * @param {number} id
     * @param {string} namespace
     * @returns {Promise<void>}
     */
    this.changeNamespace = async (id, namespace) => {
        const tag = await Tag.findByPk(id);
        if(tag === null)
            throw new Error(`TagController: Tag with id ${id} not found!`);

        const oldNamespace = await tag.getNamespace();
        const [namespaceFound, _] = await Namespace.findOrCreate(
            {
                where: {value: namespace},
                defaults: {value: namespace}
            });
        tag.setNamespace(namespaceFound.id);
        await tag.save();
        await cleanupNamespace(oldNamespace.id);
    }

    /** @typedef {{id: number, value: string, namespace: string}} TagObject */
    /**
     * Retrieves tags by a condition
     * @param {(TagObject) => boolean} condition
     * @returns {Promise<TagObject[]>}
     */
    this.filterBy = async (condition) => {
        const allTags = await Tag.findAll();
        const result = [];
        for(const tag of allTags) {
            const namespace = await tag.getNamespace();
            const tagObj = {id: tag.id, value: tag.value, namespace: namespace.value};
            if(condition(tagObj))
                result.push();
        }
        return result;
    }
}
