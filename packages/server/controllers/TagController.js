'use strict';

const { Tag} = require('../models/tag.js');

/**
 * @constructor
 */
function TagController() { }

/**
 *
 * @param {string} value
 * @param {string} namespace
 * @returns {Promise<Tag>} The created tag
 */
TagController.addTag = async (value, namespace) => {
    return await Tag.create({value, namespace});
}

/**
 * Removes the tag by id or name
 * @param {number} id The tag id or name
 * @returns {Promise<boolean>} true if removed the tag, otherwise false
 */
TagController.removeTag = async (id) => {
    const result = await Tag.destroy({
        where: {id}
    });

    return result > 0;
}

/**
 *
 * @param {number} id
 * @param {string} value
 * @param {string} namespace
 * @returns {Promise<void>}
 */
TagController.change = async (id, value, namespace) => {
    const tag = await Tag.findByPk(id);
    if(tag === null)
        throw new Error(`TagController: Tag with id ${id} not found!`);

    tag.value = value;
    tag.namespace = namespace;
    await tag.save();
}

/** @typedef {{id: number, value: string, namespace: string}} TagObject */
/**
 * Retrieves tags by a condition
 * @param {(TagObject) => boolean} condition
 * @returns {Promise<TagObject[]>}
 */
TagController.filterBy = async (condition) => {
    const allTags = await Tag.findAll({
        where: {}
    });
    const result = [];
    for(const tag of allTags) {
        const namespace = await tag.getNamespace();
        const tagObj = {id: tag.id, value: tag.value, namespace: namespace.value};
        if(condition(tagObj))
            result.push();
    }
    return result;
}

exports.TagController = TagController;
