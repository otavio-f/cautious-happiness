'use strict';

process.env.NODE_ENV = 'dev';

const { expect } = require('chai');
const { parseQuery } = require('../../services/MediaSearch.js');


describe('Invalid Queries', function() {
    it('Empty query', () => {
        expect(parseQuery("")).to.be.null;
        expect(parseQuery(" ")).to.be.null;
        expect(parseQuery("^")).to.be.null;
        expect(parseQuery(" | ")).to.be.null;
        expect(parseQuery(" { } ")).to.be.null;
        expect(parseQuery(" ^ -{} ")).to.be.null;
    });

    it('Unbalanced curly brackets', () => {
        expect(parseQuery("{abc}}")).to.be.null;
        expect(parseQuery("a}{b")).to.be.null;
        expect(parseQuery("{abc}} } {ab -c}")).to.be.null;
        expect(parseQuery("c{{c")).to.be.null;
    });

    it('Invalid search separators', () => {
        expect(parseQuery("a||b")).to.be.null;
        expect(parseQuery("a | ^ c")).to.be.null;
        expect(parseQuery("a | b | {} | {c}")).to.be.null;
        expect(parseQuery("^|c")).to.be.null;
    });

    it('Lone negation', () => {
        expect(parseQuery("a - b")).to.be.null;
        expect(parseQuery("a ---------- b")).to.be.null;
    });

    it('Invalid metatag', () => {
        expect(parseQuery("ab>>m")).to.be.null;
        expect(parseQuery("-a=>b")).to.be.null;
        expect(parseQuery("a=<b")).to.be.null;
        expect(parseQuery("-a:b===c")).to.be.null;
        expect(parseQuery("-a<>A a:b>c")).to.be.null;
        expect(parseQuery("-z>c ^ a:b>>c")).to.be.null;
    });

    it('Truncated metatag', () => {
        expect(parseQuery("ab>")).to.be.null;
        expect(parseQuery("-<=c")).to.be.null;
        expect(parseQuery("{ab>}c")).to.be.null;
        expect(parseQuery("{ab>=}c")).to.be.null;
    });

    it('Asterisk on metatag', () => {
        expect(parseQuery("ab>c* def")).to.be.null;
        expect(parseQuery("-*mm<c")).to.be.null;
        expect(parseQuery("eph:gss*a>31")).to.be.null;
        expect(parseQuery("*:mno=pq")).to.be.null;
    });

    it('Empty namespace', () => {
        expect(parseQuery("a:")).to.be.null;
        expect(parseQuery("m: ")).to.be.null;
        expect(parseQuery("cc:|")).to.be.null;
        expect(parseQuery("{ccd}:{eef}")).to.be.null;
    });

    it('Double colon on namespace', () => {
        expect(parseQuery("a::b")).to.be.null;
        expect(parseQuery("m:n:o ")).to.be.null;
        expect(parseQuery("s::cc:vm")).to.be.null;
    });
})