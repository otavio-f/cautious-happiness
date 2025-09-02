'use strict';

const { expect } = require('chai');
const testResources = require('../../../tests/resources/resources.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const io = require('../io.js');

// The result of all tests are contained on this file
const TARGET = path.join(testResources.output, "test.bin");

/**
 * Reads the contents of the target file
 * @returns {NonSharedBuffer}
 */
const readFile = () => {
    return fs.readFileSync(TARGET);
}

/**
 * Generates a 100 byte buffer filled with random data
 * @returns {Buffer}
 */
const genData = () => crypto.randomBytes(100);

describe("File Interface", function() {
    beforeEach(() => {
        fs.writeFileSync(TARGET, Buffer.alloc(0));
    });

    afterEach(testResources.cleanUpTestOutputDir);

    it('creates file if doesn\'t exist and writes to it', (done) => {
        if(fs.existsSync(TARGET))
            fs.rmSync(TARGET);

        const data = genData();

        const fi = new io.FileInterface(TARGET);
        const assertion = () => {
            expect(readFile()).to.deep.equal(data);
            done();
        };

        fi.write(data, {callback: assertion});
    });

    it('inserts data on empty file', (done) => {
        const data = genData();

        const fi = new io.FileInterface(TARGET);
        const assertion = () => {
            expect(readFile()).to.deep.equal(data);
            done();
        };

        fi.write(data, {callback: assertion});
    });

    it('appends data to an existing file', (done) => {
        const data = genData();

        const fi = new io.FileInterface(TARGET);
        const result = Buffer.concat([data, data]);
        const assertion = () => {
            expect(readFile()).to.deep.equal(result);
            done();
        };

        fi.write(data);
        fi.write(data, {callback: assertion});
    });

    it('partially overwrites existing file', (done) => {
        const data = genData();

        const fi = new io.FileInterface(TARGET);
        const middle = data.byteLength/2;
        const result = Buffer.concat([data.subarray(0, middle), data]);
        const assertion = () => {
            expect(readFile()).to.deep.equal(result);
            done();
        };

        fi.write(data);
        fi.write(data, {start: middle, callback: assertion});
    });

    it('reads a file', (done) => {
        const data = genData();
        fs.writeFileSync(TARGET, data);

        const fi = new io.FileInterface(TARGET);
        const assertion = (buf, readCount) => {
            expect(readCount).equal(data.byteLength);
            expect(buf).to.deep.equal(data);
            done();
        };
        fi.read(assertion);
    });

    it('partially reads file from start to an arbitrary point', (done) => {
        const data = genData();
        fs.writeFileSync(TARGET, data);

        const fi = new io.FileInterface(TARGET);
        const half = data.byteLength/2;
        const params = {amount: half};
        const assertion = (buf, readCount) => {
            expect(readCount).equal(half);
            expect(buf).to.deep.equal(data.subarray(0, half));
            done();
        };
        fi.read(assertion, params);
    });

    it('partially reads file from an arbitrary point to end of file', (done) => {
        const data = genData();
        fs.writeFileSync(TARGET, data);

        const fi = new io.FileInterface(TARGET);
        const half = data.byteLength/2;
        const assertion = (buf, readCount) => {
            expect(readCount).equal(half);
            expect(buf).to.deep.equal(data.subarray(half));
            done();
        };
        fi.read(assertion, {start: half});
    });

    it('creates a read stream on existing file', (done) => {
        const data = genData();
        fs.writeFileSync(TARGET, data);

        const fi = new io.FileInterface(TARGET);
        let buf = Buffer.allocUnsafe(0);
        fi.readStream(readStream => {
            readStream.on("readable", () => {
                const chunk = readStream.read();
                if(chunk !== null)
                    buf = Buffer.concat([buf, chunk]);
            });

            readStream.on("end", () => {
                expect(buf).to.deep.equal(data);
                done();
            });
        });
    });

    it('creates a read stream in arbitrary position to partially read a file', (done) => {
        const data = genData();
        fs.writeFileSync(TARGET, data);

        const fi = new io.FileInterface(TARGET);
        let buf = Buffer.allocUnsafe(0);
        let assertion = readStream => {
            readStream.on("readable", () => {
                const chunk = readStream.read();
                if(chunk !== null)
                    buf = Buffer.concat([buf, chunk]);
            });

            readStream.on("end", () => {
                expect(buf).to.deep.equal(data.subarray(10, 90));
                done();
            });
        };

        fi.readStream(assertion, {start: 10, end: 90});
    });


    it('creates a write stream on empty file', (done) => {
        const data = genData();

        const fi = new io.FileInterface(TARGET);
        fi.writeStream(writeStream => {
            writeStream.on("finish", () => {
                expect(readFile()).to.deep.equal(data);
                done();
            });

            writeStream.write(data);
            writeStream.end();
        });
    });

    it('creates a write stream to overwrite data of existing file', (done) => {
        // pre-writes data
        const data = genData();
        fs.writeFileSync(TARGET, data);

        // overwrites the last half with the same data
        const fi = new io.FileInterface(TARGET);
        const half = data.length/2;
        let assertion = writeStream => {
            writeStream.on("finish", () => {
                expect(readFile()).to.deep.equal(Buffer.concat([data.subarray(0, half), data]));
                done();
            });

            writeStream.write(data);
            writeStream.end();
        };

        fi.writeStream(assertion, half);
    });

    it('creates a write stream to append data to existing file', (done) => {
        // pre-writes data
        const data = genData();
        fs.writeFileSync(TARGET, data);

        // appends the same data to the file (data repeats twice)
        const fi = new io.FileInterface(TARGET);
        let assertion = writeStream => {
            writeStream.on("finish", () => {
                expect(readFile()).to.deep.equal(Buffer.concat([data, data]));
                done();
            });

            writeStream.write(data);
            writeStream.end();
        };

        fi.writeStream(assertion);
    });

    it('truncates a file to arbitrary length', (done) => {
        // pre-writes data
        const data = genData();
        fs.writeFileSync(TARGET, data);

        // truncates to half the length
        const fi = new io.FileInterface(TARGET);
        const half = data.byteLength/2;
        fi.trunc(
            half,
            () => {
                expect(readFile()).to.deep.equal(data.subarray(0, half));
                done();
            }
        );
    });

    it('removes a chunk at the end of file', (done) => {
        // pre-writes data
        const data = genData();
        fs.writeFileSync(TARGET, data);

        // truncates the last third off
        const fi = new io.FileInterface(TARGET);
        const fourth = data.byteLength/4;
        fi.trunc(
            -1 * fourth,
            () => {
                expect(readFile()).to.deep.equal(data.subarray(0, 3 * fourth));
                done();
            }
        );
    });
});