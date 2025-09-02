'use strict';

const fs = require('fs');

/**
 * @callback done Called when the I/O task ends
 */

/**
 * @callback ioOP I/O Task to be executed
 * @param {done} done function that must be called when the task finishes
 */

/**
 * @typedef {"read"|"append"|"write"|"critical"} OpType
 */

/**
 * Specifies an I/O operation
 * @typedef Task
 * @property {OpType} type - Operation type: read or write.
 * @property {ioOP} exec - Task to execute.
 * @property {number} timeout - The maximum time allowed for the function to run. Zero or lower means the operation doesn't have a time limit.
 */

function IOQueue() {
    /**
     * Queue of tasks to be executed
     * @type {Task[]}
     * @private
     */
    const _waiting = [];
    /**
     * Queue of tasks in progress
     * @type {Task[]}
     * @private
     */
    const _inProgress = [];

    /**
     * Executes the next operation on the queue
     */
    const doNext = () => {
        if(_waiting.length === 0)
            return; // no more io tasks

        const task = _waiting.pop();
        if(task.timeout > 0) {
            setTimeout(
                () => {throw new Error("IOQueue: Task Timeout!");},
                task.timeout
            );
        }
        task.exec(doNext);

        // TODO: change to concurrency model with in-execution list of ops
        // concurrency model:
        //  - any number of reads can execute at the same time;
        //  - only one write can execute at a time, after all current read operations conclude. No other operation is allowed until the current write operation finishes;
    }

    /**
     * Sorts the operation
     * @param {Task} task
     */
    const juggle = (task) => {
        _inProgress.push(task);
        switch(task.type) {
            case "critical":
                break;
            case "append":
                break;
            case "write":
                break;
            case "read":
            default:
                task.exec(done => _inProgress);
                // how to delete item from list?
        }
        _inProgress.push(task);
        if(_inProgress.length === 0); // TODO

    }

    /**
     * Adds an operation to this queue
     * @param {OpType} type The type of the operation.
     * @param {ioOP} exec The function to execute.
     * @param {number} [timeout=0] The maximum time allowed for the function to run. Values lower than zero mean the operation doesn't have a time limit.
     */
    this.add = (type, exec, timeout) => {
        const length = _waiting.push({type, exec, timeout: timeout??0});
        if(length === 1) // execute the first op if queue was empty
            doNext();
    }
}

/**
 * Interface for r/w operations on a file
 * @param {string} path The path of the file to be written
 * @constructor
 */
function FileInterface(path) {
    Object.defineProperty(this, "fd", {
        value: fs.openSync(path, fs.existsSync(path)?"r+":"w+"),
        writable: false
    });
    this._queue = new IOQueue();

    let _closed = false;
    this.isClosed = () => _closed;

    /**
     * Closes this file interface. Further operations will throw an error.
     * @param {boolean} [force=false] - Do not wait any pending operations finish before forcefully closing the pointer. Defaults to false.
     */
    this.close = (force) => {
        if(_closed)
            throw new Error("This file is already closed!");
        if(force) {
            fs.closeSync(this.fd);
            _closed = true;
        } else {
            this._queue.add("critical", done => {
                fs.closeSync(this.fd);
                done();
                _closed = true;
            });
        }
    };

}

/**
 * @callback readHandler
 * @param {Buffer} data - Raw data read from source
 * @param {number} readCount - The amount of bytes read. It can be less than the buffer length in case EOF was encountered
 */

/**
 * @typedef ReadParams
 * @property {number | bigint} [start] The position to start reading, relative to the start of the file.
 * @property {number | bigint} [amount] Number of bytes to read.
 */

/**
 * Reads bytes from source
 *
 * @param {readHandler} callback - Function to handle the resulting data
 * @param {ReadParams} [params = {start: 0, amount: length-start}] Parameters for reading. Defaults to read from the start of the file to the end.
 */
FileInterface.prototype.read = function(callback, params) {
    if(this.isClosed())
        throw new Error("File descriptor was closed!");

    let {start, amount} = params??{};
    start = Number(start??0);

    const fileSize = fs.fstatSync(this.fd).size;
    if(start < 0 || start > fileSize)
        throw new Error("Invalid starting position!");

    amount = Number(amount??(fileSize - start));
    const data = Buffer.allocUnsafe(amount);
    this._queue.add("read", (done) => {
        const length = fs.readSync(this.fd, data, {position: start});
        done();
        callback(data, length);
    });
}

/**
 * @callback writeHandler
 * @param {number} writeCount - The amount of bytes written.
 */

/**
 * @typedef WriteParams
 * @property {number | bigint} [start] The position to write the data.
 * @property {writeHandler} [callback] Function called after the write operation ends, receiving the number of bytes written.
 */

/**
 * Writes to source
 *
 * @param {Buffer} data The data to be written
 * @param {WriteParams} [params = {start: EOF, callback: undefined}] Parameters for writing. By default, writes to the end of the file and does nothing after writing.
 */
FileInterface.prototype.write = function(data, params) {
    if(this.isClosed())
        throw new Error("File descriptor was closed!");

    const {start, callback} = params??{};
    const doAppend = (start === undefined) || (start < 0) || (start >= fs.fstatSync(this.fd).size);
    this._queue.add(doAppend?"append":"write", (done) => {
        let length = data.byteLength;
        if(doAppend) {
            fs.appendFileSync(this.fd, data);
        } else {
            length = fs.writeSync(this.fd, data, 0, data.byteLength, Number(start) ?? 0);
        }

        done();
        callback?.(length);
    });
}

/**
 * @callback writeStreamHandler
 * @param {fs.WriteStream} stream - Stream ready to write
 */

/**
 * Creates a stream for writing data
 * @param {writeStreamHandler} cb Callback to handle the resulting data
 * @param {number | bigint} [start = EOF] The position to start writing. If not specified, will append data to the end of the file.
 */
FileInterface.prototype.writeStream = function(cb, start) {
    if(this.isClosed())
        throw new Error("File descriptor was closed!");

    this._queue.add(start && "write" || "append", (done) => {
        const stream = fs.createWriteStream(null, {
            fd: this.fd,
            autoClose: false,
            highWaterMark: 64*1024,
            start: Number(start??fs.fstatSync(this.fd).size),
            emitClose: true
        });
        cb(stream);
        stream.once("finish", done);
    });
}

/**
 * @callback readStreamHandler
 * @param {fs.ReadStream} stream - Stream ready to read
 */

/**
 * @typedef ReadStreamParams
 * @property {number | bigint} [start] The position to start reading, relative to the start of the file.
 * @property {number | bigint} [end] Number of bytes to read.
 */

/**
 * Creates a stream for reading data
 *
 * @param {readStreamHandler} cb Callback to handle the read stream
 * @param {ReadStreamParams} [params = {start:0, end: undefined}] Parameters for the reading. Defaults to read from the start of the file to the end
 */
FileInterface.prototype.readStream = function(cb, params) {
    if(this.isClosed())
        throw new Error("File descriptor was closed!");

    const {start, end} = params??{};

    this._queue.add("read", (done) => {
        const stream = fs.createReadStream(null, {
            fd: this.fd,
            autoClose: false,
            highWaterMark: 64*1024,
            start: Number(start??0),
            end: (end===undefined) ? end : Number(end)-1, // sub one to read like readSync
            emitClose: true
        });
        cb(stream);
        stream.once("end", done);
    });
}

/**
 * Truncates this file to the specified size
 * @param {number|bigint} size The final size of the file in bytes. Zero will empty the file, and negative values will remove the number of bytes from the file end instead.
 * @param {done} [cb = undefined] Function to call after the operation is done. Defaults to nothing
 */
FileInterface.prototype.trunc = function(size, cb) {
    if(this.isClosed())
        throw new Error("File descriptor was closed!");
    const currentLength = fs.fstatSync(this.fd).size;

    // There's nothing to truncate
    if(size >= currentLength)
        return;

    // Specifying negative length bigger than file size will truncate all bytes starting from file tail
    // so, is the same as specifying 0 (empty the file)
    if(size < -currentLength)
        size = 0

    const newLength = size < 0 ? currentLength + Number(size) : Number(size);
    this._queue.add("w", (done) => {
        fs.ftruncateSync(this.fd, newLength);
        cb?.();
        done();
    });
}

module.exports = exports = (process.env.NODE_ENV.toLowerCase().includes("dev"))
    ?{ FileInterface,  IOQueue }
    :{ FileInterface };
