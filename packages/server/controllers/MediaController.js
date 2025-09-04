'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const MediaParser = require('../services/MediaParser.js');
const { StorageManager } = require('../services/BulkStorageManagement.js');
const { Media } = require('../models/media/media.js');
const { Image } = require('../models/media/image.js');
const { Video } = require('../models/media/video.js');
const { Audio } = require('../models/media/audio.js');
const { Application } = require('../models/media/application.js');
const { Archive } = require('../models/media/archive.js');
const { Text } = require('../models/media/text.js');
const { Thumbnail } = require('../models/media/thumbnail.js');


/**
 * Saves the stream into a temporary file
 * @param {ReadStream} source The source media file
 * @param {string} [folder='.'] The folder to save the temporary file. Defaults to the current folder.
 * @returns {Promise<string>} The temporary file
 */
const saveTempFile = async (source, folder) => {
    const filename = crypto.randomBytes(8).toString('hex');
    const tempFile = path.join(folder??'.', filename);
    const output = fs.createWriteStream(tempFile, {flags: 'w', encoding: null});
    source.pipe(output);

    return new Promise((resolve, reject) => {
        source.on("end", () => {
            resolve(path.resolve(tempFile));
        });
        source.on("error", () => {
            reject("An error occurred while saving the file to disk.");
        });
    });
}

/**
 * Gathers information and builds a video model
 * @param source
 * @param root
 * @returns {Promise<Video>}
 */
const buildVideoModel = async (source, root) => {
    const [streams, videoSignatures] = await Promise.all(
        [MediaParser.probeInfo(source), MediaParser.getVideoSignature(source, root)]
    );
    const videoStream = streams.find(stream =>
        stream.type === "video" && stream.duration !== undefined
    );
    const audioStream = streams.find(stream => stream.type === "audio");
    return Video.build({
        codec: videoStream.codec,
        pixelFormat: videoStream.pix_fmt,
        width: videoStream.width,
        height: videoStream.height,
        frames: videoStream.frame_count,
        fps: videoStream.frame_rate,
        duration: videoStream.duration,
        bitrate: videoStream.bitrate,
        audioCodec: audioStream?.codec,
        audioBitrate: audioStream?.bitrate??0
    });
}

/**
 * Gathers information and builds a image model
 * @param source
 * @returns {Promise<Image>}
 */
const buildImageModel = async (source) => {
    const [streams, crc] = await Promise.all(
        [MediaParser.probeInfo(source), MediaParser.getImageCRC(source)]
    );
    const imageStream = streams.find(
        stream => stream.type === "video" && stream.frame_count === 1
    );
    return Image.build({
        codec: imageStream.codec,
        pixelFormat: imageStream.pix_fmt,
        width: imageStream.width,
        height: imageStream.height,
        signature: crc
    });
}

/**
 * Gathers information and builds an audio model
 * @param source
 * @returns {Promise<Audio>}
 */
const buildAudioModel = async (source) => {
    const streams = await MediaParser.probeInfo(source);
    const audioStream = streams.find(stream => stream.type === "audio");
    const albumCover = streams.find(stream =>
        stream.type === "video" && stream.frame_count === 1
    );
    return Audio.build({
        codec: audioStream.codec,
        duration: audioStream.duration,
        bitrate: audioStream.bitrate,
    });
}

/**
 * Fired when media entry is added to the database, after the media was added to the bulk storage
 * @event MediaController#media_created
 * @type void
 */

/**
 * Fired when the source file is saved to disk
 * @event MediaController#on_disk
 * @type void
 */

/**
 *
 * @param {StorageManager} bulkStorageManager
 * @constructor
 */
exports.MediaController = function (bulkStorageManager) {
    /**
     * Register a media into the records
     * @param {User} owner The owner of the media
     * @param {ReadStream} source The file source
     * @param {string} mime The mime type of the source
     * @param {string} [tempDir=env.TEMP_DIR] Directory for storing temporary files
     * @returns {Promise<Application | Archive | Audio | Image | Text | Video>} the media record
     */
    this.store = async (owner, source, mime, tempDir) => {
        const [mimeType, mimeSubType] = mime.split('/');

        source.pause();
        const tempFile = saveTempFile(source, tempDir??process.env.TEMP_DIR);
        const bulkStorage = bulkStorageManager.addFile(source);

        /** @type {Promise<Video|Audio|Image>} */
        let details;
        switch(mimeType) {
            case "audio":
                details = buildAudioModel(source);
                break;
            case "video":
                details = buildVideoModel(source, tempDir??process.env.TEMP_DIR);
                break;
            case "image":
                details = buildImageModel(source);
                break;
            default:
                throw new Error("Media Control: Unsupported media type!")
            // TODO: Get details for text, archive and application
        }
        source.resume();

        // TODO: Implement Fail event
        // TODO: Track progress through events:
        //  (failed to be) added to bulk storage
        //  copied to temp location
        //  generated hashes
        //  created media
        //  created details
        const tempFilePath = await tempFile;
        const record = await bulkStorage;
        let newMedia = Media.create({
            uuid: record.uuid,
            mediaType: mimeType.toLowerCase(),
            fileType: mimeSubType.toLowerCase(),
            dateAdded: Date.now(),
            owner: owner.id
        });

        const model = await details;
        model.setMedia(await newMedia);

        fs.rmSync(tempFilePath);

        return model.save();
    }

    /**
     * Deletes the media from the database
     * @param {Buffer} uuid
     * @returns {Promise<boolean>} true if the media was deleted, otherwise false
     */
    this.remove = async (uuid) => {
        const result = await Media.destroy({
            where: {uuid}
        });
        return (result>0) && bulkStorageManager.delete(uuid);
    }

    /**
     * Fetches the file by uuid
     * @param uuid
     * @returns {Transform|null}
     */
    this.getFile = (uuid) => {
        return bulkStorageManager.getFile(uuid);
    }

    /**
     *
     * @param filter
     * @returns {Promise<void>}
     */
    this.filterBy = async (filter) => {
        const all = await Media.findAll();
        // TODO
    }
}
