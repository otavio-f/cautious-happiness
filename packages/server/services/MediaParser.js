'use strict';

const ffmpeg = require('jsff');
const path = require("path");
const fs = require('fs');
const crypto = require('crypto');

/**
 * @typedef {{width: number, height: number, duration: number, frames: number, bitrate: number, audioBitrate: number, signatures: VideoSignatureSegment[]}} VideoInfo
 */

/**
 *
 * @param {number} [start=0]
 * @param {number} [end=0]
 * @param {string[]} [bagOfWords]
 * @constructor
 */
function VideoSignatureSegment(start, end, bagOfWords) {
    this.start = start??0;
    this.end = end??0;
    /** @type {string[]} */
    this.bagOfWords = bagOfWords??[];
}

/**
 *
 * @param {string} source
 * @returns {VideoSignatureSegment[]}
 */
VideoSignatureSegment.fromFile = (source) => {
    const content = fs.readFileSync(source, 'latin1');
    const segments = [];
    let currentSegment = new VideoSignatureSegment();

    content.split("\n")
        .map(line => line.trim())
        .forEach(line => {
            if(line === '</VSVideoSegment>') {
                segments.push(currentSegment);
                currentSegment = new VideoSignatureSegment();
            }
            if(line.startsWith('<StartFrameOfSegment>')) {
                // parse the start frame
                const frame = line.match(/(\d+)/)[1];
                currentSegment.start = Number(frame);
            }
            if(line.startsWith('<EndFrameOfSegment>')) {
                // parse the end frame
                const frame = line.match(/(\d+)/)[1];
                currentSegment.end = Number(frame);
            }
            if(line.startsWith('<BagOfWords>')) {
                // parse the 243-bit bag of words into a 0-1 string
                // TODO: parse BagOfWords into a Buffer
                const bits = line.slice(12, 740)
                    .replace(/\s/g, '')
                    .padStart(248, '0');
                currentSegment.bagOfWords.push(bits);
            }
        });
    return segments;
}

/**
 * Contains the duplicated frame intervals
 * @typedef {{ref: [number, number], cmp: [number, number]}} DuplicatedSegment
 */

/**
 * Compares two sets of segments and determines on which intervals they're equal.
 *
 * Two sets of segments are equal if more than half of the distances are less than a threshold
 * and if the cumulative sum of distances are less than the composite distances.
 * @param {VideoSignatureSegment[]} ref Reference signature segments
 * @param {VideoSignatureSegment[]} cmp Target signature segments
 * @param {number} [thd=0.15] Threshold for each segment pair.
 * @param {number} [thdc=0.75] Threshold for all pairs of segments.
 * @return {DuplicatedSegment[]}
 */
VideoSignatureSegment.getDuplicateSegments = (ref, cmp, thd, thdc) => {
    // TODO
}

/**
 * Calculate the distance between two signatures
 * @param {VideoSignatureSegment} other
 * @return {number[]} The Jaccard Distance between the two signatures
 */
VideoSignatureSegment.prototype.dist = function(other) {
    /** @type {[string, string][]} */
    const combinations = this.bagOfWords.map((b1, index) => {
        const b2 = other.bagOfWords[index];
        return [b1, b2];
    });

    /** @type {number[]} */
    const unions = combinations.map(([b1, b2]) => {
        return [...b1].reduce((acc, bit1, index) => {
            const bit2 = b2[index];
            if(bit1 === '1' || bit2 === '1')
                return acc+1;
            return acc;
        }, 0);
    });

    /** @type {number[]} */
    const intersections = combinations.map(([b1, b2]) => {
        return [...b1].reduce((acc, bit1, index) => {
            const bit2 = b2[index];
            if(bit1 === '1' && bit2 === '1')
                return acc+1;
            return acc;
        }, 0);
    });

    /** @type {number[]} */
    return intersections.map((intersectValue, index) => {
        const unionValue = unions[index];
        return 1-(intersectValue/unionValue);
    });
}


/**
 * Parse video details from source
 * Remember to pause the source read stream before calling this function and resume the stream after piping in all desired outputs
 * @param {PathLike | ReadStream} source
 * @param {PathLike} root A folder for storing temporary files
 * @returns {Promise<VideoSignatureSegment[]>} The video information
 */
exports.getVideoSignature = (source, root) => {
    const randomFile = crypto.randomBytes(8).toString('hex')+'.xml';
    const signatureOutput = path.join(root.toString(), randomFile);
    const proc = new ffmpeg.Builder()
        .input(source)
        .passes(1)
        .set("f", "null")
        .set("an")
        .set("sn")
        .set("map_metadata", "-1")
        .vf("signature", {format: "xml"}, {filename: signatureOutput})
        .build("/dev/null")[0];
    proc.start();

    return new Promise((resolve, reject) => {
        proc.on("finish", code => {
            if(code !== 0) {
                return reject(`Media Parser: FFMPEG exit with code ${code}`);
            }
            if(fs.existsSync(signatureOutput)) {
                const videoSignatures = VideoSignatureSegment.fromFile(signatureOutput);
                if(videoSignatures.length === 0)
                    return reject("Media Parser: Got corrupted video signaure file!");
                fs.rmSync(signatureOutput);
                return resolve(videoSignatures);
            }

        });
    });
}

/**
 * @typedef {{width: number, height: number, crc: string}} ImageInfo
 */

/**
 * Obtains the image CRC
 * @param {PathLike | ReadStream} source
 * @returns {Promise<string>}
 */
exports.getImageCRC = async (source) => {
    const proc = new ffmpeg.Builder()
        .input(source)
        .passes(1)
        .set("f", "null")
        .set("an")
        .set("sn")
        .set("map_metadata", "-1")
        .vf("scale", 8, 8)
        .vf("format", "gray")
        .set("f", "crc")
        .build("-")[0];
    const output = proc.start();
    output.setEncoding("utf-8");

    return new Promise((resolve, reject) => {
        proc.on("finish", code => {
            if(code !== 0) {
                return reject(`Media Parser: FFMPEG exit with code ${code}`);
            }

            const crc = /CRC=0x([a-f0-9]{8})/g.exec(output.read());
            if(crc === null) {
                return reject("Media Parser: Couldn't get image CRC!");
            }

            const result = crc[1];
            return resolve(result);
        });
    });
}

/**
 * Contains information about the stream on a media file
 * @typedef {Object} StreamInfo
 * @property {number} index The index
 * @property {"video"|"audio"|"subtitle"} type
 * @property {string} codec
 * @property {number} [width] Ommited if codec_type is not video
 * @property {number} [height] Ommited if codec_type is not video
 * @property {string} [pix_fmt] Ommited if codec_type is not video
 * @property {number} frame_count
 * @property {number} packet_count
 * @property {string} [frame_rate] Ommited if the frame_count is 1 (eg.: static images)
 * @property {number} [duration] Ommited if the frame_count is 1 (eg.: static images)
 * @property {number} [bitrate] Ommited if the frame_count is 1 (eg.: static images)
 */

/**
 * Obtains information about each stream into a media file
 * @param {string} text The textual info probed from the file
 * @returns {StreamInfo[]} A set of stream information, one for each stream
 */
const parseInfo = (text) => {
    // TODO: Try to fetch first via format, then via video/audio
    const output = JSON.parse(text);
    let duration = Number(output.format.duration);
    return output.streams.map(streamInfo => {
        if(
            streamInfo.codec_type !== "video"
            && streamInfo.codec_type !== "audio"
            && streamInfo.codec_type !== "subtitle"
        )
            return null; // unsupported codec type

        // parse basic info
        const info =  {
            index: streamInfo.index,
            type: streamInfo.codec_type,
            codec: streamInfo.codec_name,
            frame_count: Number(streamInfo.nb_read_frames),
            packet_count: Number(streamInfo.nb_read_packets)
        }

        // if the format doesn't have the duration, variable is Number(undefined) === NaN
        // try to fetch info from stream
        if(Number.isNaN(duration) && info.frame_count > 1) {
            duration = Number(streamInfo.duration);
        }

        // parse info for videos and images
        if(info.type === "video") {
            info.width = Number(streamInfo.width);
            info.height = Number(streamInfo.height);
            info.pix_fmt = streamInfo.pix_fmt;
            // video specific info
            if(info.frame_count > 1) {
                const [fps_num, fps_den] = streamInfo.r_frame_rate
                    .split('/')
                    .map(value => Number(value));
                info.frame_rate = Math.round(fps_num/fps_den)
                if(Number.isNaN(duration))
                    duration = info.frame_count / info.frame_rate;
            }
        }

        // parse info for videos and audio that has a runlength
        if(info.packet_count > 1) {
            info.duration = duration;
            const totalBitrate = output.packets
                .filter(packet => packet.stream_index === info.index)
                .reduce((sum, packet) => sum + Number(packet.size), 0);
            info.bitrate = (totalBitrate / info.duration) / 1024;
        }

        return info;
    }).filter(streamInfo => streamInfo !== null);
}

/**
 * Probes the source to obtain info about the media
 * @param {PathLike | ReadStream} source
 * @returns {Promise<StreamInfo[]>} An array of stream info objects
 */
exports.probeInfo = (source) => {
    const proc = new ffmpeg.Builder()
        .executable("ffprobe")
        .input(source)
        .passes(1)
        .set("v", "error")
        .set("count_frames")
        .set("count_packets")
        .set("show_entries", "format=duration:packet=stream_index:packet=codec_type:packet=size:stream=index:stream=codec_type:stream=codec_name:stream=width:stream=height:stream=r_frame_rate:stream=nb_read_frames:stream=nb_read_packets:stream=pix_fmt:stream=duration")
        .set("of", "json")
        .build("")[0];

    //ffprobe -v quiet -count_frames -count_packets -show_entries packet=stream_index:packet=codec_type:packet=size:stream=index:stream=codec_type:stream=codec_name:stream=width:stream=height:stream=r_frame_rate:stream=nb_read_frames:stream=nb_read_packets:stream=pix_fmt:stream=duration -of json -i
    /** @type {Readable} */
    const stdout = proc.start();
    stdout.setEncoding('utf8');
    let output = "";

    stdout.on("data", chunk => {
        if(chunk !== null)
            output += chunk.toString();
    });

    return new Promise((resolve, reject) => {
        proc.on("finish", exitCode => {
            if(exitCode !== 0)
                return reject(`Media Parser: FFPROBE exit with code ${exitCode}.`);

            const streamsInfo = parseInfo(output);
            return resolve(streamsInfo);
        });
    });
}

