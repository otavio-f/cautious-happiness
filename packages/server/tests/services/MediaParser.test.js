'use strict';

process.env.NODE_ENV = 'dev';

const { expect } = require('chai');
const { getVideoSignature, getImageCRC, probeInfo } = require('../../services/MediaParser.js');
const fs = require('fs');
const testResources = require('../../../../tests/resources/resources.js');


describe('Media Parser', function() {
    const target = testResources.files.house;
    const temp = testResources.output;

    this.timeout(20_000);
    it('Parses Video Signature', async () => {
        const input = fs.createReadStream(target);
        const videoSignatures = await getVideoSignature(input, temp);

        expect(videoSignatures).to.not.be.empty;
        videoSignatures.forEach(signature => {
            expect(signature.bagOfWords.length).to.be.equal(5);
            signature.bagOfWords.forEach(bow => {
                expect(bow).to.match(/[01]{243}/g);
            });
        });
    });

    it('Video should be identical to itself', async () => {
        const input = fs.createReadStream(target);
        const videoSignatures = await getVideoSignature(input, temp);

        videoSignatures.forEach(signature => {
            const dist = signature.dist(signature);
            expect(dist).to.deep.equal([0, 0, 0, 0, 0]);
        });
    });

    it('Parses Image CRC', async () => {
        const input = fs.createReadStream(target);
        const crc = await getImageCRC(input);

        expect(crc).to.equal("1ddde93b");
    });

    it('Probes Media Details', async () => {
        const input = fs.createReadStream(target);
        const videoInfo = (await probeInfo(input))[0];
        expect(videoInfo.type).to.equal("video")
        expect(videoInfo.codec).to.equal("vp8")
        expect(videoInfo.width).to.equal(1920);
        expect(videoInfo.height).to.equal(1080);
    });
});