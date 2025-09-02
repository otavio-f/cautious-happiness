const assert = require("assert");
const ffmpeg = require("../ff.js");
const path = require("path");
const fs = require("fs");


/**
 * Builder tests
 */
describe("Builder", function() {
    const input = "./tests/resources/haha.webm";
    const output = "./tests/resources/output/build.mp4";

    it("Generates sample command line, two pass conversion to 720p30 video", function() {
        const builder = new ffmpeg.Builder()
            .input(input)
            .passes(2)
            .set("c:v", "libx264")
            .set("y")
            .vf("deinterlace")
            .vf("scale", -2, 720, {"downscale": -1})
            .vf("fps", 30);

        const result = builder.build(output);

        assert.equal(result.length, 2);
        assert.deepStrictEqual(result[0].args,
            ["-hide_banner", "-loglevel", "info", "-stats",
                "-i", input,
                "-c:v", "libx264", "-y",
                "-vf", "deinterlace,scale=-2:720:downscale=-1,fps=30",
                "-an", "-sn", "-map_metadata", "-1", "-pass", "1", "-f", "null", "/dev/null"]);
        assert.deepStrictEqual(result[1].args,
            ["-hide_banner", "-loglevel", "info", "-stats",
                "-i", input,
                "-c:v", "libx264", "-y",
                "-vf", "deinterlace,scale=-2:720:downscale=-1,fps=30", "-pass", "2", output]);
    });

    it("Generates sample command line, with default passes count (one pass) conversion to 720p30 video", function() {
        const builder = new ffmpeg.Builder()
            .input(input)
            .set("c:v", "libx264")
            .set("y")
            .vf("deinterlace")
            .vf("scale", -2, 720, {"downscale": -1})
            .vf("fps", 30);

        const result = builder.build(output);
        assert.equal(result.length, 1);
        assert.deepStrictEqual(result[0].args,
            ["-hide_banner", "-loglevel", "info", "-stats",
                "-i", input,
                "-c:v", "libx264", "-y",
                "-vf", "deinterlace,scale=-2:720:downscale=-1,fps=30", output]);
    });

});

/**
 * Transcoder tests
 */
describe("Transcoder", function() {
    const input = "./tests/resources/haha.webm";
    const output = "./tests/resources/output/build.mp4";
    const progressRegex = /^frame=\s*(\d*).*?time=(\d\d):(\d\d):(\d\d).(\d\d).*$/gm;

    /**
     * Parses a status line
     * @param {RegExpExecArray} search
     * @returns {{frame: number, time: number}|null}
     */
    const lineToTime = (search) => {
        // clean up data
        const result = search
            .filter((_, index) => index !== 0)
            .map(value => Number(value.trim()));

        // generate frame count and current time progress
        const frame = result[0];
        const time = (3600*result[1]) + (60*result[2]) + result[3] + (result[4]/100);
        return {frame, time};
    }

    afterEach(() => {
        if(fs.existsSync(output))
            fs.rmSync(output);
    });

    this.timeout(15_000); // long timeout to allow transcode to complete
    it("Process video conversion", async function() {
        const encoders = new ffmpeg.Builder()
            .input(input)
            .passes(2)
            .set("y")
            .set("c:v", "libx264")
            .set("b:v", "50K")
            .set("preset", "veryslow")
            .vf("scale", -2, 144, {"force_original_aspect_ratio": "decrease"}, {"force_divisible_by": 8})
            .vf("fps", 12)
            .build(output);

        for (const exec of encoders) {
            const resultCode = await new Promise(resolve => {
                exec.start();
                exec.on("finish", end => resolve(end));
            });

            assert.equal(resultCode, 0);
        }
    });

    it("Delivers command output correctly", async function() {
        const encoders = new ffmpeg.Builder()
            .input(input)
            .passes(1)
            .set("y")
            .set("an")
            .set("sn")
            .set("map_metadata", -1)
            .set("f", "crc")
            .vf("scale", -2, 144, {"force_original_aspect_ratio": "decrease"}, {"force_divisible_by": 8})
            .vf("fps", 5)
            .build("-");

        for (const exec of encoders) {
            await new Promise(resolve => {
                exec.on("finish", end => resolve(end));
                /**@type {Readable}*/
                const output = exec.start();
                output.once("readable", () => {
                    const chunk = output.read();
                    assert.equal(chunk.toString(), "CRC=0x758f0d1f\n");
                })
            });
        }
    });

    it("Fails to convert with invalid command line options", function(done) {
        const encoder = new ffmpeg.Builder()
            .input("../nonexistant.mp4") // this file shouldn't exist
            .passes(1)
            .set("y")
            .set("c:v", "libx264")
            .set("crf", 30)
            .set("preset", "ultrafast")
            .vf("scale", -2, 144, {"force_original_aspect_ratio": "decrease"}, {"force_divisible_by": 8})
            .vf("fps", 5)
            .build(output)[0];

        // start process
        // wait for "finish" event
        // check if the code is different from zero
        encoder.on("finish", (end) => {
            assert.notEqual(end.code, 0);
            done();
        });

        encoder.start();
    });

    it("Monitors the process output", function(done) {
        const encoder = new ffmpeg.Builder()
            .input(input)
            .passes(1)
            .set("y")
            .set("c:v", "libx264")
            .set("crf", 30)
            .set("preset", "ultrafast")
            .vf("scale", "-2", "144", {"force_original_aspect_ratio": "decrease"}, {"force_divisible_by": 8})
            .vf("fps", 24)
            .watchFor("progress", progressRegex, lineToTime)
            .build(output)[0];

        // verify if the frame and time go ascending
        let lastProgress = {frame: -1, time: -1};
        encoder.on("info_match", (name, progress) => {
            if(name !== "progress")
                return;
            const isAscending = progress.time > lastProgress.time
                || progress.frame > lastProgress.frame;
            assert.ok(isAscending);
            lastProgress = progress;
        });

        encoder.on("finish", () => done());
        encoder.start();
    });

    it("Transcodes from a stream source", function(done) {
        const inputStream = fs.createReadStream(input);
        const encoder = new ffmpeg.Builder()
            .input(inputStream)
            .passes(1)
            .set("y")
            .set("c:v", "libx264")
            .set("crf", 30)
            .set("preset", "ultrafast")
            .vf("scale", "-2", "144", {"force_original_aspect_ratio": "decrease"}, {"force_divisible_by": 8})
            .vf("fps", 24)
            .build(output)[0];

        encoder.on("finish", (code) => {
            assert.equal(code, 0);
            done();
        });

        encoder.start();
    });

    it("Transcodes from stream into a stream", function(done) {
        const inputStream = fs.createReadStream(input);
        /** @type {FFMPEGProcess} */
        const encoder = new ffmpeg.Builder()
            .input(inputStream)
            .passes(1)
            .set("y")
            .set("c:v", "libx264")
            .set("crf", 30)
            .set("preset", "ultrafast")
            .vf("scale", "-2", "144", {"force_original_aspect_ratio": "decrease"}, {"force_divisible_by": 8})
            .vf("fps", 24)
            .set("f", "matroska") // don't forget to add the output format, or it won't work!
            .build("-")[0];

        encoder.on("finish", (code) => {
            assert.equal(code, 0);
            assert.ok(fs.existsSync(output));
            assert.ok(fs.statSync(output).size > 0);
            done();
        });

        const outputFile = fs.createWriteStream(output);
        encoder.start().pipe(outputFile);
    });
});