'use strict';

const os = require('os');
const {spawn} = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');

/**
 * Pattern to match and convert the FFMPEG standard error output
 * @typedef {{name: string, regex: RegExp, converter: (RegExpExecArray) => any}} Monitor
 */

/**
 * Transcoding warning event, contains the warn content
 * @event FFMPEGProcess#warn
 * @type {string}
 */

/**
 * Transcoding ending event, contains the process exit code
 * @event FFMPEGProcess#finish
 * @type {number}
 */

/**
 * Transcoding monitor event, contains the name of the monitor and the converted result of the match
 * @event FFMPEGProcess#info_match
 * @type {[string, any]} The name and the result of the conversion
 */

/**
 * @typedef {EventEmitter & FFMPEGProcessStarter} FFMPEGProcess
 */

/**
 * @param {PathLike} executable
 * @param {string[]} args
 * @param {Monitor[]} monitors
 * @param {ReadStream} [sourceStream]
 * @constructor
 * @augments {EventEmitter}
 */
function FFMPEGProcessStarter(executable, args, monitors, sourceStream) {
    EventEmitter.call(this);

    /**
     * The executable path
     * @type {string}
     */
    Object.defineProperty(this, "executable", {
        value: executable.toString(),
        writable: false
    });

    /**
     * List of arguments
     * @type {string[]}
     */
    Object.defineProperty(this, "args", {
        get() {return [...args];}
    });

    /**
     * List of monitoring expressions
     * @type {Monitor[]}
     */
    Object.defineProperty(this, "monitors", {
        get() {return [...monitors];}
    });

    /**
     * Source stream. Undefined if the source file is specified in the arguments
     * @type {ReadStream|undefined}
     */
    Object.defineProperty(this, "sourceStream", {
        value: sourceStream,
        writable: false
    });
}

FFMPEGProcessStarter.prototype = EventEmitter.prototype;
FFMPEGProcessStarter.constructor = FFMPEGProcessStarter;

/**
 * Starts the transcoding process
 * @fires FFMPEGProcess#warn
 * @fires FFMPEGProcess#finish
 * @fires FFMPEGProcess#info_match
 * @returns {Readable} The ffmpeg process stdout
 */
FFMPEGProcessStarter.prototype.start = function() {
    const process = spawn(this.executable, this.args);

    this.sourceStream?.pipe(process.stdin);

    const lines = readline.createInterface({input: process.stderr});
    lines.on('line', line => {
        let used = false;
        this.monitors.forEach(({name, regex, converter}) => {
            const match = regex.exec(line);
            if(match !== null) {
                used = true;
                const result = converter(match);
                this.emit("info_match", name, result);
            }
        });
        if(!used)
            this.emit("warn", line);
    });

    process.on("exit", code => {
        lines.close();
        this.emit("finish", code??-1);
    });

    return process.stdout;
}

/**
 * @typedef {{[key: string]: string|number}|string|number} VideoFilterParams
 */

/**
 * A simple video filter
 * @param {string} name
 * @param {VideoFilterParams} args
 * @constructor
 */
function VideoFilter(name, ...args) {
    const parameters = new Map(
        args.map(option => {
            let key;
            let value;
            switch(typeof option) {
                case 'number':
                case 'string':
                    key = Symbol("key");
                    value = option.toString();
                    break;
                case 'object':
                    key = Object.keys(option)[0];
                    value = option[key].toString();
                    break;
                default:
                    throw new Error(`Option ${option} doesn't have a valid type!`);
            }
            return [key, value];
        })
    );

    /**
     * Creates a readable text from this filter
     * @returns {`${string}=${string}`|string}
     */
    this.toString = () => {
        if(parameters.size === 0)
            return `${name}`;

        const filters = [...parameters.entries()].map(
            ([key, value]) => (typeof key === "symbol") ? value : `${key}=${value}`
        );

        return `${name}=${filters.join(":")}`
    }

}

// The default ffmpeg executable name
const DEFAULT_FFMPEG = os.platform() === "win32"?"ffmpeg.exe":"ffmpeg";

const IGNORE_PARAMS = [
    "-hide_banner",
    "-loglevel",
    "-stats"
];

/**
 * FFMPEG Command Builder
 * @constructor
 */
function FFMPEGCommandBuilder() {
    this._executable = DEFAULT_FFMPEG;
    this._passCount = 1;
    this._args = ['-hide_banner', '-loglevel', 'info', '-stats'];
    /** @type {VideoFilter[]} */
    this._filters = [];
    /** @type {Monitor[]} */
    this._monitors = [];
    /** @type {ReadStream} */
    this._sourceStream = null;
}

/**
 * Adds a monitor to the process output
 * @param {string} name Identifier for the regex
 * @param {RegExp} regex Regular expression to filter the process verbose messages
 * @param {(RegExpExecArray) => any} converter Converts the regular expression groups to the desired data type
 * @returns {FFMPEGCommandBuilder}
 */
FFMPEGCommandBuilder.prototype.watchFor = function(name, regex, converter) {
    this._monitors.push({name, regex, converter});
    return this;
}

/**
 * Adds an option with an optional value to the command being built
 * @param {string} option The parameter to be added
 * @param {(string|number)?} value The value of the parameter, optional
 * @returns {FFMPEGCommandBuilder}
 */
FFMPEGCommandBuilder.prototype.set = function(option, value) {
    const opt = "-" + option.toLowerCase();

    // ignore logging params
    if(IGNORE_PARAMS.includes(opt))
        return this;

    this._args.push(opt);
    if(value !== undefined)
        this._args.push(value.toString());

    return this;
}

/**
 * Adds a new input file to the transcoder
 * @param {PathLike|ReadStream} source The path of source
 * @memberOf FFMPEGCommandBuilder
 * @returns {FFMPEGCommandBuilder}
 */
FFMPEGCommandBuilder.prototype.input = function(source)  {
    if(typeof(source) === 'string')
        this._args.push("-i", source);
    else {
        this._sourceStream = source;
        if(this._sourceStream !== null)
            this._args.push("-i", "-");
    }

    return this;
}

/**
 * Adds a video filter to the command being built
 * @param {string} filter The filter name
 * @param {...VideoFilterParams} params The parameter lister for the filter
 * @returns {FFMPEGCommandBuilder}
 */
FFMPEGCommandBuilder.prototype.vf = function(filter, ...params) {
    this._filters.push(new VideoFilter(filter, ...params));
    return this;
}

/**
 * Sets the ffmpeg executable path
 * @param {string} path path of the ffmpeg executable
 * @memberOf FFMPEGCommandBuilder
 * @returns {FFMPEGCommandBuilder}
 */
FFMPEGCommandBuilder.prototype.executable = function(path) {
    this._executable = path;
    return this;
}

/**
 * Sets the number of passes to be performed
 * @param {number} count number of passes, depeding on the encoder used it can be only 1 or 2
 * @memberOf FFMPEGCommandBuilder
 * @returns {FFMPEGCommandBuilder}
 */
FFMPEGCommandBuilder.prototype.passes = function(count) {
    if(count < 1)
        throw new Error(`FFMPEG: Value of ${count} is not a valid pass count!`);
    if(this._sourceStream !== null && count !== 1)
        throw new Error("FFMPEG: Reading from stream is only compatible with one pass!");
    this._passCount = count;
    return this;
}

/**
 * Builds a transcoder
 * @param {string} output The output path
 * @returns {FFMPEGProcess[]} A set of transcoders ready to be executed,
 * multiple if multiple passes were configured
 */
FFMPEGCommandBuilder.prototype.build = function(output) {
    const filterResult = this._filters.map(filter => filter.toString());
    if(this._passCount === 1) {
        let finalArgs = this._args;
        if(filterResult.length > 0)
            finalArgs = this._args.concat("-vf", filterResult.join(","), output);
        if(this._sourceStream === null)
            return [new FFMPEGProcessStarter(this._executable, finalArgs, this._monitors)];
        else
            return [new FFMPEGProcessStarter(this._executable, finalArgs, this._monitors, this._sourceStream)];
    }

    const baseArgs = this._args.concat("-vf", filterResult.join(","));
    const passCommands = Array.from({length: this._passCount-1}, (_, passNum) => {
        const args = baseArgs.concat(
            "-an", "-sn", "-map_metadata", "-1",
            "-pass", `${passNum+1}`, "-f", "null", "/dev/null");
        return new FFMPEGProcessStarter(this._executable, args, this._monitors);
    });

    const finalArgs = baseArgs.concat("-pass", `${this._passCount}`, output);
    passCommands.push(new FFMPEGProcessStarter(this._executable, finalArgs, this._monitors));
    return passCommands;
}

exports.Builder = FFMPEGCommandBuilder;
