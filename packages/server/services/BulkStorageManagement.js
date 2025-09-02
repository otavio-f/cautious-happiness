'use strict';

const { BulkStorage } = require("bulk-storage");
const crypto = require('crypto');
const path = require("node:path");
const { StorageIndex } = require("../models/storage.js");
const dotenv = require('dotenv');

/**
 * @typedef {{maxSize: number, maxFileCount: number, fillPolicy: 'fill'|'spread'}} StorageConfig
 * @property {number} maxSize The maximum size of each Bulk Storage in gigabytes
 * @property {number} maxFileCount The maximum number of files allowed to be stored on each file storage
 * @property {'fill'|'spread'} fillPolicy When <code>'fill'</code>, will try to fill completely each storage before
 * going to the next.
 * When <code>'spread'</code>, will try to keep all storages the same size by juggling adding and removing.
 */

/**
 * @typedef {{source: PathLike, bulk: BulkStorage, filled: boolean}} BulkStorageSession
 * @property {PathLike} source The source path of the <code>BulkStorage</code>
 * @property {BulkStorage} bulk A <code>BulkStorage</code> instance
 * @property {boolean} isFilled True if no files can be added, otherwise false
 */

/**
 *
 * @param {KeyLike} privateKey
 * @param {string} password
 * @param {PathLike[]} storagePaths
 * @param {StorageConfig} config
 * @constructor
 */
const StorageManager = function(privateKey, password, storagePaths, config) {
    /** @type {BulkStorageSession[]} */
    this.stores = storagePaths.map(file => {
        const storage = BulkStorage.open(file, privateKey, password);
        return {source: file, bulk: storage};
    });
    this.config = config;
}

/**
 * Chooses the most suitable <code>BulkStorage</code> to add a file based on the configuration
 * @param {BulkStorage[]} storages The list of storages
 * @param {StorageConfig} config The configuration parameters
 * @returns BulkStorage
 */
const selectStorage = (storages, config) => {
    // first obtain the data about the bulk storage containers
    /** @type {{storage: BulkStorage, length: number, count: number}[]} */
    const storagesInfo = storages.map(storage => {
        const records = storage.records;
        return {
            storage: storage,
            length: records.reduce(
                (prev, record) => prev + record.length(),
                0n)/(2n**30n), // in gigabytes
            count: records.length
        };
    });

    // then choose which bulk storage is the most suitable to store a new file
    const chosen = storagesInfo.reduce((prev, info) => {
        // prioritize storage that isn't full or has too many files
        if(info.count < config.maxFileCount && info.length < config.maxSize) {
            if(config.fillPolicy === 'fill') {
                // if fill, then select the most full bulk storage container
                // or the one that has the most files
                if (info.length > prev.length || (info.length === prev.length && info.count > prev.count))
                    return info;
            }
            if(config.fillPolicy === 'spread') {
                // if spread, then select the least full bulk storage container
                // or the one that has the least files
                if (info.length < prev.length || (info.length === prev.length && info.count < prev.count))
                    return info;
            }
        }
        return prev;
    }, storagesInfo[0]);

    return chosen.storage;
}

/**
 * Adds the file into the storage
 * @param {ReadStream} source
 * @returns {Promise<FileRecord>}
 */
StorageManager.prototype.addFile = function(source) {
    if(this.stores.length === 0)
        throw new Error("StorageManager: Is closed!");
    const storages = this.stores.map(st => st.bulk);
    const store = selectStorage(storages, this.config);
    return store.add(source);
    // TODO: Create new BulkStorage file if the storage is full or has reached max file count
}

/**
 * Removes the file from the storage
 * @param {Buffer} uuid The uuid of the record to be deleted
 * @returns {boolean} True if the record was found and deleted, otherwise false.
 */
StorageManager.prototype.delete = function(uuid) {
    if(this.stores.length === 0)
        throw new Error("StorageManager: Is closed!");

    for (const storageSession of this.stores) {
        if(storageSession.bulk.delete(uuid))
            return true;
    }
    // TODO: Remove BulkStorage file if it's empty

    return false;
}

/**
 * Fetches a file record from the underlaying storage and produces a stream, or null if the file wasn't found.
 * @param {Buffer} uuid
 * @returns {FileRecord|null}
 */
StorageManager.prototype.getRecord = function(uuid) {
    if(this.stores.length === 0)
        throw new Error("StorageManager: Is closed!");

    for (const storageSession of this.stores) {
        const result = storageSession.bulk.records.find(record => uuid.compare(record.uuid) === 0);
        if(result !== undefined)
            return result;
    }

    return null;
}

/**
 * Fetches a file from the underlaying storage and produces a stream, or null if the file wasn't found.
 * @param {Buffer} uuid
 * @returns {Transform|null}
 */
StorageManager.prototype.getFile = function(uuid) {
    if(this.stores.length === 0)
        throw new Error("StorageManager: Is closed!");

    for (const storageSession of this.stores) {
        const result = storageSession.bulk.get(uuid);
        if(result !== null)
            return result;
    }

    return null;
}

/**
 * Optimizes the storage space, purging unused data.
 * @param {KeyLike} privateKey
 * @param {string} password
 */
StorageManager.prototype.purge = function(privateKey, password) {
    if(this.stores.length === 0)
        throw new Error("StorageManager: Is closed!");

    this.stores.forEach(storage => {
        storage.bulk.purge(privateKey, password);
    });
    // TODO: Erase storage file if it's empty
}

/**
 * Closes the storage.
 *
 * After closed, further operations will throw an error.
 */
StorageManager.prototype.close = function(publicKey) {
    if(this.stores.length === 0)
        throw new Error("StorageManager: Is closed!");
    while(this.stores.length > 0) {
        const storage = this.stores.pop();
        storage.bulk.sync(publicKey);
        storage.bulk.close();
    }
}


/**
 * Starts the bulk storage service
 * @param {PathLike} root The root folder of the <code>BulkStorage</code> containers
 * @param {KeyLike} privateKey The RSA private key used to decrypt data
 * @param {KeyLike} password The private key secret passkey
 * @param {KeyLike} publicKey The RSA public key used to encrypt data
 * @returns {Promise<StorageManager>}
 */
StorageManager.start = async function(root, privateKey, password, publicKey) {
    const config = {
        maxSize: process.env.BULK_STORAGE_MAX_SIZE_GB,
        maxFileCount: process.env.BULK_STORAGE_MAX_FILES,
        fillPolicy: process.env.BULK_STORAGE_FILL_POLICY
    }

    const files = await StorageIndex.findAll();

    if(files.length === 0) {
        const name = crypto.randomBytes(16).toString("hex") + ".data";
        BulkStorage.create(path.join(root, name), publicKey);
        await StorageIndex.create({file: name});
        files.push(...(await StorageIndex.findAll()));
    }

    const bulkStoragePaths = files.map(si => path.join(root, si.file));

    /** @type {StorageConfig} */
    const effectiveConfig = {
        maxSize: config?.maxSize??10,
        maxFileCount: config?.maxFileCount??65536,
        fillPolicy: config?.fillPolicy??'spread'
    };

    return new StorageManager(privateKey, password, bulkStoragePaths, effectiveConfig);
}

exports.StorageManager = StorageManager;
