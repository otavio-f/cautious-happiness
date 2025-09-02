'use strict';

const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'dev';
const files = {
    house: path.join(__dirname, 'Plano_de_una_casa.webm'),
    tree: path.join(__dirname, 'family_tree.png'),
    haha: path.join(__dirname, 'haha.webm'),
    kfm: path.join(__dirname, 'kfm.sff'),
    mpeg7: path.join(__dirname, 'mpeg7.xml'),
    serval: path.join(__dirname, 'serval.jpg')
}

const output = path.join(__dirname, 'output');
process.env.TEMP_DIR = output;

const cleanUpTestOutputDir = () => {
    fs.readdirSync(output).forEach(file => {
        if(file === '.gitkeep')
            return;
        fs.rmSync(path.join(output, file));
    });
}

module.exports = { files, output, cleanUpTestOutputDir };
