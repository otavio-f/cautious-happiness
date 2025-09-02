# Bulk Storage

This is a storage engine for encrypted files

![Diagram](./docs/File%20Structure/Bulk%20Storage.svg)

## Table of Contents

Indexes all the contents of the Bulk Storage.
The *Table of Contents* is encrypted with an asymmetric RSA SHA-256 key.

## Storage

Each file is encrypted with a symmetric private key then stored into the *Bulk Storage* and indexed on a central *Table of Contents*

## Retrieval

The engine retrieves the start and end point from the *Table of Contents*
and decrypts the files in real time.

## TODOs

- [x] Storage indexing and retrieval;
- [x] Encryption;
- [x] Table of Content encryption and decryption;
- [x] Mark as deleted;
- [ ] *Purge* (remove files marked as deleted, tidy up the bulk file);
- [ ] Parallel operations (multiple reads+one add / single *purge*); 
- [ ] More detailed events;
- [ ] File resilience (against forced engine shutdown, r/w exceptions); 
